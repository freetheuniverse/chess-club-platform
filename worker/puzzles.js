import { Chess } from "chess.js";

const reply = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const fail = (message,status=400) => reply({error:message},status);
const randomId = () => crypto.randomUUID();
const ALLOWED_THEMES = new Set(["mix","fork","pin","skewer","discoveredAttack","doubleCheck","mateIn1","mateIn2","mateIn3","endgame","opening","middlegame","hangingPiece","defensiveMove","promotion","sacrifice","backRankMate","oneMove","short"]);
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
    const ply=Number(p.initialPly);
    if(!Number.isInteger(ply)||ply<0||ply>chess.history().length)throw Error("Lichess game has unexpected move count");
    for(let i=chess.history().length;i>ply;i--)chess.undo();
  }
  const startFen=chess.fen();
  for(const m of p.solution)applyUci(chess,m);
  return startFen;
}
async function getLichess(url) {
  const res=await fetch(url,{
    headers:{Accept:"application/json","User-Agent":"ChessClubPlatform/0.1 (club puzzle assignments)"},
    signal:AbortSignal.timeout(15000)
  });
  if(res.status===429)throw Object.assign(Error("Lichess is rate-limiting requests. Wait one minute before trying again."),{status:429});
  if(res.status===401 || res.status===403)throw Object.assign(Error("Lichess did not allow this puzzle request; try assigning a specific public puzzle ID instead."),{status:502});
  if(!res.ok)throw Object.assign(Error("Lichess puzzle request failed (HTTP "+res.status+")."),{status:502});
  return res.json();
}
function sanitizedPuzzle(item){
  const p=item?.puzzle;
  if(!p || !/^[a-zA-Z0-9]{5}$/.test(p.id||""))throw Error("Lichess returned an invalid puzzle ID");
  return {lichess_id:p.id, rating:Number(p.rating)||0, themes:JSON.stringify(p.themes||[]),
    start_fen:createStartFen(item),solution_json:JSON.stringify(p.solution)};
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
  const manual=String(payload.puzzle_ids||"").trim().split(/[\s,;]+/).filter(Boolean);
  if(manual.length>10 || manual.some(id=>!/^[a-zA-Z0-9]{5}$/.test(id)))return fail("Use up to ten valid five-character Lichess puzzle IDs.");
  let raw;
  try{
    if(manual.length){
      raw=[];
      for(const id of [...new Set(manual)]) raw.push(await getLichess("https://lichess.org/api/puzzle/"+encodeURIComponent(id)));
    } else {
      const url=new URL("https://lichess.org/api/puzzle/batch/"+theme);
      url.searchParams.set("nb",String(number));
      url.searchParams.set("difficulty",difficulty);
      const response=await getLichess(url.toString());
      raw=Array.isArray(response?.puzzles)?response.puzzles:[];
    }
  }catch(e){return fail(e.message,e.status||502);}
  let puzzles;
  try{
    const seen=new Set();
    puzzles=raw.map(sanitizedPuzzle).filter(p=>{
      if(seen.has(p.lichess_id))return false;
      seen.add(p.lichess_id);return true;
    });
  }catch(e){return fail("Could not prepare puzzle positions: "+e.message,502);}
  if(!puzzles.length)return fail("Lichess did not return usable puzzles. Try another theme.",502);
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
