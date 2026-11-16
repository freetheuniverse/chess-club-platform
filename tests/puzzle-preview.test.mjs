import test from "node:test";
import assert from "node:assert/strict";
import {handlePuzzleRequest} from "../worker/puzzles.js";

const club="club-a",user={id:"student-a"};
const path=["api","clubs",club,"puzzles","preview"];
const request=value=>({json:async()=>value});
const sample=(id,gameId)=>({
  game:{id:gameId},
  puzzle:{id,fen:"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1",
    solution:["e5d3"],rating:1200,themes:["mateIn1"]}
});
const payload={theme:"mateIn1",difficulty:"normal",count:2};

test("Students cannot fetch unpublished puzzle solutions",async()=>{
 const result=await handlePuzzleRequest({
   db:{},club,user,role:"student",path,method:"POST",req:request(payload)
 });
 assert.equal(result.status,403);
 assert.match((await result.json()).error,/moderators/i);
});

test("Moderators get ready-to-render positions and game IDs, not unpublished student progress",async()=>{
 const before=globalThis.fetch,seen=[];
 globalThis.fetch=async url=>{
   seen.push(String(url));
   return new Response(JSON.stringify({puzzles:[
     sample("ABCDE","12345678"),sample("ABCD1","abcdefgh")
   ]}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
   const result=await handlePuzzleRequest({
     db:{},club,user,role:"moderator",path,method:"POST",req:request(payload)
   });
   assert.equal(result.status,200);
   const json=await result.json();
   assert.equal(json.puzzles.length,2);
   assert.equal(json.puzzles[0].start_fen,"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1");
   assert.deepEqual(json.puzzles[0].solution,["e5d3"]);
   assert.equal(json.puzzles[0].game_id,"12345678");
   assert.ok(seen[0].includes("/api/puzzle/batch/mateIn1"));
   assert.ok(seen[0].includes("nb=2"));
 }finally{globalThis.fetch=before;}
});

test("Changing a preview puzzle excludes previously selected IDs",async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({puzzles:[
   sample("ABCDE","12345678"),sample("ABCD1","abcdefgh")
 ]}),{status:200,headers:{"Content-Type":"application/json"}});
 try{
   const result=await handlePuzzleRequest({
     db:{},club,user,role:"moderator",path,method:"POST",
     req:request({...payload,count:1,exclude_ids:["ABCDE"]})
   });
   const body=await result.json();
   assert.equal(body.puzzles[0].lichess_id,"ABCD1");
   assert.equal(body.puzzles.length,1);
 }finally{globalThis.fetch=before;}
});

test("Students cannot view the original game before solving a puzzle",async()=>{
 let fetched=false;
 const db={prepare(sql){
   return {bind(){return {async first(){
     if(sql.includes("puzzle_assignment_items"))return {lichess_id:"ABCDE"};
     if(sql.includes("puzzle_assignment_members"))return {ok:1};
     return null;
   }};}};
 }};
 const result=await handlePuzzleRequest({
   db,club,user,role:"student",
   path:["api","clubs",club,"puzzles","assignments","assignment-1","source","item-1"],
   method:"GET",req:{}
 });
 assert.equal(result.status,403);
 assert.match((await result.json()).error,/Complete the puzzle/i);
 assert.equal(fetched,false);
});
