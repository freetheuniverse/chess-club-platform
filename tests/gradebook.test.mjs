import test from "node:test";
import assert from "node:assert/strict";
import {gradebookData} from "../worker/gradebook.js";
import {handleGeneralAssignments} from "../worker/assignments.js";

function mockDb(generalReady=true){
 const queries=[];
 const db={
   prepare(sql){
     const statement={
       first:async()=>generalReady?{name:"club_assignments"}:null,
       bind(...args){
         return {
           first:statement.first,
           async all(){
             queries.push({sql,args});
             if(sql.includes("FROM memberships m JOIN users"))
               return {results:[{id:"a",name:"Ava Young",role:"student"},{id:"b",name:"Ben Adams",role:"student"}]};
             if(sql.includes("FROM puzzle_assignments a WHERE"))
               return {results:[{id:"p1",title:"Forks",due_date:"2026-11-18",
                 created_at:"2026-11-10",total_puzzles:5}]};
             if(sql.includes("FROM puzzle_assignment_members t"))
               return {results:[
                 {assignment_id:"p1",user_id:"a",solved:2,mistakes:1},
                 {assignment_id:"p1",user_id:"b",solved:5,mistakes:0}
               ]};
             if(sql.includes("FROM club_assignments") && sql.includes("WHERE club_id"))
               return {results:[{id:"g1",kind:"written",title:"Reflection",due_date:null,created_at:"2026-11-11"}]};
             if(sql.includes("FROM club_assignment_targets t"))
               return {results:[{assignment_id:"g1",user_id:"a",submitted_at:"2026-11-12"},
                 {assignment_id:"g1",user_id:"b",submitted_at:null}]};
             throw Error("Unexpected SQL: "+sql);
           }
         };
       }
     };
     return statement;
   }
 };
 return {db,queries};
}

test("gradebook combines puzzles and written work without exposing private submissions",async()=>{
 const {db,queries}=mockDb();
 const result=await gradebookData(db,"club-1");
 assert.equal(result.members.length,2);
 assert.equal(result.assignments.length,2);
 assert.deepEqual(result.assignments.map(x=>x.key),["g:g1","p:p1"]);
 assert.equal(result.assignments.find(x=>x.key==="p:p1").total_puzzles,5);
 assert.equal(result.cells.length,4);
 assert.deepEqual(
   result.cells.filter(x=>x.key==="p:p1").map(x=>x.solved),
   [2,5]
 );
 assert.equal(result.cells.find(x=>x.key==="g:g1"&&x.user_id==="a").submitted,true);
 assert.equal(result.cells.find(x=>x.key==="g:g1"&&x.user_id==="b").submitted,false);
 assert.ok(queries.every(q=>q.args[0]==="club-1"));
 const serialized=JSON.stringify(result);
 assert.doesNotMatch(serialized,/password_hash|@example\.com|answer_text/);
});

test("gradebook retains puzzle progress before the general assignments migration",async()=>{
 const {db,queries}=mockDb(false);
 const result=await gradebookData(db,"club-1");
 assert.equal(result.general_ready,false);
 assert.deepEqual(result.assignments.map(x=>x.key),["p:p1"]);
 assert.equal(result.cells.length,2);
 assert.ok(!queries.some(q=>q.sql.includes("FROM club_assignments")));
});

test("gradebook is moderator-only and rejects requests from students",async()=>{
 const {db,queries}=mockDb();
 const response=await handleGeneralAssignments({
   db,club:"club-1",user:{id:"a",name:"Ava Young"},
   role:"student",path:["api","clubs","club-1","assignments","gradebook"],method:"GET",
   req:{}
 });
 assert.equal(response.status,403);
 assert.match((await response.json()).error,/moderators/i);
 assert.equal(queries.length,0);
});

test("gradebook uses club-scoped SQL and returns no answer contents",async()=>{
 const {db,queries}=mockDb();
 const response=await handleGeneralAssignments({
   db,club:"club-1",user:{id:"owner",name:"Moderator"},
   role:"moderator",path:["api","clubs","club-1","assignments","gradebook"],method:"GET",
   req:{}
 });
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.members.length,2);
 assert.ok(body.cells.every(x=>!Object.hasOwn(x,"answer_text")));
 assert.ok(queries.some(q=>q.sql.includes("puzzle_member_progress")));
 assert.ok(queries.some(q=>q.sql.includes("club_assignment_submissions")));
});
