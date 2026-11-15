import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../public/puzzles-ui.js",import.meta.url),"utf8");
function renderFixture(){
 const window={};
 vm.runInNewContext(source,{window,document:{}});
 const state={
   club:"c1",data:{club:{name:"School Chess Club"},role:"moderator",members:[{id:"u1",name:"Alex"}]},
   assignmentFilter:"all",puzzleAssignments:[
     {id:"p1",title:"Mate in one",theme:"mateIn1",puzzles:5,due_date:null,
       my_solved:2,solved:2,members:1,created_at:"2026-11-10"}
   ],
   generalAssignments:[
     {id:"g1",title:"Study endgames",kind:"study",due_date:"2026-12-12",
       assigned:1,submitted:0,my_submitted:0,created_at:"2026-11-12"},
     {id:"g2",title:"Explain your opening",kind:"written",due_date:null,
       assigned:1,submitted:1,my_submitted:1,created_at:"2026-11-11"}
   ],generalReady:true
 };
 return {page:window.PuzzleModule.page,state};
}
test("Assignments page combines Lichess puzzles with study and written cards",()=>{
 const {page,state}=renderFixture();
 const html=page(state);
 assert.match(html,/<h1>Assignments<\/h1>/);
 assert.match(html,/Mate in one/);
 assert.match(html,/Study endgames/);
 assert.match(html,/Explain your opening/);
 assert.match(html,/Chess puzzles/);
 assert.match(html,/Study material/);
 assert.match(html,/Written response/);
 assert.match(html,/classwork-section/);
 assert.match(html,/data-puzzle-action="open:p:p1"/);
 assert.match(html,/data-puzzle-action="open:g:g1"/);
 assert.match(html,/All assignments/);
 assert.match(html,/To do/);
});

test("Assignment filters show tasks based on member progress",()=>{
 const {page,state}=renderFixture();
 state.data.role="student";
 state.assignmentFilter="todo";
 let html=page(state);
 assert.match(html,/Study endgames/);
 assert.match(html,/Mate in one/);
 assert.doesNotMatch(html,/Explain your opening/);
 state.assignmentFilter="complete";
 html=page(state);
 assert.match(html,/Explain your opening/);
 assert.doesNotMatch(html,/Study endgames|Mate in one/);
});

test("The create menu offers functional puzzle, study and written assignment flows",()=>{
 const {page,state}=renderFixture();
 state.showCreateMenu=true;
 const html=page(state);
 assert.match(html,/new-assignment/);
 assert.match(html,/new-general:study/);
 assert.match(html,/new-general:written/);
 assert.match(html,/Create/);
});

test("Unmigrated general assignments show a notice while preserving puzzle cards",()=>{
 const {page,state}=renderFixture();
 state.generalAssignments=[];
 state.generalReady=false;
 const html=page(state);
 assert.match(html,/migration 0005/);
 assert.match(html,/Mate in one/);
});

test("General assignment detail renders moderator submissions without injecting HTML",()=>{
 const {page,state}=renderFixture();
 state.activeGeneralAssignment="g2";
 state.generalDetail={
   assignment:{id:"g2",title:"Explain your opening",kind:"written",
     instructions:"Explain why <script> is unsafe.",resource_url:"https://lichess.org/study",
     due_date:null,author_name:"Moderator"},
   targeted:true,submission:{answer_text:"My answer",submitted_at:"2026-11-12"},
   progress:[{name:"Alex",submitted_at:"2026-11-12",answer_text:"<img src=x onerror=alert(1)>"}]
 };
 const html=page(state);
 assert.match(html,/Your work/);
 assert.match(html,/Member submissions/);
 assert.match(html,/Update response/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/rel="noopener noreferrer"/);
});

test("Student detail does not show other members submissions or moderator deletion",()=>{
 const {page,state}=renderFixture();
 state.data.role="student";
 state.activeGeneralAssignment="g1";
 state.generalDetail={
   assignment:{id:"g1",title:"Study endgames",kind:"study",
     instructions:"Read the endgame guide.",due_date:null,resource_url:null},
   targeted:true,submission:null
 };
 const html=page(state);
 assert.match(html,/Mark as complete/);
 assert.doesNotMatch(html,/Delete/);
 assert.doesNotMatch(html,/Member submissions/);
});
