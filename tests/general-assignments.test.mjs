import test from "node:test";
import assert from "node:assert/strict";
import {handleGeneralAssignments,validDue,validUrl} from "../worker/assignments.js";

const me={id:"member-a",name:"Member A"};
const club="club-id";
function fakeDb({ready=true,recipients=["member-a","member-b"]}={}){
 const calls=[];
 const db={
   prepare(sql){
     return {
       // D1 supports both prepare(sql).first() and prepare(sql).bind(...).first().
       first:async()=>{
         calls.push({sql,args:[],kind:"first"});
         if(sql.includes("sqlite_master"))return ready?{name:"club_assignments"}:null;
         return null;
       },
       bind(...args){
         return {
           first:async()=>{
             calls.push({sql,args,kind:"first"});
             if(sql.includes("sqlite_master"))return ready?{name:"club_assignments"}:null;
             return null;
           },
           all:async()=>{
             calls.push({sql,args,kind:"all"});
             if(sql.includes("FROM memberships"))return {results:recipients.map(user_id=>({user_id}))};
             return {results:[]};
           },
           run:async()=>{calls.push({sql,args,kind:"run"});return{meta:{changes:1}};}
         };
       }
     };
   },
   batch:async statements=>{calls.push({kind:"batch",count:statements.length});return statements.map(()=>({success:true}));}
 };
 return {db,calls};
}
const request=payload=>({json:async()=>payload});
async function invoke({role="moderator",path=["api","clubs",club,"assignments"],method="POST",payload={},db}={}){
 const response=await handleGeneralAssignments({db,club,user:me,role,path,method,req:request(payload)});
 return {status:response.status,body:await response.json()};
}
const basic={title:"Chess opening lesson",instructions:"Read the opening principles.",kind:"study",
 resource_url:"https://lichess.org/study",due_date:"2026-12-01",user_ids:["member-b"]};

test("assignment due dates are strict calendar dates",()=>{
 assert.equal(validDue("2026-12-01"),true);
 assert.equal(validDue(null),true);
 assert.equal(validDue("2026-02-30"),false);
 assert.equal(validDue("yesterday"),false);
});

test("only HTTPS resource URLs without embedded credentials are permitted",()=>{
 assert.equal(validUrl("https://lichess.org/study"),true);
 assert.equal(validUrl(""),true);
 for(const url of ["javascript:alert(1)","http://example.com","https://u:p@example.com","data:text/html,evil"])
   assert.equal(validUrl(url),false);
});

test("students cannot create assignments",async()=>{
 const {db}=fakeDb();
 const res=await invoke({db,role:"student",payload:basic});
 assert.equal(res.status,403);
});

test("moderators can assign study activities to selected registered club members",async()=>{
 const {db,calls}=fakeDb();
 const res=await invoke({db,payload:basic});
 assert.equal(res.status,201);
 assert.ok(res.body.id);
 assert.equal(calls.find(c=>c.kind==="batch")?.count,2);
});

test("moderators cannot target accounts outside their club",async()=>{
 const {db}=fakeDb();
 const res=await invoke({db,payload:{...basic,user_ids:["outsider"]}});
 assert.equal(res.status,403);
});

test("study tasks require instructions or a safe resource",async()=>{
 const {db}=fakeDb();
 const empty=await invoke({db,payload:{...basic,instructions:"",resource_url:""}});
 assert.equal(empty.status,400);
 const bad=await invoke({db,payload:{...basic,resource_url:"javascript:alert(1)"}});
 assert.equal(bad.status,400);
});

test("existing chess puzzles remain available if new assignment migration has not been applied",async()=>{
 const {db}=fakeDb({ready:false});
 const res=await invoke({db,method:"GET"});
 assert.equal(res.status,200);
 assert.deepEqual(res.body,{assignments:[],ready:false});
});
