import {guestSchemaReady,tournamentPlayers,tournamentGames,newGameBindings,insertGuests,normalizeGuestNames} from "./tournaments.js";
import { handlePuzzleRequest } from "./puzzles.js";
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const error = (message, status = 400) => json({ error: message }, status);
const uid = () => crypto.randomUUID();
const today = () => { const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Belize",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day; };
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
async function digest(value) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }

// Production Workers reject PBKDF2 requests above 100,000 iterations.
// Run three domain-separated 100k rounds sequentially instead of one unsupported
// 210k round. This is a versioned chained KDF, not standard 300k-round PBKDF2.
// Move to a managed identity service or reviewed password KDF before public launch.
const PASSWORD_SCHEME = "pbkdf2-chain-v2";
const PASSWORD_ROUNDS = 3;
const PBKDF2_ITERATIONS = 100000;
async function derivePbkdf2(material, salt, iterations=PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
    key, 256
  ));
}
async function passwordHash(password, salt) {
  let material = new TextEncoder().encode(password);
  for (let round=1; round<=PASSWORD_ROUNDS; round++) {
    material = await derivePbkdf2(material, PASSWORD_SCHEME + ":" + salt + ":" + round);
  }
  return hex(material);
}
async function makePassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return PASSWORD_SCHEME + ":" + salt + ":" + await passwordHash(password, salt);
}
function equalHex(a,b) {
  if (typeof a!=="string" || typeof b!=="string" || a.length!==b.length) return false;
  let delta=0;
  for(let i=0;i<a.length;i++)delta |= a.charCodeAt(i)^b.charCodeAt(i);
  return delta===0;
}
async function verifyPassword(password, stored) {
  if(typeof stored!=="string")return false;
  const parts=stored.split(":");
  if(parts.length===3 && parts[0]===PASSWORD_SCHEME) {
    const [,salt,hashed]=parts;
    if(!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(hashed))return false;
    return equalHex(await passwordHash(password,salt),hashed);
  }
  // Compatibility for local development accounts created before this fix.
  if(parts.length===2) {
    const [salt,hashed]=parts;
    if(!salt || !/^[a-f0-9]{64}$/.test(hashed))return false;
    return equalHex(hex(await derivePbkdf2(new TextEncoder().encode(password),salt,210000)),hashed);
  }
  return false;
}
function cookie(name, value, maxAge) { return name + "=" + value + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + maxAge; }
async function sessionUser(req, db) {
  const token = req.headers.get("Cookie")?.match(/(?:^|;\s*)chess_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await db.prepare("SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").bind(await digest(token)).first();
}
async function issueSession(user, db) {
  const token = uid() + uid();
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(await digest(token), user.id).run();
  const response = json({ user });
  response.headers.set("Set-Cookie", cookie("chess_session", token, 2592000));
  return response;
}
const validDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
async function member(db, club, user) {
  return await db.prepare("SELECT role FROM memberships WHERE club_id=? AND user_id=?").bind(club,user.id).first();
}
async function moderator(db, club, user) { const m = await member(db,club,user); return m?.role === "moderator"; }
async function body(req) { try { return await req.json(); } catch { return {}; } }
async function recordAttendance(db, club, tournament, players) {
  // One record per student, club and date, even if a second tournament occurs.
  if (tournament.event_date > today()) return;
  for (const id of players) {
    await db.prepare("INSERT OR IGNORE INTO attendance(club_id,user_id,event_date,first_tournament_id) VALUES(?,?,?,?)").bind(club,id,tournament.event_date,tournament.id).run();
  }
}
async function standings(db,tournament) {
  const ready=await guestSchemaReady(db);
  const players=await tournamentPlayers(db,tournament,ready);
  const games=await tournamentGames(db,tournament,ready);
  const scores = new Map(players.map(p => [p.id,{...p,points:0,played:0,opponents:[]}]));
  for (const g of games) {
    if (!g.result) continue;
    const w=scores.get(g.white_id), b=scores.get(g.black_id);
    if (!w) continue;
    w.points += g.result==="1-0" || g.result==="bye" ? 1 : g.result==="1/2-1/2" ? 0.5 : 0;
    if (g.result!=="bye") { w.played++; if(b) {b.played++; b.points += g.result==="0-1" ? 1 : g.result==="1/2-1/2" ? 0.5 : 0; w.opponents.push(b.id); b.opponents.push(w.id);} }
  }
  return [...scores.values()].sort((a,b)=>b.points-a.points || a.name.localeCompare(b.name));
}
function pairPlayers(ranked, previousGames, previousByes) {
  const pool = [...ranked], pairs=[];
  if (pool.length%2===1) {
    // Prefer a player who has never received a bye, starting at the lowest score.
    const index=[...pool].map((p,i)=>({p,i})).reverse().find(x=>!previousByes.has(x.p.id))?.i ?? pool.length-1;
    const [bye]=pool.splice(index,1);pairs.push({white_id:bye.id,black_id:null,result:"bye"});
  }
  while(pool.length) {
    const a=pool.shift();
    let idx=pool.findIndex(b=>!previousGames.has([a.id,b.id].sort().join(":")));
    if(idx<0)idx=0;
    const b=pool.splice(idx,1)[0];
    pairs.push({white_id:a.id,black_id:b.id,result:null});
  }
  return pairs;
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url), path=url.pathname.split("/").filter(Boolean), method=req.method;
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!env.DB) return error("Database binding missing. Configure D1 before running.", 503);
    if (!["GET","POST","DELETE"].includes(method)) return error("Method not allowed",405);
    if (method!=="GET") {
      const origin=req.headers.get("Origin");
      if (origin && origin!==url.origin) return error("Invalid request origin",403);
      if (method==="POST" && !req.headers.get("Content-Type")?.startsWith("application/json")) return error("Expected JSON",415);
    }
    const db=env.DB;
    try {
      if (path[1]==="health" && method==="GET") {
        // Safe public check: confirms the schema exists without exposing user data.
        await db.prepare("SELECT id FROM users LIMIT 1").first();
        await db.prepare("SELECT token_hash FROM sessions LIMIT 1").first();
        const puzzleTable=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='puzzle_assignments'").first();
        return json({status:"ready",database:"ready",puzzles:puzzleTable?"ready":"migration_required"});
      }
      if (path[1]==="auth" && path[2]==="register" && method==="POST") {
        const b=await body(req), name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
        if(name.length<2 || name.length>100 || !/^\S+@\S+\.\S+$/.test(email) || password.length<10 || password.length>200) return error("Enter a name, valid email and password of at least 10 characters.");
        if(await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return error("Email already registered",409);
        const user={id:uid(),name,email};
        await db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)").bind(user.id,name,email,await makePassword(password)).run();
        return issueSession(user,db);
      }
      if (path[1]==="auth" && path[2]==="login" && method==="POST") {
        const b=await body(req), email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
        const u=await db.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
        if(!u || !(await verifyPassword(password,u.password_hash)))return error("Incorrect email or password",401);
        return issueSession({id:u.id,name:u.name,email:u.email},db);
      }
      const user=await sessionUser(req,db);
      if (!user) return error("Please sign in",401);
      if(path[1]==="auth" && path[2]==="me" && method==="GET")return json({user});
      if(path[1]==="auth" && path[2]==="logout" && method==="POST") {
        const token=req.headers.get("Cookie")?.match(/(?:^|;\s*)chess_session=([^;]+)/)?.[1];
        if(token)await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
        const r=json({ok:true});r.headers.set("Set-Cookie",cookie("chess_session","",0));return r;
      }
      if(path[1]==="clubs" && path.length===2 && method==="GET") {
        const clubs=(await db.prepare("SELECT c.id,c.name,c.join_code,m.role,(SELECT count(*) FROM memberships WHERE club_id=c.id) members FROM clubs c JOIN memberships m ON c.id=m.club_id WHERE m.user_id=? ORDER BY c.name").bind(user.id).all()).results;
        return json({clubs:clubs.map(c=>({...c,join_code:c.role==="moderator"?c.join_code:null}))});
      }
      if(path[1]==="clubs" && path[2]==="create" && method==="POST") {
        const b=await body(req),name=String(b.name||"").trim();
        if(name.length<3 || name.length>100)return error("Club name must be 3–100 characters");
        const id=uid(),code=uid().replaceAll("-","").slice(0,9).toUpperCase();
        await db.batch([
          db.prepare("INSERT INTO clubs(id,name,join_code,created_by) VALUES(?,?,?,?)").bind(id,name,code,user.id),
          db.prepare("INSERT INTO memberships(club_id,user_id,role) VALUES(?,?,'moderator')").bind(id,user.id)
        ]);
        return json({id,join_code:code},201);
      }
      if(path[1]==="clubs" && path[2]==="join" && method==="POST") {
        const b=await body(req),code=String(b.code||"").trim().toUpperCase();
        const club=await db.prepare("SELECT id,name FROM clubs WHERE join_code=?").bind(code).first();
        if(!club)return error("Join code not found",404);
        await db.prepare("INSERT OR IGNORE INTO memberships(club_id,user_id,role) VALUES(?,?,'student')").bind(club.id,user.id).run();
        return json({club});
      }
      if(path[1]==="clubs" && path[2] && path.length>=3) {
        const club=path[2],role=await member(db,club,user);
        if(!role)return error("Not a member of this club",403);
        if(path[3]==="puzzles")return handlePuzzleRequest({db,club,user,role:role.role,path,method,req});

        // Club message board. Only moderators may publish or manage posts;
        // all authenticated club members may read them via the club overview.
        if(path[3]==="messages") {
          if(role.role!=="moderator")return error("Only club moderators can manage announcements",403);
          const ready=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='club_messages'").first();
          if(!ready)return error("The message board needs migration 0003. Run npm run db:migrate:cloud.",503);
          if(path.length===4 && method==="POST"){
            const b=await body(req);
            const title=String(b.title??"").trim(),message=String(b.message??"").trim();
            if(title.length<3||title.length>100)return error("Title must be 3–100 characters");
            if(message.length<1||message.length>2000)return error("Message must be 1–2,000 characters");
            const id=uid();
            await db.prepare("INSERT INTO club_messages(id,club_id,author_id,title,body) VALUES(?,?,?,?,?)")
              .bind(id,club,user.id,title,message).run();
            return json({id},201);
          }
          if(path.length===5 && method==="DELETE"){
            const outcome=await db.prepare("DELETE FROM club_messages WHERE id=? AND club_id=?")
              .bind(path[4],club).run();
            if(!outcome.meta?.changes)return error("Message not found",404);
            return json({ok:true});
          }
          if(path.length===6 && path[5]==="pin" && method==="POST"){
            const outcome=await db.prepare("UPDATE club_messages SET is_pinned=CASE WHEN is_pinned=1 THEN 0 ELSE 1 END WHERE id=? AND club_id=?")
              .bind(path[4],club).run();
            if(!outcome.meta?.changes)return error("Message not found",404);
            return json({ok:true});
          }
          return error("Message board endpoint not found",404);
        }
        if(path.length===3 && method==="GET") {
          const c=await db.prepare("SELECT id,name,join_code FROM clubs WHERE id=?").bind(club).first();
          const members=(await db.prepare("SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=? ORDER BY u.name").bind(club).all()).results;
          const guestReady=await guestSchemaReady(db);
          const countSql=guestReady?
            "SELECT t.*, ((SELECT count(*) FROM tournament_players p WHERE p.tournament_id=t.id) + "+
            "(SELECT count(*) FROM tournament_guests g WHERE g.tournament_id=t.id)) player_count "+
            "FROM tournaments t WHERE t.club_id=? ORDER BY event_date DESC,created_at DESC":
            "SELECT t.*, (SELECT count(*) FROM tournament_players p WHERE p.tournament_id=t.id) player_count "+
            "FROM tournaments t WHERE t.club_id=? ORDER BY event_date DESC,created_at DESC";
          const tournaments=(await db.prepare(countSql).bind(club).all()).results;
          const attendance=(await db.prepare("SELECT a.user_id,u.name,a.event_date FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.club_id=? ORDER BY event_date DESC LIMIT 500").bind(club).all()).results;
          const puzzles=(await db.prepare("SELECT user_id,count(*) attempts,sum(correct) correct FROM puzzle_attempts WHERE club_id=? GROUP BY user_id").bind(club).all()).results;
          const boardReady=!!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='club_messages'").first());
          const messages=boardReady?(await db.prepare(
            "SELECT m.id,m.title,m.body,m.is_pinned,m.created_at,u.name author_name "+
            "FROM club_messages m JOIN users u ON u.id=m.author_id WHERE m.club_id=? "+
            "ORDER BY m.is_pinned DESC,m.created_at DESC,m.id DESC LIMIT 30"
          ).bind(club).all()).results:[];
          return json({club:{...c,join_code:role.role==="moderator"?c.join_code:null},role:role.role,members,tournaments,attendance,puzzles,messages,board_ready:boardReady,guest_ready:guestReady});
        }
        if(path[3]==="tournaments" && path.length===4 && method==="POST") {
          if(role.role!=="moderator")return error("Moderator access required",403);
          const b=await body(req),title=String(b.title||"").trim(),date=b.event_date;
          if(title.length<3 || title.length>100 || !validDate(date))return error("Enter a tournament name and valid date");
          const id=uid();
          await db.prepare("INSERT INTO tournaments(id,club_id,title,event_date) VALUES(?,?,?,?)").bind(id,club,title,date).run();
          return json({id},201);
        }
        if(path[3]==="tournaments" && path[4]) {
          const tid=path[4],t=await db.prepare("SELECT * FROM tournaments WHERE id=? AND club_id=?").bind(tid,club).first();
          if(!t)return error("Tournament not found",404);
          const guestReady=await guestSchemaReady(db);
          if(path.length===5 && method==="GET"){
            const players=await tournamentPlayers(db,tid,guestReady);
            const rounds=(await db.prepare("SELECT * FROM rounds WHERE tournament_id=? ORDER BY round_number").bind(tid).all()).results;
            const games=await tournamentGames(db,tid,guestReady);
            return json({tournament:t,players,rounds,games,standings:await standings(db,tid),guest_ready:guestReady});
          }
          if(role.role!=="moderator")return error("Moderator access required",403);
          if(path.length===5 && method==="DELETE"){
            // Cascading delete removes game results, rounds, membership in this
            // tournament and guest entrants. Club-level attendance is retained.
            await db.prepare("DELETE FROM tournaments WHERE id=? AND club_id=?").bind(tid,club).run();
            return json({ok:true});
          }
          if(path[5]==="guests" && path.length===6 && method==="POST"){
            if(!guestReady)return error("Guest players require migration 0004. Run npm run db:migrate:cloud.",503);
            if(t.status!=="draft")return error("Guest players can be added before the first round.",409);
            const b=await body(req);
            let names;
            try{names=normalizeGuestNames(b.names);}catch(e){return error(e.message,400);}
            try{
              const count=await insertGuests(db,tid,names);
              return json({ok:true,added:count});
            }catch(e){
              if(/128 guest players/.test(e.message))return error(e.message,400);
              if(/UNIQUE constraint failed/i.test(e.message))return error("A guest with that name already exists.",409);
              throw e;
            }
          }
          if(path[5]==="guests" && path.length===7 && method==="DELETE"){
            if(!guestReady)return error("Guest players require migration 0004.",503);
            if(t.status!=="draft")return error("Guests can only be removed before the first round.",409);
            const removed=await db.prepare("DELETE FROM tournament_guests WHERE id=? AND tournament_id=?")
              .bind(path[6],tid).run();
            if(!removed.meta?.changes)return error("Guest player not found",404);
            return json({ok:true});
          }
          if(path[5]==="players" && path.length===6 && method==="POST"){
            if(t.status==="completed")return error("Tournament completed",409);
            if(t.status==="active")return error("Finish the tournament before changing its roster",409);
            const b=await body(req),ids=[...new Set(Array.isArray(b.user_ids)?b.user_ids:[])].filter(x=>typeof x==="string");
            if(ids.length===0)return error("Select club members");
            for(const id of ids) {
              if(!(await member(db,club,{id})))return error("Selected user is not a club member",400);
              await db.prepare("INSERT OR IGNORE INTO tournament_players(tournament_id,user_id) VALUES(?,?)").bind(tid,id).run();
            }
            await recordAttendance(db,club,t,ids);
            return json({ok:true});
          }
          if(path[5]==="rounds" && path.length===6 && method==="POST"){
            if(t.status==="completed")return error("Tournament completed",409);
            const games=await tournamentGames(db,tid,guestReady);
            if(games.some(g=>!g.result))return error("Enter all game results before starting another round",409);
            const ranked=await standings(db,tid);
            if(ranked.length<2)return error("Add at least two participants",400);
            const seen=new Set(games.filter(g=>g.black_id).map(g=>[g.white_id,g.black_id].sort().join(":")));
            const byes=new Set(games.filter(g=>g.result==="bye").map(g=>g.white_id));
            const rn=(await db.prepare("SELECT coalesce(max(round_number),0)+1 n FROM rounds WHERE tournament_id=?").bind(tid).first()).n,id=uid();
            const pairs=pairPlayers(ranked,seen,byes);
            // Guests are not registered members, so they are not written into
            // member attendance; their game results are tracked normally.
            await recordAttendance(db,club,t,ranked.filter(p=>!p.guest).map(p=>p.id));
            const inserts=guestReady?
              pairs.map(p=>db.prepare(
                "INSERT INTO tournament_games_v2(id,round_id,white_user_id,white_guest_id,black_user_id,black_guest_id,result) VALUES(?,?,?,?,?,?,?)"
              ).bind(uid(),id,...newGameBindings(p))):
              pairs.map(p=>db.prepare(
                "INSERT INTO games(id,round_id,white_id,black_id,result) VALUES(?,?,?,?,?)"
              ).bind(uid(),id,p.white_id,p.black_id,p.result));
            await db.batch([
              db.prepare("INSERT INTO rounds(id,tournament_id,round_number) VALUES(?,?,?)").bind(id,tid,rn),
              ...inserts,
              db.prepare("UPDATE tournaments SET status='active' WHERE id=?").bind(tid)
            ]);
            return json({round_number:rn});
          }
          if(path[5]==="games" && path[6] && method==="POST"){
            const b=await body(req),result=b.result;
            if(!["1-0","0-1","1/2-1/2"].includes(result))return error("Invalid game result");
            if(t.status!=="active")return error("Tournament not active",409);
            const gid=path[6];
            const old=await db.prepare(
              "SELECT g.id,g.black_id FROM games g JOIN rounds r ON r.id=g.round_id WHERE g.id=? AND r.tournament_id=?"
            ).bind(gid,tid).first();
            if(old){
              if(!old.black_id)return error("Bye games cannot be changed.",409);
              await db.prepare("UPDATE games SET result=? WHERE id=?").bind(result,gid).run();
              return json({ok:true});
            }
            if(guestReady){
              const newer=await db.prepare(
                "SELECT g.id,g.black_user_id,g.black_guest_id FROM tournament_games_v2 g JOIN rounds r ON r.id=g.round_id WHERE g.id=? AND r.tournament_id=?"
              ).bind(gid,tid).first();
              if(newer){
                if(!newer.black_user_id&&!newer.black_guest_id)return error("Bye games cannot be changed.",409);
                await db.prepare("UPDATE tournament_games_v2 SET result=? WHERE id=?").bind(result,gid).run();
                return json({ok:true});
              }
            }
            return error("Game not found",404);
          }
          if(path[5]==="complete" && path.length===6 && method==="POST"){
            const rounds=await db.prepare("SELECT count(*) AS n FROM rounds WHERE tournament_id=?").bind(tid).first();
            if(!rounds.n)return error("Start at least one round first.",409);
            const games=await tournamentGames(db,tid,guestReady);
            if(games.some(g=>g.result===null))return error("Record all results first",409);
            await db.prepare("UPDATE tournaments SET status='completed' WHERE id=?").bind(tid).run();
            return json({ok:true});
          }
        }
        if(path[3]==="puzzles" && method==="POST") {
          const b=await body(req),pid=String(b.puzzle_id||"").slice(0,80);
          if(!/^[a-zA-Z0-9_-]{2,80}$/.test(pid) || typeof b.correct!=="boolean")return error("Invalid puzzle attempt");
          await db.prepare("INSERT INTO puzzle_attempts(id,club_id,user_id,puzzle_id,correct) VALUES(?,?,?,?,?)").bind(uid(),club,user.id,pid,b.correct?1:0).run();
          return json({ok:true},201);
        }
      }
      return error("Endpoint not found",404);
    } catch(e) {
      console.error("Chess Club API error", e);
      // A successful deployment does not create D1 tables. Remote migrations
      // are a separate one-time operation and do not affect the local DB.
      const message=String(e?.message||"");
      if (/no such table|D1_ERROR.*no such table/i.test(message)) {
        return error("The online database is not initialized. Run 'npm run db:migrate:cloud' in your project folder, then try again.",503);
      }
      return error("Server error. Check Cloudflare Workers Logs for the failed request.",500);
    }
  }
};

// Named exports are used by the Node.js authentication regression tests.
export { makePassword, verifyPassword };
