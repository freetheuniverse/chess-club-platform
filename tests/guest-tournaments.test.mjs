import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  isGuestId, normalizeGuestNames, tournamentPlayers, tournamentGames, newGameBindings
} from "../worker/tournaments.js";

const G1="guest_11111111-1111-4111-8111-111111111111";
const G2="guest_22222222-2222-4222-8222-222222222222";
const U1="33333333-3333-4333-8333-333333333333";

test("guest name entry supports lines and commas and skips duplicates",()=>{
  assert.deepEqual(normalizeGuestNames(" Alex Smith\nTaylor Jones, alex smith\n"),
    ["Alex Smith","Taylor Jones"]);
  assert.deepEqual(normalizeGuestNames([" Sam  Smith ","Sam Smith","Morgan Lee"]),
    ["Sam Smith","Morgan Lee"]);
});

test("guest name validation rejects empty, excessively long and malformed names",()=>{
  assert.throws(()=>normalizeGuestNames(" , \n"),/Enter at least one/);
  assert.throws(()=>normalizeGuestNames("X"),/2–100/);
  assert.throws(()=>normalizeGuestNames("X".repeat(101)),/2–100/);
  assert.throws(()=>normalizeGuestNames(Array.from({length:65},(_,i)=>"Guest "+i)),/64/);
});

test("guest IDs are distinct from account IDs",()=>{
  assert.equal(isGuestId(G1),true);
  assert.equal(isGuestId(G2),true);
  assert.equal(isGuestId(U1),false);
  assert.equal(isGuestId("guest_X"),false);
});

test("pairings bind real accounts and guests to separate foreign-key columns",()=>{
  assert.deepEqual(newGameBindings({white_id:U1,black_id:G1,result:null}),
    [U1,null,null,G1,null]);
  assert.deepEqual(newGameBindings({white_id:G1,black_id:U1,result:null}),
    [null,G1,U1,null,null]);
  assert.deepEqual(newGameBindings({white_id:G1,black_id:G2,result:null}),
    [null,G1,null,G2,null]);
  assert.deepEqual(newGameBindings({white_id:G1,black_id:null,result:"bye"}),
    [null,G1,null,null,"bye"]);
  assert.deepEqual(newGameBindings({white_id:U1,black_id:null,result:"bye"}),
    [U1,null,null,null,"bye"]);
});

function fakeDb(){
  const history=[];
  const db={
    prepare(query){
      return {
        bind(...args){
          return {
            async all(){
              history.push({query,args});
              if(query.includes("FROM tournament_players p JOIN users"))
                return {results:[{id:U1,name:"Alex Member",guest:0}]};
              if(query.includes("FROM tournament_guests WHERE"))
                return {results:[{id:G1,name:"Sam Guest",guest:1}]};
              if(query.includes("FROM games g JOIN rounds"))
                return {results:[{id:"g-old",round_number:1,white_id:U1,black_id:null,white_name:"Alex Member",black_name:null,result:"bye"}]};
              if(query.includes("FROM tournament_games_v2 g JOIN rounds"))
                return {results:[{id:"g-new",round_number:2,white_id:G1,black_id:U1,white_name:"Sam Guest",black_name:"Alex Member",result:"1-0"}]};
              throw Error("Unexpected query: "+query);
            }
          };
        }
      };
    }
  };
  return {db,history};
}

test("tournament rosters combine accounts and guests only after migration",async()=>{
  const {db}=fakeDb();
  assert.deepEqual((await tournamentPlayers(db,"t1",false)).map(p=>p.name),["Alex Member"]);
  assert.deepEqual((await tournamentPlayers(db,"t1",true)).map(p=>p.name),["Alex Member","Sam Guest"]);
});

test("game retrieval includes historical games alongside guest-capable rounds",async()=>{
  const {db}=fakeDb();
  const legacy=await tournamentGames(db,"t1",false);
  assert.equal(legacy.length,1);
  const all=await tournamentGames(db,"t1",true);
  assert.equal(all.length,2);
  assert.equal(all[1].white_id,G1);
  assert.equal(all[1].black_id,U1);
});

test("new migration keeps original games and supports guest-only references",()=>{
  const sql=readFileSync(new URL("../db/migrations/0004_guest_tournament_players.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS tournament_guests/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS tournament_games_v2/);
  assert.match(sql,/white_guest_id TEXT REFERENCES tournament_guests\(id\) ON DELETE CASCADE/);
  assert.match(sql,/CHECK\(\(white_user_id IS NOT NULL\) != \(white_guest_id IS NOT NULL\)\)/);
  assert.doesNotMatch(sql,/DROP TABLE games/);
});
