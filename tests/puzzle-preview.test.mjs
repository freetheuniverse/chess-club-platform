import test from "node:test";
import assert from "node:assert/strict";
import {handlePuzzleRequest} from "../worker/puzzles.js";

const club="club-a",user={id:"moderator-a"};
const previewPath=["api","clubs",club,"puzzles","preview"];
const createPath=["api","clubs",club,"puzzles","assignments"];
const json=value=>({json:async()=>value});
const sample=(id,gameId)=>({
 game:{id:gameId},
 puzzle:{id,fen:"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1",
   solution:["e5d3"],rating:1200,themes:["mateIn1"]}
});
const payload={theme:"mateIn1",difficulty:"normal",count:2};

function fakeDb(){
 const bank=new Map(),drafts=new Map(),created=[],rate={blocked_until:0};
 const requests=[];
 const db={
  prepare(sql){
   const execute=(kind,args=[])=>{
    requests.push({kind,sql,args});
    if(kind==="first"){
     if(sql.includes("sqlite_master"))return {name:"puzzle_bank"};
     if(sql.includes("lichess_rate_state"))return rate.blocked_until?rate:null;
     if(sql.includes("FROM puzzle_bank WHERE lichess_id"))return bank.get(args[0])||null;
     if(sql.includes("puzzle_assignment_items i"))return {lichess_id:"ABCDE"};
     if(sql.includes("puzzle_assignment_members"))return {ok:1};
     if(sql.includes("puzzle_member_progress"))return null;
     return null;
    }
    if(kind==="all"){
     if(sql.includes("FROM puzzle_bank WHERE source_theme"))
       return {results:[...bank.values()].filter(p=>p.source_theme===args[0]&&p.source_difficulty===args[1])};
     if(sql.includes("FROM memberships"))
       return {results:[{user_id:"moderator-a"},{user_id:"student-b"}]};
     if(sql.includes("FROM puzzle_preview_drafts d")){
       const tokens=new Set(args.slice(2));
       return {results:[...drafts.values()].filter(p=>p.club_id===args[0]&&p.user_id===args[1]&&tokens.has(p.id))
         .map(p=>({preview_id:p.id,...bank.get(p.lichess_id)}))};
     }
     throw Error("Unexpected query "+sql);
    }
    if(kind==="run"){
     if(sql.includes("INSERT OR IGNORE INTO puzzle_bank")){
       const [lichess_id,source_theme,source_difficulty,rating,themes,start_fen,solution_json,game_id]=args;
       if(!bank.has(lichess_id))bank.set(lichess_id,{
        lichess_id,source_theme,source_difficulty,rating,themes,start_fen,solution_json,game_id
       });
     }else if(sql.includes("INSERT INTO puzzle_preview_drafts")){
       const [id,lichess_id,club_id,user_id]=args;drafts.set(id,{id,lichess_id,club_id,user_id});
     }else if(sql.includes("INSERT INTO lichess_rate_state")){
       rate.blocked_until=Math.max(rate.blocked_until,args[0]);
     }else if(sql.includes("INSERT INTO puzzle_assignment_items")){
       created.push({kind:"puzzle",args});
     }else if(sql.includes("INSERT INTO puzzle_assignments")){
       created.push({kind:"assignment",args});
     }
     return {success:true};
    }
   };
   return {
    first:async()=>execute("first"),
    bind(...args){
     return {
      first:async()=>execute("first",args),
      all:async()=>execute("all",args),
      run:async()=>execute("run",args)
     };
    }
   };
  },
  batch:async statements=>Promise.all(statements.map(x=>x.run()))
 };
 return {db,bank,drafts,created,requests,rate};
}

async function call({db,role="moderator",path=previewPath,data=payload,userId=user.id}){
 return handlePuzzleRequest({db,club,user:{id:userId},role,path,
   method:"POST",req:json(data)});
}

test("Students cannot fetch unpublished puzzle solutions",async()=>{
 const {db}=fakeDb();
 const result=await call({db,role:"student"});
 assert.equal(result.status,403);
 assert.match((await result.json()).error,/moderators/i);
});

test("Moderator previews are cached and publishing reuses selected previews without new Lichess calls",async()=>{
 const {db,created}=fakeDb();
 const before=globalThis.fetch;
 let upstream=0;
 globalThis.fetch=async url=>{
   upstream++;
   return new Response(JSON.stringify({puzzles:[
     sample("ABCDE","12345678"),sample("ABCD1","abcdefgh")
   ]}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
   const result=await call({db});
   assert.equal(result.status,200);
   const data=await result.json();
   assert.equal(data.puzzles.length,2);
   assert.equal(data.puzzles[0].game_id,"12345678");
   assert.ok(data.puzzles[0].preview_id);
   assert.equal(upstream,1);
   const tokens=data.puzzles.map(p=>p.preview_id);
   const saved=await call({db,path:createPath,data:{
     title:"Mate practice",theme:"mateIn1",difficulty:"normal",
     count:2,user_ids:["student-b"],preview_ids:tokens
   }});
   assert.equal(saved.status,201);
   assert.equal(upstream,1,"Publishing must not fetch each puzzle again");
   assert.equal(created.filter(c=>c.kind==="puzzle").length,2);
 }finally{globalThis.fetch=before;}
});

test("Cached topic puzzles are reusable without an upstream request",async()=>{
 const {db}=fakeDb();
 const before=globalThis.fetch;
 let upstream=0;
 globalThis.fetch=async()=>{
   upstream++;
   return new Response(JSON.stringify({puzzles:[
     sample("ABCDE","12345678"),sample("ABCD1","abcdefgh")
   ]}),{status:200});
 };
 try{
   await call({db});
   const again=await call({db});
   assert.equal(again.status,200);
   const data=await again.json();
   assert.equal(data.puzzles.length,2);
   assert.equal(upstream,1);
 }finally{globalThis.fetch=before;}
});

test("Rate limits set a shared cooldown; subsequent requests do not hammer Lichess",async()=>{
 const {db,rate}=fakeDb();
 const before=globalThis.fetch;
 let upstream=0;
 globalThis.fetch=async()=>{
   upstream++;
   return new Response("rate limit",{status:429,headers:{"Retry-After":"75"}});
 };
 try{
   const first=await call({db});
   assert.equal(first.status,429);
   const body=await first.json();
   assert.ok(body.retry_after_seconds>=60);
   assert.ok(rate.blocked_until>Math.floor(Date.now()/1000));
   const again=await call({db});
   assert.equal(again.status,429);
   assert.equal(upstream,1);
 }finally{globalThis.fetch=before;}
});

test("Owner-scoped previews cannot be published by another account",async()=>{
 const {db}=fakeDb();
 const before=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({puzzles:[
   sample("ABCDE","12345678"),sample("ABCD1","abcdefgh")
 ]}),{status:200});
 try{
   const preview=await call({db});
   const p=await preview.json();
   const saved=await call({db,userId:"someone-else",path:createPath,data:{
     title:"Mate practice",theme:"mateIn1",difficulty:"normal",count:2,
     user_ids:["student-b"],preview_ids:p.puzzles.map(x=>x.preview_id)
   }});
   assert.equal(saved.status,409);
 }finally{globalThis.fetch=before;}
});

test("Students cannot view the original game before solving",async()=>{
 const {db}=fakeDb();
 const result=await handlePuzzleRequest({db,club,user:{id:"student-b"},role:"student",
  path:["api","clubs",club,"puzzles","assignments","assignment-1","source","item-1"],
  method:"GET",req:{}});
 assert.equal(result.status,403);
 assert.match((await result.json()).error,/Complete the puzzle/i);
});
