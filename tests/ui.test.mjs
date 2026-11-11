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
 const club={id:"club-1",name:"School Chess Club",join_code:"JOINCODE1",role:"moderator"};
 const joined={id:"club-2",name:"Community Chess",join_code:null,role:"student"};
 const members=[{id:"p1",name:"Alex Chen"},{id:"p2",name:"Sam Lee"}];
 const data={club,role:"moderator",members,tournaments:[],attendance:[],puzzles:[]};
 const routes={
   "/api/auth/me":{user},
   "/api/clubs":{clubs:[club,joined]},
   ["/api/clubs/"+club.id]:data,
   ["/api/clubs/"+joined.id]:{...data,club:joined,role:"student",tournaments:[],attendance:[]}
 };
 const fetch=async path=>{
   const response=routes[path];
   return {ok:!!response,status:response?200:404,headers:{get:()=>"application/json"},json:async()=>response||{error:"Not found"}};
 };
 const handlers=new Map();
 const document={
   getElementById:get,
   querySelectorAll:selector=>{
     if(selector!=="[data-action]")return [];
     handlers.clear();
     return [...get("app").innerHTML.matchAll(/data-action="([^"]+)"/g)].map((match)=>{
       const element=mockElement();element.dataset={action:match[1]};
       Object.defineProperty(element,"onclick",{
         set(fn){handlers.set(match[1],fn);},
         get(){return handlers.get(match[1]);}
       });
       return element;
     });
   },
   querySelector:()=>mockElement()
 };
 const context=vm.createContext({document,fetch,navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true});
 vm.runInContext(source+"\nglobalThis.__testApp={state,render,load};",context);
 return {get,app:context.__testApp,data,members,handlers};
}

test("Chess Club Manager presents clubs above the selected club workspace",async()=>{
 const {get,app}=startApp();await app.load();
 const html=get("app").innerHTML;
 assert.match(html,/Chess Club Manager/);
 assert.match(html,/class="sidebar /);
 assert.match(html,/Puzzle Assignments/);
 assert.match(html,/Your clubs/);
 assert.match(html,/side-group-label">Managed/);
 assert.match(html,/side-group-label">Joined/);
 assert.ok(html.indexOf("Your clubs") < html.indexOf("Club workspace"),"Club picker should appear before workspace navigation");
 assert.ok(html.indexOf("Club workspace") < html.indexOf("Puzzle Assignments"),"Workspace links should follow the selected club");
 assert.match(html,/side-workspace-club" title="School Chess Club">School Chess Club/);
 assert.match(html,/School Chess Club/);
 assert.match(html,/Community Chess/);
 assert.match(html,/aria-label="Create a new club"/);
 assert.match(html,/data-action="club:club-2"/);
 assert.match(html,/Recent tournaments/);
 assert.match(html,/Club access/);
 assert.doesNotMatch(html,/clubselect|tab-bar|class="mark"/);
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

test("switching clubs from the sidebar resets old club context and loads the selected club",async()=>{
 const {get,app,handlers}=startApp();await app.load();
 assert.equal(app.state.club,"club-1");
 const switchClub=handlers.get("club:club-2");
 assert.equal(typeof switchClub,"function");
 app.state.tournament="previous";
 app.state.tdata={old:true};
 app.state.activeAssignment="old-assignment";
 switchClub();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.state.club,"club-2");
 assert.equal(app.state.tab,"overview");
 assert.equal(app.state.tournament,null);
 assert.equal(app.state.activeAssignment,null);
 assert.equal(app.state.data.club.name,"Community Chess");
 const html=get("app").innerHTML;
 assert.match(html,/side-group-label">Joined/);
 assert.match(html,/side-workspace-club" title="Community Chess">Community Chess/);
 assert.doesNotMatch(html,/clubselect/);
});

test("mobile sidebar toggle updates the aria-expanded state and opens the drawer",async()=>{
 const {get,app,handlers}=startApp();await app.load();
 handlers.get("toggle-sidebar")();
 assert.equal(app.state.sidebarOpen,true);
 const html=get("app").innerHTML;
 assert.match(html,/sidebar is-open/);
 assert.match(html,/aria-expanded="true"/);
 assert.match(html,/sidebar-scrim/);
});

test("no club selected hides club-specific workspace navigation",async()=>{
 const {get,app}=startApp();
 await app.load();
 app.state.clubs=[];
 app.state.club=null;
 app.state.data=null;
 app.render();
 const html=get("app").innerHTML;
 assert.match(html,/Your clubs/);
 assert.match(html,/Create a new club/);
 assert.match(html,/Choose a club above to open its workspace/);
 assert.doesNotMatch(html,/data-action="tab:members"/);
 assert.doesNotMatch(html,/data-action="tab:puzzles"/);
});
