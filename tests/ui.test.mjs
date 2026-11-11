import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function mockElement(){
  return {innerHTML:"",style:{},textContent:"",required:false,hidden:false,disabled:false,querySelector:()=>mockElement()};
}
function startApp(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,mockElement());return elements.get(id);};
 const user={id:"u",name:"Moderator Test",email:"test@example.com"};
 const club={id:"club-1",name:"School Chess Club",join_code:"JOINCODE1"};
 const members=[{id:"p1",name:"Alex Chen"},{id:"p2",name:"Sam Lee"}];
 const data={club,role:"moderator",members,tournaments:[],attendance:[],puzzles:[]};
 const routes={
   "/api/auth/me":{user},
   "/api/clubs":{clubs:[{id:club.id,name:club.name,role:"moderator"}]},
   ["/api/clubs/"+club.id]:data
 };
 const fetch=async path=>{
   const response=routes[path];
   return {ok:!!response,status:response?200:404,headers:{get:()=>"application/json"},json:async()=>response||{error:"Not found"}};
 };
 const document={getElementById:get,querySelectorAll:()=>[],querySelector:()=>mockElement()};
 const context=vm.createContext({document,fetch,navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true});
 vm.runInContext(source+"\nglobalThis.__testApp={state,render,load};",context);
 return {get,app:context.__testApp,data,members};
}

test("SHJC-style overview renders horizontal tabs and compact tournament list",async()=>{
 const {get,app}=startApp();await app.load();
 const html=get("app").innerHTML;
 assert.match(html,/tab-bar/);
 assert.match(html,/Recent tournaments/);
 assert.match(html,/Club access/);
 assert.doesNotMatch(html,/Every move matters/);
});

test("tournament shows left roster, right pairings and center VS controls",async()=>{
 const {get,app,members}=startApp();await app.load();
 app.state.tournament="t1";
 app.state.tdata={
   tournament:{id:"t1",title:"November Tournament",event_date:"2026-11-11",status:"active"},
   players:members,
   rounds:[{id:"r1",round_number:1}],
   games:[{id:"g1",round_number:1,white_id:"p1",black_id:"p2",white_name:"Alex Chen",black_name:"Sam Lee",result:null}],
   standings:members.map(m=>({...m,points:0}))
 };
 app.render();let html=get("app").innerHTML;
 assert.match(html,/tournament-workspace/);
 assert.match(html,/Player roster/);
 assert.match(html,/Round 1/);
 assert.match(html,/data-action="result-toggle:g1"/);
 assert.match(html,/Standings/);
 app.state.expandedGame="g1";app.render();html=get("app").innerHTML;
 for(const result of ["1-0","0-1","1\/2-1\/2"])assert.ok(html.includes("data-action=\"result:g1:"+result+"\""));
});
