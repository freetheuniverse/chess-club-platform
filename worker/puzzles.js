import { Chess } from "chess.js";

const reply = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const fail = (message,status=400,details={}) => reply({error:message,...details},status);
const randomId = () => crypto.randomUUID();
const ALLOWED_THEMES = new Set(["mix","fork","pin","skewer","discoveredAttack","doubleCheck","mateIn1","mateIn2","mateIn3","endgame","opening","middlegame","hangingPiece","defensiveMove","promotion","sacrifice","backRankMate","oneMove","short","attraction","arabianMate","anastasiaMate","bodenMate","doubleBishopMate","dovetailMate","hookMate","smotheredMate","mateIn4","mateIn5","zugzwang","pawnEndgame","rookEndgame","queenEndgame","queenRookEndgame","bishopEndgame","knightEndgame","advancedPawn","attackingF2F7","xRayAttack","deflection","trappedPiece","interference","capturingDefender","clearance","exposedKing","kingsideAttack","queensideAttack","quietMove","enPassant","underPromotion","castling","crushing","advantage","equality","master","veryLong","long","Sicilian_Defense","French_Defense","Ruy_Lopez","Italian_Game","Caro-Kann_Defense","Queens_Gambit_Declined","English_Opening","Scotch_Game"]);
const ALLOWED_DIFFICULTIES = new Set(["easiest","easier","normal","harder","hardest"]);
const isDate = value => value==null || value==="" || (typeof value==="string" && /^\d{4}-\d\d-\d\d$/.test(value) && !Number.isNaN(Date.parse(value+"T12:00:00Z")));
const encodeMove = move => move.from + move.to + (move.promotion||"");
function applyUci(chess,move) {
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))throw Error("Invalid UCI chess move");
  const args={from:move.slice(0,2),to:move.slice(2,4)};
  // Lichess UCI carries a promotion piece only for pawn promotions.
  // Passing promotion:"q" for ordinary moves causes chess.js to reject
  // otherwise legal knight/bishop/rook/king/pawn moves.
  if(move.length===5)args.promotion=move[4];
  return chess.move(args);
}
function createStartFen(item){
  const p=item?.puzzle;
  if(!p || !Array.isArray(p.solution) || p.solution.length===0 || p.solution.length>30)throw Error("Lichess did not return a valid solution");
  let chess;
  if(p.fen)chess=new Chess(p.fen);
  else {
    chess=new Chess();
    if(!item?.game?.pgn)throw Error("Lichess did not provide a replayable position");
    chess.loadPgn(item.game.pgn);
    // Lichess initialPly is the ZERO-BASED index of the final setup move,
    // not the number of moves to keep. That last opponent move is included
    // in game.pgn and must be shown before the student attempts a solution.
    // Example: initialPly=52 means the puzzle begins after 53 half-moves.
    const lastSetupIndex=Number(p.initialPly);
    const totalMoves=chess.history().length;
    if(!Number.isInteger(lastSetupIndex)||lastSetupIndex<0||lastSetupIndex+1>totalMoves)
      throw Error("Lichess game has an unexpected move count");
    for(let i=totalMoves;i>lastSetupIndex+1;i--)chess.undo();
  }
  const startFen=chess.fen();
  for(const m of p.solution)applyUci(chess,m);
  return startFen;
}
const COOLDOWN_SECONDS=60;
async function bankReady(db){
 return !!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='puzzle_bank'").first());
}
async function getLichess(url,db){
 // Persist the cooldown across Worker isolates so new visitors do not immediately
 // retry a provider that is already replying 429.
 const useCooldown=await bankReady(db);
 const blocked=useCooldown?await db.prepare("SELECT blocked_until FROM lichess_rate_state WHERE name='lichess'").first():null;
 const now=Math.floor(Date.now()/1000);
 if(blocked && blocked.blocked_until>now){
   const left=Math.max(1,blocked.blocked_until-now);
   throw Object.assign(Error("Lichess is temporarily limiting puzzle requests. Cached puzzles can still be used. Try again in about "+left+" seconds."),{
     status:429,retry_after_seconds:left
   });
 }
 const response=await fetch(url,{
   headers:{Accept:"application/json","User-Agent":"ChessClubPlatform/0.1 (club puzzle assignments)"},
   signal:AbortSignal.timeout(15000)
 });
 if(response.status===429){
   const seconds=Math.max(COOLDOWN_SECONDS,Math.min(300,Number.parseInt(response.headers.get("Retry-After")||"60",10)||60));
   if(useCooldown)await db.prepare("INSERT INTO lichess_rate_state(name,blocked_until) VALUES('lichess',?) "+
     "ON CONFLICT(name) DO UPDATE SET blocked_until=max(lichess_rate_state.blocked_until,excluded.blocked_until)")
     .bind(now+seconds).run();
   throw Object.assign(Error("Lichess is temporarily rate-limiting new puzzles. Try again in about "+seconds+" seconds, or choose a cached topic."),{
     status:429,retry_after_seconds:seconds
   });
 }
 if(response.status===401 || response.status===403)
   throw Object.assign(Error("Lichess refused this puzzle request. Try another public puzzle ID."),{status:502});
 if(!response.ok)
   throw Object.assign(Error("Lichess puzzle request failed (HTTP "+response.status+")."),{status:502});
 return response.json();
}

function sanitizedPuzzle(item){
  const p=item?.puzzle;
  if(!p || !/^[a-zA-Z0-9]{5}$/.test(p.id||""))throw Error("Lichess returned an invalid puzzle ID");
  let startFen;
  try { startFen=createStartFen(item); }
  catch (cause) {
    console.error("Lichess puzzle position validation failed", {
      puzzleId:p.id, initialPly:p.initialPly,
      gameMoveCount:item?.game?.pgn?.trim().split(/\s+/).length,
      hasFen:!!p.fen, message:String(cause?.message||cause)
    });
    throw Error("Lichess puzzle "+p.id+" has an invalid starting position: "+String(cause?.message||cause));
  }
  return {lichess_id:p.id, rating:Number(p.rating)||0, themes:JSON.stringify(p.themes||[]),
    start_fen:startFen,solution_json:JSON.stringify(p.solution)};
}
// Only moderators receive a preview that contains the solution. The client
// never exposes this preview to student accounts.
function previewResultFromBank(row){
 return {
   id:row.lichess_id,lichess_id:row.lichess_id,rating:Number(row.rating)||0,
   themes:JSON.parse(row.themes),start_fen:row.start_fen,
   solution:JSON.parse(row.solution_json),game_id:row.game_id||null
 };
}
async function puzzlePreview(db,club,user,payload){
 const theme=String(payload?.theme||"mix"),difficulty=String(payload?.difficulty||"normal");
 const count=Number(payload?.count||5);
 if(!ALLOWED_THEMES.has(theme)||!ALLOWED_DIFFICULTIES.has(difficulty))
   return fail("Select a supported topic and difficulty.");
 if(!Number.isInteger(count)||count<1||count>10)return fail("Choose 1–10 puzzles.");
 const ids=String(payload?.puzzle_ids||"").trim().split(/[\\s,;]+/).filter(Boolean);
 const excluded=Array.isArray(payload?.exclude_ids)?payload.exclude_ids:[];
 if(ids.length>10||ids.some(id=>!/^[a-zA-Z0-9]{5}$/.test(id)))
   return fail("Use up to ten valid five-character Lichess puzzle IDs.");
 if(excluded.length>10||excluded.some(id=>typeof id!=="string"||!/^[a-zA-Z0-9]{5}$/.test(id)))
   return fail("Invalid excluded puzzle IDs.");
 if(!(await bankReady(db)))
   return fail("Puzzle previews require database migration 0006. Run npm run db:migrate:cloud.",503);
 const excludedSet=new Set(excluded);
 const prepared=[];
 const used=new Set(excluded);
 // Prefer previously fetched public positions. This avoids upstream calls
 // when the teacher regenerates or assigns similar material.
 if(ids.length){
   for(const id of [...new Set(ids)]){
     if(used.has(id))continue;
     const cached=await db.prepare("SELECT * FROM puzzle_bank WHERE lichess_id=?").bind(id).first();
     if(cached){prepared.push(previewResultFromBank(cached));used.add(id);}
   }
 }else{
   const rows=(await db.prepare(
     "SELECT * FROM puzzle_bank WHERE source_theme=? AND source_difficulty=? ORDER BY RANDOM() LIMIT 50"
   ).bind(theme,difficulty).all()).results;
   for(const row of rows){
     if(used.has(row.lichess_id))continue;
     prepared.push(previewResultFromBank(row));used.add(row.lichess_id);
     if(prepared.length>=count)break;
   }
 }
 const hadCache=prepared.length>0;
 let rateLimited=false,limitError=null;
 if(prepared.length<count){
   try{
     let raw=[];
     if(ids.length){
       // Fetch any explicit IDs not yet in our own bank. Exactly one request
       // runs at a time, honoring Lichess API guidance.
       for(const id of [...new Set(ids)]){
         if(used.has(id)||excludedSet.has(id))continue;
         raw.push(await getLichess("https://lichess.org/api/puzzle/"+encodeURIComponent(id),db));
       }
     }else{
       const url=new URL("https://lichess.org/api/puzzle/batch/"+encodeURIComponent(theme));
       url.searchParams.set("nb",String(Math.min(10,count+excluded.length)));
       url.searchParams.set("difficulty",difficulty);
       const response=await getLichess(url.toString(),db);
       raw=Array.isArray(response?.puzzles)?response.puzzles:[];
     }
     const newItems=[];
     for(const entry of raw){
       const p=sanitizedPuzzle(entry);
       if(used.has(p.lichess_id))continue;
       const gameId=entry?.game?.id;
       const obj={
         id:p.lichess_id,lichess_id:p.lichess_id,rating:p.rating,
         themes:JSON.parse(p.themes),start_fen:p.start_fen,
         solution:JSON.parse(p.solution_json),
         game_id:typeof gameId==="string"&&/^[a-zA-Z0-9]{8}$/.test(gameId)?gameId:null
       };
       newItems.push(obj);prepared.push(obj);used.add(p.lichess_id);
       if(prepared.length>=count)break;
     }
     if(newItems.length){
       await db.batch(newItems.map(p=>db.prepare(
         "INSERT OR IGNORE INTO puzzle_bank(lichess_id,source_theme,source_difficulty,rating,themes,start_fen,solution_json,game_id) VALUES(?,?,?,?,?,?,?,?)"
       ).bind(p.lichess_id,theme,difficulty,p.rating,JSON.stringify(p.themes),p.start_fen,JSON.stringify(p.solution),p.game_id)));
     }
   }catch(e){
     if(e.status===429){rateLimited=true;limitError=e;}
     else if(!prepared.length)return fail("Could not load new puzzles: "+e.message,e.status||502);
   }
 }
 if(!prepared.length){
   return fail(limitError?.message||"No puzzles are available for this topic. Try a different topic.",limitError?.status||404,{
     retry_after_seconds:limitError?.retry_after_seconds||null
   });
 }
 const selected=prepared.slice(0,count);
 const drafts=selected.map(p=>({...p,preview_id:randomId()}));
 await db.batch(drafts.map(p=>
   db.prepare("INSERT INTO puzzle_preview_drafts(id,lichess_id,club_id,user_id) VALUES(?,?,?,?)")
    .bind(p.preview_id,p.lichess_id,club,user.id)
 ));
 return reply({
   puzzles:drafts,cached:hadCache,
   warning:rateLimited?"Showing available cached puzzles. Lichess is temporarily limiting new requests.":null
 });
}

async function puzzleGameSource(db,club,role,user,assignmentId,itemId){
  const target=await db.prepare(
    "SELECT i.lichess_id FROM puzzle_assignment_items i "+
    "JOIN puzzle_assignments a ON a.id=i.assignment_id "+
    "WHERE i.id=? AND i.assignment_id=? AND a.club_id=?"
  ).bind(itemId,assignmentId,club).first();
  if(!target)return fail("Puzzle not found.",404);
  if(role!=="moderator"){
    const assigned=await db.prepare(
      "SELECT 1 FROM puzzle_assignment_members WHERE assignment_id=? AND user_id=?"
    ).bind(assignmentId,user.id).first();
    if(!assigned)return fail("Puzzle not assigned to you.",403);
    const done=await db.prepare(
      "SELECT solved_at FROM puzzle_member_progress WHERE item_id=? AND assignment_id=? AND user_id=?"
    ).bind(itemId,assignmentId,user.id).first();
    if(!done?.solved_at)return fail("Complete the puzzle before viewing its full game.",403);
  }
  let raw;
  try{raw=await getLichess("https://lichess.org/api/puzzle/"+encodeURIComponent(target.lichess_id),db);}
  catch(e){return fail(e.message,e.status||502);}
  const gameId=raw?.game?.id;
  if(typeof gameId!=="string"||!/^[a-zA-Z0-9]{8}$/.test(gameId))
    return fail("The original game is not available for this puzzle.",404);
  return reply({game_url:"https://lichess.org/"+gameId});
}
async function createAssignment(db, club, user, payload){
  const title=String(payload.title||"").trim();
  const theme=String(payload.theme||"mix"),difficulty=String(payload.difficulty||"normal");
  const dueDate=payload.due_date||null,number=Number(payload.count||5);
  if(title.length<3||title.length>100)return fail("Enter a title between 3 and 100 characters.");
  if(!ALLOWED_THEMES.has(theme)||!ALLOWED_DIFFICULTIES.has(difficulty))return fail("Select a supported theme and difficulty.");
  if(!isDate(dueDate))return fail("Invalid due date");
  if(!Number.isInteger(number)||number<1||number>10)return fail("Choose 1–10 puzzles per assignment.");
  const roster=(await db.prepare("SELECT user_id FROM memberships WHERE club_id=?").bind(club).all()).results.map(r=>r.user_id);
  const requested=Array.isArray(payload.user_ids)&&payload.user_ids.length?[...new Set(payload.user_ids)]:roster;
  if(!requested.length || requested.length>200)return fail("Select between 1 and 200 club members.");
  if(requested.some(id=>typeof id!=="string" || !roster.includes(id)))return fail("One or more selected members are not in this club.",403);
  // Publishing uses previously validated, owner-scoped preview tokens.
  // Never contact Lichess again for selected puzzles and never trust the
  // solution sent by the browser.
  const tokens=Array.isArray(payload.preview_ids)?payload.preview_ids:[];
  if(!tokens.length||tokens.length!==number||tokens.length>10||
     tokens.some(id=>typeof id!=="string"||!/^[a-f0-9-]{36}$/.test(id))||
     new Set(tokens).size!==tokens.length)
    return fail("Generate and review your puzzles before assigning them.");
  if(!(await bankReady(db)))
    return fail("Puzzle previews require database migration 0006. Run npm run db:migrate:cloud.",503);
  const placeholders=tokens.map(()=>"?").join(",");
  const records=(await db.prepare(
    "SELECT d.id AS preview_id,b.* FROM puzzle_preview_drafts d "+
    "JOIN puzzle_bank b ON b.lichess_id=d.lichess_id "+
    "WHERE d.club_id=? AND d.user_id=? "+
    "AND d.created_at >= datetime('now','-24 hours') "+
    "AND d.id IN ("+placeholders+")"
  ).bind(club,user.id,...tokens).all()).results;
  const byToken=new Map(records.map(p=>[p.preview_id,p]));
  if(byToken.size!==tokens.length)return fail("Some puzzle previews have expired. Generate fresh puzzles.",409);
  const puzzles=tokens.map(t=>byToken.get(t));
  if(new Set(puzzles.map(p=>p.lichess_id)).size!==puzzles.length)
    return fail("Each selected puzzle must be different.");

  const assignmentId=randomId();
  const statements=[db.prepare("INSERT INTO puzzle_assignments(id,club_id,title,theme,difficulty,due_date,created_by) VALUES(?,?,?,?,?,?,?)").bind(assignmentId,club,title,theme,difficulty,dueDate,user.id)];
  for(const memberId of requested)statements.push(db.prepare("INSERT INTO puzzle_assignment_members(assignment_id,user_id) VALUES(?,?)").bind(assignmentId,memberId));
  for(let i=0;i<puzzles.length;i++){
    const p=puzzles[i];
    statements.push(db.prepare("INSERT INTO puzzle_assignment_items(id,assignment_id,position,lichess_id,rating,themes,start_fen,solution_json) VALUES(?,?,?,?,?,?,?,?)")
      .bind(randomId(),assignmentId,i+1,p.lichess_id,p.rating,p.themes,p.start_fen,p.solution_json));
  }
  await db.batch(statements);
  return reply({id:assignmentId,puzzles:puzzles.length,members:requested.length},201);
}
async function listAssignments(db,club,user,role){
  const rows=(await db.prepare(`SELECT a.id,a.title,a.theme,a.difficulty,a.due_date,a.created_at,
    (SELECT count(*) FROM puzzle_assignment_items WHERE assignment_id=a.id) puzzles,
    (SELECT count(*) FROM puzzle_assignment_members WHERE assignment_id=a.id) members,
    (SELECT count(*) FROM puzzle_member_progress WHERE assignment_id=a.id AND solved_at IS NOT NULL) solved,
    (SELECT count(*) FROM puzzle_member_progress WHERE assignment_id=a.id AND user_id=? AND solved_at IS NOT NULL) my_solved
    FROM puzzle_assignments a WHERE a.club_id=? AND (?='moderator' OR EXISTS(
      SELECT 1 FROM puzzle_assignment_members m WHERE m.assignment_id=a.id AND m.user_id=?
    )) ORDER BY a.created_at DESC`).bind(user.id,club,role,user.id).all()).results;
  return reply({assignments:rows,role});
}
async function assignmentDetail(db,club,role,user,id){
  const a=await db.prepare("SELECT * FROM puzzle_assignments WHERE id=? AND club_id=?").bind(id,club).first();
  if(!a)return null;
  const targeted=await db.prepare("SELECT 1 FROM puzzle_assignment_members WHERE assignment_id=? AND user_id=?").bind(id,user.id).first();
  if(role!=="moderator"&&!targeted)return null;
  const items=(await db.prepare(`SELECT i.id,i.lichess_id,i.position,i.rating,i.themes,i.start_fen,
    p.played_json,p.mistakes,p.solved_at FROM puzzle_assignment_items i
    LEFT JOIN puzzle_member_progress p ON p.item_id=i.id AND p.user_id=?
    WHERE i.assignment_id=? ORDER BY i.position`).bind(user.id,id).all()).results;
  const result={assignment:{id:a.id,title:a.title,theme:a.theme,difficulty:a.difficulty,due_date:a.due_date},items:items.map(i=>({
    id:i.id,lichess_id:i.lichess_id,position:i.position,rating:i.rating,themes:JSON.parse(i.themes||"[]"),
    start_fen:i.start_fen,played:JSON.parse(i.played_json||"[]"),mistakes:i.mistakes||0,solved:!!i.solved_at
  })),canSolve:!!targeted};
  if(role==="moderator"){
    result.summary=(await db.prepare(`SELECT u.id,u.name,
      (SELECT count(*) FROM puzzle_member_progress p WHERE p.assignment_id=? AND p.user_id=u.id AND p.solved_at IS NOT NULL) solved,
      (SELECT coalesce(sum(mistakes),0) FROM puzzle_member_progress p WHERE p.assignment_id=? AND p.user_id=u.id) mistakes
      FROM puzzle_assignment_members m JOIN users u ON u.id=m.user_id WHERE m.assignment_id=? ORDER BY u.name`)
      .bind(id,id,id).all()).results;
  }
  return result;
}
async function verifyMove(db,club,user,aid,itemId,body){
  const target=await db.prepare("SELECT 1 FROM puzzle_assignment_members WHERE assignment_id=? AND user_id=?").bind(aid,user.id).first();
  if(!target)return fail("This assignment has not been given to your account.",403);
  const item=await db.prepare(`SELECT i.* FROM puzzle_assignment_items i
    JOIN puzzle_assignments a ON a.id=i.assignment_id WHERE i.id=? AND i.assignment_id=? AND a.club_id=?`)
    .bind(itemId,aid,club).first();
  if(!item)return fail("Puzzle not found",404);
  const progress=await db.prepare("SELECT * FROM puzzle_member_progress WHERE assignment_id=? AND item_id=? AND user_id=?")
    .bind(aid,itemId,user.id).first();
  if(progress?.solved_at)return reply({correct:true,solved:true,played:JSON.parse(progress.played_json),mistakes:progress.mistakes});
  const solution=JSON.parse(item.solution_json),played=JSON.parse(progress?.played_json||"[]");
  const uci=String(body?.move||"").toLowerCase();
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))return fail("Invalid chess move.");
  if(solution[played.length]!==uci){
    const mistakes=(progress?.mistakes||0)+1;
    await db.prepare(`INSERT INTO puzzle_member_progress(assignment_id,item_id,user_id,played_json,mistakes)
      VALUES(?,?,?,'[]',1) ON CONFLICT(assignment_id,item_id,user_id) DO UPDATE SET mistakes=mistakes+1`)
      .bind(aid,itemId,user.id).run();
    return reply({correct:false,solved:false,mistakes,played});
  }
  played.push(uci);
  if(played.length<solution.length){played.push(solution[played.length]);}
  const solved=played.length===solution.length, now=solved?new Date().toISOString():null;
  await db.prepare(`INSERT INTO puzzle_member_progress(assignment_id,item_id,user_id,played_json,mistakes,solved_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(assignment_id,item_id,user_id) DO UPDATE
    SET played_json=excluded.played_json,solved_at=excluded.solved_at`)
    .bind(aid,itemId,user.id,JSON.stringify(played),progress?.mistakes||0,now).run();
  return reply({correct:true,solved,mistakes:progress?.mistakes||0,played});
}
export async function handlePuzzleRequest({db,club,user,role,path,method,req}){
  try {
    const key=path[4],id=path[5];
    if(key==="preview" && path.length===5 && method==="POST"){
      if(role!=="moderator")return fail("Only moderators can preview solutions.",403);
      return puzzlePreview(db,club,user,await req.json());
    }
    if(key!=="assignments")return fail("Puzzle endpoint not found.",404);
    if(path.length===5 && method==="GET")return listAssignments(db,club,user,role);
    if(path.length===5 && method==="POST"){
      if(role!=="moderator")return fail("Only moderators can assign puzzles.",403);
      return createAssignment(db,club,user,await req.json());
    }
    if(path.length===6 && method==="GET"){
      const assignment=await assignmentDetail(db,club,role,user,id);
      return assignment?reply(assignment):fail("Assignment not found",404);
    }
    if(path.length===8 && path[6]==="items" && method==="POST"){
      return verifyMove(db,club,user,id,path[7],await req.json());
    }
    if(path.length===8 && path[6]==="source" && method==="GET")
      return puzzleGameSource(db,club,role,user,id,path[7]);
    return fail("Puzzle endpoint not found.",404);
  }catch(e){
    console.error("Puzzle API error",e);
    if(/no such table|no such column/i.test(String(e?.message||""))){
      return fail("The online puzzle database needs its migration. Run npm run db:migrate:cloud once from your project folder.",503);
    }
    return fail("Could not complete puzzle request. Check Worker logs.",500);
  }
}

// Exposed for offline validation of imported Lichess puzzle positions.
export { createStartFen, sanitizedPuzzle };
