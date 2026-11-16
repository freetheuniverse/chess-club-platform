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
 return {page:window.PuzzleModule.page,list:window.PuzzleModule.list,state};
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
 assert.match(html,/In progress/);
});

test("Assignment filters show tasks based on member progress",()=>{
 const {page,state}=renderFixture();
 state.data.role="student";
 assert.match(page(state),/To do/);
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

function gradebookFixture(){
 const {page,list,state}=renderFixture();
 state.assignmentView="gradebook";
 state.gradebookSort="last";
 state.gradebookFilter="all";
 state.gradebookSearch="";
 state.gradebook={
   members:[
     {id:"u1",name:"Ava Young",role:"student"},
     {id:"u2",name:"Ben Adams",role:"student"}
   ],
   assignments:[
     {key:"p:p1",id:"p1",kind:"puzzle",title:"Fork practice",due_date:"2020-01-01",total_puzzles:5,created_at:"2026-11-10"},
     {key:"g:g1",id:"g1",kind:"written",title:"Game reflection",due_date:null,created_at:"2026-11-09"},
     {key:"g:g2",id:"g2",kind:"study",title:"Chess openings",due_date:"2020-01-01",created_at:"2026-11-08"}
   ],
   cells:[
     {key:"p:p1",user_id:"u1",solved:2,mistakes:1,submitted:false},
     {key:"p:p1",user_id:"u2",solved:5,mistakes:0,submitted:false},
     {key:"g:g1",user_id:"u1",submitted:true},
     {key:"g:g1",user_id:"u2",submitted:false},
     {key:"g:g2",user_id:"u1",submitted:false}
   ],
   general_ready:true
 };
 return {page,list,state};
}

test("Gradebook looks like a Classroom matrix with member rows and assignment columns",()=>{
 const {page,state}=gradebookFixture();
 const html=page(state);
 assert.match(html,/Gradebook/);
 assert.match(html,/class="gradebook-table"/);
 assert.match(html,/class="gradebook-member-col gradebook-member-head"/);
 assert.match(html,/Fork practice/);
 assert.match(html,/Game reflection/);
 assert.match(html,/Chess openings/);
 assert.match(html,/Ava Young/);
 assert.match(html,/Ben Adams/);
 assert.match(html,/Class completion/);
 assert.match(html,/2 \/ 5 solved/);
 assert.match(html,/5 \/ 5 solved/);
 assert.match(html,/Turned in/);
 assert.match(html,/Missing/);
 assert.match(html,/Not assigned/);
 assert.match(html,/data-puzzle-action="open:p:p1"/);
 assert.match(html,/data-puzzle-action="open:g:g1"/);
 assert.match(html,/data-puzzle-action="view:classwork"/);
 assert.match(html,/id="gradebook-search"/);
 assert.match(html,/id="gradebook-sort"/);
 assert.match(html,/id="gradebook-status-filter"/);
 assert.match(html,/Completion and submission tracking, not awarded grades/);
});

test("Gradebook sorts by last name and can filter missing work",()=>{
 const {page,state}=gradebookFixture();
 let html=page(state);
 assert.ok(html.indexOf("Ben Adams")<html.indexOf("Ava Young"));
 state.gradebookSort="first";
 html=page(state);
 assert.ok(html.indexOf("Ava Young")<html.indexOf("Ben Adams"));
 state.gradebookFilter="missing";
 html=page(state);
 assert.match(html,/Ava Young/);
 assert.doesNotMatch(html,/class="gradebook-member-name">Ben Adams/);
});

test("Gradebook search keeps safe HTML and correctly flags unassigned members",()=>{
 const {page,state}=gradebookFixture();
 state.gradebook.members[0].name="<script>alert(1)</script>";
 state.gradebookSearch="other";
 const html=page(state);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/gradebook-search-empty/);
 assert.match(html,/data-gradebook-member/);
 assert.match(html,/gradebook-member-row[^>]*hidden/);
});

test("Students do not see a club-wide gradebook even if a stale view is selected",()=>{
 const {page,state}=gradebookFixture();
 state.data.role="student";
 const html=page(state);
 assert.match(html,/classwork-section/);
 assert.doesNotMatch(html,/class="gradebook-table"/);
 assert.doesNotMatch(html,/data-puzzle-action="view:gradebook"/);
});

test("Gradebook data is requested only for moderators choosing Gradebook",async()=>{
 const {list,state}=gradebookFixture();
 const called=[];
 const api=async path=>{
   called.push(path);
   if(path.endsWith("/puzzles/assignments"))return {assignments:[]};
   if(path.endsWith("/gradebook"))return {members:[],assignments:[],cells:[],general_ready:true};
   return {assignments:[],ready:true};
 };
 await list(state,api);
 assert.equal(called.length,3);
 assert.ok(called.some(p=>p.endsWith("/gradebook")));
 state.data.role="student";
 called.length=0;
 await list(state,api);
 assert.equal(called.length,2);
 assert.ok(!called.some(p=>p.endsWith("/gradebook")));
});

test("Puzzle assignment creator previews a grid with all six contextual board tools",()=>{
 const {page,state}=renderFixture();
 state.showAssignmentForm=true;
 state.puzzleDraft={
   title:"Mate in One Move",theme:"mateIn1",difficulty:"normal",count:2,
   due_date:"",puzzle_ids:"",mode:"practice",member_ids:["u1"],
   items:[
     {id:"ABC12",lichess_id:"ABC12",rating:1200,themes:["mateIn1"],start_fen:"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1",solution:["e5d3"],game_id:"aB12cD34"},
     {id:"ABC13",lichess_id:"ABC13",rating:1250,themes:["mateIn1"],start_fen:"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1",solution:["e5d3"],game_id:"aB12cD35"}
   ]
 };
 const html=page(state);
 assert.match(html,/Create puzzle assignment/);
 assert.match(html,/puzzle-preview-grid/);
 assert.match(html,/puzzle-board-host/);
 assert.match(html,/puzzle-board-host-1/);
 assert.match(html,/optgroup label="Checkmates"/);
 assert.match(html,/optgroup label="Openings"/);
 assert.match(html,/Sicilian Defense/);
 assert.match(html,/Generate puzzles/);
 for(const action of ["preview-analyze:0","preview-game:0","preview-change:0","preview-remove:0","preview-reset:0","preview-next:0"])
   assert.ok(html.includes('data-puzzle-action="'+action+'"'),"Missing creator action "+action);
 assert.match(html,/Assign 2 puzzles/);
});

test("Student puzzle assignments show an entire puzzle grid instead of a left-hand navigation list",()=>{
 const {page,state}=renderFixture();
 state.data.role="student";
 state.activeAssignment="assignment-1";
 state.assignmentData={
   assignment:{id:"assignment-1",title:"Mate practice",theme:"mateIn1",due_date:null},
   canSolve:true,
   items:[1,2,3].map((n)=>({
     id:"item-"+n,lichess_id:"AB12"+n,rating:1400,played:[],solved:n===1,mistakes:0,
     themes:["mateIn1"],start_fen:"4k3/8/8/4n3/8/8/8/4K3 b - - 0 1"
   }))
 };
 const html=page(state);
 assert.match(html,/class="puzzle-board-grid"/);
 assert.match(html,/puzzle-board-host-2/);
 assert.match(html,/puzzle-grid-card student-card/);
 assert.match(html,/1 of 3 solved/);
 assert.doesNotMatch(html,/Puzzle list|class="puzzle-items"/);
 assert.match(html,/data-puzzle-action="student-reset:0"/);
 assert.match(html,/data-puzzle-action="student-flip:0"/);
 assert.match(html,/data-puzzle-action="student-analyze:1" disabled/);
 assert.doesNotMatch(html,/preview-change:0|preview-remove:0|preview-next:0/);
});
