// Guest tournament participants live only within a tournament. They cannot
// sign in, receive puzzle assignments, or appear in the authenticated members
// directory. Existing games are read from the v1 table; new rounds use v2.

export const isGuestId=id=>typeof id==="string" && /^guest_[a-f0-9-]{36}$/.test(id);

export function normalizeGuestNames(value){
  const input=Array.isArray(value)?value:
    typeof value==="string"?value.split(/\r?\n|,/):[];
  if(input.length>64)throw Error("Add at most 64 guest players at a time.");
  const names=[],seen=new Set();
  for(const raw of input){
    if(typeof raw!=="string")throw Error("Guest player names must be text.");
    const name=raw.trim().replace(/\s+/g," ");
    if(!name)continue;
    if(name.length<2 || name.length>100)
      throw Error("Each guest player name must contain 2–100 characters.");
    const key=name.toLocaleLowerCase();
    if(seen.has(key))continue;
    names.push(name);seen.add(key);
  }
  if(!names.length)throw Error("Enter at least one guest player name.");
  return names;
}

export async function guestSchemaReady(db){
  return !!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_guests'").first());
}

export async function tournamentPlayers(db,tournamentId,ready){
  const members=(await db.prepare(
    "SELECT u.id,u.name,0 AS guest FROM tournament_players p JOIN users u ON u.id=p.user_id WHERE p.tournament_id=? ORDER BY u.name"
  ).bind(tournamentId).all()).results;
  if(!ready)return members;
  const guests=(await db.prepare(
    "SELECT id,name,1 AS guest FROM tournament_guests WHERE tournament_id=? ORDER BY name"
  ).bind(tournamentId).all()).results;
  return [...members,...guests].sort((a,b)=>a.name.localeCompare(b.name));
}

export async function tournamentGames(db,tournamentId,ready){
  const legacy=(await db.prepare(
    "SELECT g.id,g.round_id,g.white_id,g.black_id,g.result,r.round_number,wu.name white_name,bu.name black_name "+
    "FROM games g JOIN rounds r ON r.id=g.round_id "+
    "JOIN users wu ON wu.id=g.white_id LEFT JOIN users bu ON bu.id=g.black_id "+
    "WHERE r.tournament_id=?"
  ).bind(tournamentId).all()).results;
  if(!ready)return legacy;
  const upgraded=(await db.prepare(
    "SELECT g.id,g.round_id,COALESCE(g.white_user_id,g.white_guest_id) white_id,"+
    "COALESCE(g.black_user_id,g.black_guest_id) black_id,g.result,r.round_number,"+
    "COALESCE(wu.name,wg.name) white_name,COALESCE(bu.name,bg.name) black_name "+
    "FROM tournament_games_v2 g JOIN rounds r ON r.id=g.round_id "+
    "LEFT JOIN users wu ON wu.id=g.white_user_id "+
    "LEFT JOIN tournament_guests wg ON wg.id=g.white_guest_id "+
    "LEFT JOIN users bu ON bu.id=g.black_user_id "+
    "LEFT JOIN tournament_guests bg ON bg.id=g.black_guest_id "+
    "WHERE r.tournament_id=?"
  ).bind(tournamentId).all()).results;
  return [...legacy,...upgraded].sort((a,b)=>a.round_number-b.round_number||a.id.localeCompare(b.id));
}

export function newGameBindings(pair){
  const whiteGuest=isGuestId(pair.white_id),blackGuest=isGuestId(pair.black_id);
  return [
    whiteGuest?null:pair.white_id,
    whiteGuest?pair.white_id:null,
    !pair.black_id || blackGuest?null:pair.black_id,
    blackGuest?pair.black_id:null,
    pair.result
  ];
}

export async function insertGuests(db,tournamentId,rawNames){
  const names=normalizeGuestNames(rawNames);
  const existing=(await db.prepare(
    "SELECT lower(name) AS n FROM tournament_guests WHERE tournament_id=?"
  ).bind(tournamentId).all()).results;
  const existingNames=new Set(existing.map(r=>r.n));
  const incoming=names.filter(n=>!existingNames.has(n.toLowerCase()));
  if(existing.length+incoming.length>128)throw Error("A tournament can have up to 128 guest players.");
  if(!incoming.length)return 0;
  await db.batch(incoming.map(name=>db.prepare(
    "INSERT INTO tournament_guests(id,tournament_id,name) VALUES(?,?,?)"
  ).bind("guest_"+crypto.randomUUID(),tournamentId,name)));
  return incoming.length;
}
