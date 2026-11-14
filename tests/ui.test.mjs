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
 const messages=[{id:"msg-1",title:"Training reminder",body:"Practice forks and pins.",is_pinned:1,author_name:"Moderator Test",created_at:"2026-11-11 15:00:00"}];
 const sampleTournament={id:"tour-1",title:"November Round Robin",event_date:"2026-11-11",status:"draft",player_count:2};
 const data={club,role:"moderator",members,tournaments:[sampleTournament],attendance:[],puzzles:[],messages,board_ready:true};
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
 assert.doesNotMatch(html,/side-group-label">Managed/);
 assert.match(html,/side-group-label">Joined/);
 assert.ok(html.indexOf("Your clubs") < html.indexOf("Club workspace"),"Club picker should appear before workspace navigation");
 assert.ok(html.indexOf("Club workspace") < html.indexOf("Puzzle Assignments"),"Workspace links should follow the selected club");
 assert.doesNotMatch(html,/side-workspace-club/);
 assert.doesNotMatch(html,/class="side-add"/);
 assert.match(html,/data-action="add-club"/);
 assert.match(html,/School Chess Club/);
 assert.match(html,/Community Chess/);
 assert.match(html,/data-action="add-club"/);
 assert.match(html,/data-action="club:club-2"/);
 assert.match(html,/Message board/);
 assert.match(html,/Training reminder/);
 assert.match(html,/Quick reference/);
 assert.match(html,/reference-link/);
 assert.match(html,/November Round Robin/);
 assert.match(html,/data-action="tournament:tour-1"/);
 assert.match(html,/Not started/);
 assert.doesNotMatch(html,/Recent tournaments|Club access|summary-line/);
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
 assert.match(html,/match-header-white/);
 assert.match(html,/match-header-black/);
 assert.match(html,/player-slot white-player/);
 assert.match(html,/player-slot black-player/);
 assert.match(html,/Standings/);
 app.state.expandedGame="g1";app.render();html=get("app").innerHTML;
 assert.match(html,/match-result-actions/);
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
 assert.match(html,/data-action="club:club-2"/);
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
 assert.match(html,/Add a Club/);
 assert.match(html,/Choose a club above to open its workspace/);
 assert.doesNotMatch(html,/data-action="tab:members"/);
 assert.doesNotMatch(html,/data-action="tab:puzzles"/);
});

test("Add a Club opens a chooser with create and join options",async()=>{
 const {get,app,handlers}=startApp();await app.load();
 assert.equal(typeof handlers.get("add-club"),"function");
 handlers.get("add-club")();
 assert.equal(app.state.modal,"add-club");
 let html=get("app").innerHTML;
 assert.match(html,/Create a club/);
 assert.match(html,/Join a club/);
 assert.match(html,/data-action="new-club"/);
 assert.match(html,/data-action="join-club"/);
 handlers.get("new-club")();
 assert.equal(app.state.modal,"new-club");
 html=get("app").innerHTML;
 assert.match(html,/Club name/);
 assert.doesNotMatch(html,/club-choice-list/);
});

test("the overview displays a message board and clickable tournament reference",async()=>{
 const {get,app,handlers}=startApp();await app.load();
 const html=get("app").innerHTML;
 assert.ok(html.indexOf("Message board")<html.indexOf("Quick reference"));
 assert.match(html,/data-action="new-message"/);
 assert.match(html,/data-action="pin-message:msg-1"/);
 assert.match(html,/data-action="delete-message:msg-1"/);
 assert.match(html,/data-action="tournament:tour-1"/);
 assert.equal(typeof handlers.get("tournament:tour-1"),"function");
});

test("messages are escaped and board setup does not prevent rendering",async()=>{
 const {get,app,data}=startApp();await app.load();
 data.messages=[{id:"danger",title:"<script>alert(1)</script>",body:"<img src=x onerror=alert(1)>",author_name:"Test",created_at:"2026-11-11 15:00:00"}];
 app.render();
 let html=get("app").innerHTML;
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|<img src=x onerror=alert\(1\)>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 data.board_ready=false;
 app.render();
 html=get("app").innerHTML;
 assert.match(html,/Message board setup required/);
 assert.doesNotMatch(html,/data-action="new-message"/);
});

test("club members can read messages but cannot publish or moderate",async()=>{
 const {get,app}=startApp();await app.load();
 app.state.club="club-2";
 app.state.data={...app.state.data,role:"student",club:{id:"club-2",name:"Community Chess"},board_ready:true};
 app.render();
 const html=get("app").innerHTML;
 assert.match(html,/Message board/);
 assert.doesNotMatch(html,/data-action="new-message"|data-action="pin-message:|data-action="delete-message:/);
});

test("tournaments show accurate statuses and moderators can delete them",async()=>{
 const {get,app}=startApp();await app.load();
 app.state.tab="tournaments";
 app.render();
 const html=get("app").innerHTML;
 assert.match(html,/Not started/);
 assert.doesNotMatch(html,/>Draft</);
 assert.match(html,/data-action="delete-tournament:tour-1"/);
 assert.match(html,/class="btn danger-ghost small"/);
 const fixture=app.state.data.tournaments[0];
 fixture.status="active";
 app.render();
 assert.match(get("app").innerHTML,/In progress/);
 fixture.status="completed";
 app.render();
 assert.match(get("app").innerHTML,/Completed/);
});

test("a tournament can show guest players without accounts",async()=>{
 const {get,app,members}=startApp();await app.load();
 app.state.tournament="guest-tour";
 app.state.tdata={
   tournament:{id:"guest-tour",title:"Friendly tournament",event_date:"2026-11-13",status:"draft"},
   players:[...members,{id:"guest_11111111-1111-4111-8111-111111111111",name:"Visitor",guest:1}],
   rounds:[],games:[],guest_ready:true,
   standings:[...members,{id:"guest_11111111-1111-4111-8111-111111111111",name:"Visitor",points:0,guest:1}].map(p=>({points:0,...p}))
 };
 app.render();
 const html=get("app").innerHTML;
 assert.match(html,/Visitor/);
 assert.match(html,/Add guest players/);
 assert.match(html,/guest-player-names/);
 assert.match(html,/remove-guest:guest_11111111/);
 assert.match(html,/data-action="delete-tournament:guest-tour"/);
 assert.match(html,/Not started/);
});

test("new tournament dialog accepts guest names without creating user accounts",async()=>{
 const {get,app,handlers}=startApp();await app.load();
 handlers.get("new-tournament")();
 const html=get("app").innerHTML;
 assert.match(html,/name="guest_names"/);
 assert.match(html,/no accounts needed/);
 assert.doesNotMatch(html,/Guest email|Guest password/);
});

test("bye rows use the same centered pairing layout as normal games",async()=>{
 const {get,app,members}=startApp();await app.load();
 app.state.tournament="t-bye";
 app.state.tdata={
   tournament:{id:"t-bye",title:"Bye round",event_date:"2026-11-11",status:"active"},
   players:members,
   rounds:[{id:"r-bye",round_number:1}],
   games:[{id:"g-bye",round_number:1,white_id:"p1",black_id:null,white_name:"Alex Chen",black_name:null,result:"bye"}],
   standings:members.map(m=>({...m,points:0}))
 };
 app.render();
 const html=get("app").innerHTML;
 assert.match(html,/class="bye-row"/);
 assert.match(html,/class="player-slot white-player"/);
 assert.match(html,/class="player-slot black-player bye-placeholder"/);
 assert.match(html,/Bye · 1 point/);
});

test("pairing grid assigns equal White and Black areas and centers result actions",()=>{
 const css=readFileSync(new URL("../public/site.css",import.meta.url),"utf8");
 assert.match(css,/--pairing-columns:42px minmax\(0,1fr\) 132px minmax\(0,1fr\)/);
 assert.match(css,/\.match-header-white\{text-align:right\}/);
 assert.match(css,/\.match-header-black\{text-align:left\}/);
 assert.match(css,/\.player-slot\.white-player\{text-align:right\}/);
 assert.match(css,/\.player-slot\.black-player\{text-align:left\}/);
 assert.match(css,/\.match-result-actions\{[^}]*grid-column:2 \/ -1;[^}]*justify-content:center;/s);
});
