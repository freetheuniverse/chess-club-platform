(() => {
const liveBoards=new Map();
function destroyBoard(){for(const board of liveBoards.values())board.destroy();liveBoards.clear();}
const THEME_GROUPS=[["Checkmates",[["mateIn1","Mate in one move"],["mateIn2","Mate in two moves"],["mateIn3","Mate in three moves"],["mateIn4","Mate in four moves"],["mateIn5","Mate in five moves"],["backRankMate","Back-rank mate"],["smotheredMate","Smothered mate"],["anastasiaMate","Anastasia’s mate"],["arabianMate","Arabian mate"],["bodenMate","Boden’s mate"],["doubleBishopMate","Double bishop mate"],["dovetailMate","Dovetail mate"],["hookMate","Hook mate"]]],["Openings",[["opening","Opening"],["kingsideAttack","Kingside attack"],["queensideAttack","Queenside attack"]]],["Endgames",[["endgame","Endgame"],["promotion","Promotion"],["zugzwang","Zugzwang"],["pawnEndgame","Pawn endgame"],["rookEndgame","Rook endgame"],["queenEndgame","Queen endgame"],["queenRookEndgame","Queen and rook endgame"],["advancedPawn","Advanced pawn"],["bishopEndgame","Bishop endgame"],["knightEndgame","Knight endgame"],["attackingF2F7","Attacking f2/f7"]]],["Tactics",[["pin","Pin"],["fork","Fork (double attack)"],["skewer","Skewer"],["discoveredAttack","Discovered attack"],["doubleCheck","Double check"],["attraction","Attraction"],["xRayAttack","X-ray attack"],["defensiveMove","Defensive move"],["deflection","Deflection"],["hangingPiece","Hanging piece"],["sacrifice","Sacrifice"],["interference","Interference"],["trappedPiece","Trapped piece"],["capturingDefender","Capturing defender"],["clearance","Clearance"],["exposedKing","Exposed king"],["quietMove","Quiet move"]]],["Special moves",[["enPassant","En passant"],["underPromotion","Underpromotion"],["castling","Castling"]]],["Puzzle length",[["oneMove","One move"],["short","Short"],["long","Long"],["veryLong","Very long"]]],["Goals",[["crushing","Crushing"],["advantage","Advantage"],["equality","Equality"]]],["Other",[["master","Master games"],["mix","Mixed tactics"],["middlegame","Middlegames"]]]];

const DIFFICULTIES=[["easiest","Very easy"],["easier","Easy"],["normal","Normal"],["harder","Hard"],["hardest","Very hard"]];
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pretty=x=>x?.replace(/([A-Z])/g," $1")||"";
const fmt=x=>x?new Date(x+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"No deadline";
const btn=(text,action,cls="btn ghost small")=>'<button type="button" class="'+cls+'" data-puzzle-action="'+action+'">'+text+"</button>";
const options=(pairs,selected)=>pairs.map(([key,label])=>'<option value="'+key+'"'+(key===selected?" selected":"")+'>'+label+"</option>").join("");
async function list(state,api){
 const [puzzles,general]=await Promise.all([
   api("clubs/"+state.club+"/puzzles/assignments"),
   api("clubs/"+state.club+"/assignments")
 ]);
 state.puzzleAssignments=puzzles.assignments||[];
 state.generalAssignments=general.assignments||[];
 state.generalReady=general.ready!==false;
 if(state.data?.role==="moderator" && state.assignmentView==="gradebook"){
   state.gradebook=await api("clubs/"+state.club+"/assignments/gradebook");
 }
}
async function open(state,api,id){
 state.activeAssignment=id;state.assignmentData=await api("clubs/"+state.club+"/puzzles/assignments/"+id);
 state.puzzleIndex=Math.max(0,state.assignmentData.items.findIndex(i=>!i.solved));
 state.puzzleFeedback="";state.puzzleSquare=null;
}
function boardHtml(item,state,index=0){
 const id=index===0?"puzzle-board-host":"puzzle-board-host-"+index;
 return '<div class="chess-board-host" id="'+id+'" role="group" aria-label="Puzzle '+(index+1)+' interactive chessboard"></div>';
}
function topicOptions(selected){
 return THEME_GROUPS.map(([group,topics])=>
   '<optgroup label="'+escape(group)+'">'+topics.map(([key,label])=>
      '<option value="'+escape(key)+'"'+(key===selected?' selected':'')+'>'+escape(label)+'</option>'
   ).join("")+'</optgroup>'
 ).join("");
}
function puzzleTool(name,label,action,disabled=false){
 const shapes={
   analyze:'<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5M9 11h4M11 9v4"/>',
   game:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
   change:'<path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4"/>',
   remove:'<path d="M4 7h16M9 4h6M7 7l1 13h8l1-13M10 10v7M14 10v7"/>',
   reset:'<path d="M3 11a8 8 0 1 0 2-5M3 4v5h5"/>',
   next:'<path d="m6 4 11 8-11 8z"/>',
   flip:'<path d="M4 8V4h4M20 16v4h-4M4 4c3-2 7-2 10 0M20 20c-3 2-7 2-10 0"/>'
 };
 return '<button type="button" class="puzzle-tool" title="'+escape(label)+'" aria-label="'+escape(label)+'" data-puzzle-action="'+escape(action)+'"'+(disabled?' disabled':'')+'>'+
   '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shapes[name]+'</svg></button>';
}

function assignmentTypeIcon(kind){
 const shapes={
   puzzle:'<path d="M17 21H7l1-5 3-2-2-4 2-6h5l3 4-3 4-1 4 2 5Z"/><path d="M11 8h.01"/>',
   study:'<path d="M12 7a6 6 0 0 0-8-1v14a6 6 0 0 1 8 1 6 6 0 0 1 8-1V6a6 6 0 0 0-8 1ZM12 7v14"/>',
   written:'<path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM14 3v5h5M9 13h6M9 17h6"/>'
 };
 return '<svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">'+(shapes[kind]||shapes.study)+'</svg>';
}
function combinedAssignments(state){
 const moderator=state.data?.role==="moderator";
 const p=(state.puzzleAssignments||[]).map(a=>({
   ...a,kind:"puzzle",kindName:"Chess puzzles",entryId:"p:"+a.id,
   completed:moderator?(Number(a.members||0)>0&&Number(a.solved||0)>=Number(a.members)*Number(a.puzzles)):
     Number(a.my_solved||0)>=Number(a.puzzles||1),
   progress:Number(a.solved||0)+" / "+Number(a.members||0)*Number(a.puzzles||0)+" solved",
   myProgress:Number(a.my_solved||0)+" / "+a.puzzles+" solved"
 }));
 const g=(state.generalAssignments||[]).map(a=>({
   ...a,kindName:a.kind==="study"?"Study material":"Written response",entryId:"g:"+a.id,
   completed:moderator?(Number(a.assigned||0)>0&&Number(a.submitted||0)>=Number(a.assigned)):
     Number(a.my_submitted||0)>0,
   progress:Number(a.submitted||0)+" / "+Number(a.assigned||0)+" completed",
   myProgress:Number(a.my_submitted||0)?"Completed":"To do"
 }));
 return [...p,...g];
}
function assignmentCreateActions(state){
 const menu=state.showCreateMenu?
   '<div class="assignment-create-menu" role="group" aria-label="Create assignment type">'+
     btn(assignmentTypeIcon("puzzle")+' Puzzle practice',"new-assignment","classwork-create-option")+
     btn(assignmentTypeIcon("study")+' Study material',"new-general:study","classwork-create-option")+
     btn(assignmentTypeIcon("written")+' Written response',"new-general:written","classwork-create-option")+
   '</div>':"";
 return '<div class="assignment-create-wrap">'+btn("+ Create","create-menu","btn")+menu+'</div>';
}
function assignmentViewTabs(active){
 return '<nav class="gradebook-tabs" aria-label="Assignment views">'+
   [['classwork','Classwork'],['gradebook','Gradebook']].map(([key,label])=>
     '<button type="button" class="gradebook-tab '+(active===key?'active':'')+'" data-puzzle-action="view:'+key+'"'+
     (active===key?' aria-current="page"':'')+'>'+label+'</button>'
   ).join("")+'</nav>';
}
// The gradebook uses *recorded completion* rather than fabricated grades.
// Members not assigned a task are N/A, not "Missing" or zero.
function gradebookCellStatus(assignment,cell,today){
 if(!cell)return {label:"—",detail:"Not assigned",kind:"unassigned",completed:false,missing:false};
 const late=!!(assignment.due_date && assignment.due_date<today);
 if(assignment.kind==="puzzle"){
   const total=Math.max(0,Number(assignment.total_puzzles)||0);
   const solved=Math.min(total,Math.max(0,Number(cell.solved)||0));
   const done=total>0 && solved>=total;
   return {
     label:solved+" / "+total+" solved",
     detail:done?"Completed":late?"Past due":solved?"In progress":"Not started",
     kind:done?"done":late?"missing":solved?"partial":"pending",
     completed:done,missing:late&&!done
   };
 }
 const done=!!cell.submitted;
 return {
   label:done?(assignment.kind==="written"?"Turned in":"Completed"):late?"Missing":"Assigned",
   detail:done?"Submitted":late?"Past due":"Not submitted",
   kind:done?"done":late?"missing":"pending",
   completed:done,missing:late&&!done
 };
}
function gradebookView(state){
 const data=state.gradebook;
 const todayDate=new Date();
 const today=[todayDate.getFullYear(),String(todayDate.getMonth()+1).padStart(2,"0"),String(todayDate.getDate()).padStart(2,"0")].join("-");
 const assignments=data?.assignments||[];
 const allMembers=data?.members||[];
 const cellMap=new Map((data?.cells||[]).map(c=>[c.user_id+"|"+c.key,c]));
 const getStatus=(m,a)=>gradebookCellStatus(a,cellMap.get(m.id+"|"+a.key),today);
 const lastName=n=>String(n||"").trim().split(/\s+/).at(-1).toLocaleLowerCase();
 const members=[...allMembers].sort((a,b)=>{
   if(state.gradebookSort==="first")return a.name.localeCompare(b.name);
   return lastName(a.name).localeCompare(lastName(b.name))||a.name.localeCompare(b.name);
 });
 const visible=members.filter(m=>{
   if(state.gradebookFilter!=="missing")return true;
   return assignments.some(a=>getStatus(m,a).missing);
 });
 const query=String(state.gradebookSearch||"").trim().toLocaleLowerCase();
 const displayMembers=visible.filter(m=>m.name.toLocaleLowerCase().includes(query));
 const header=assignments.map(a=>
   '<th scope="col" class="gradebook-assignment-head"><div class="gradebook-col-top">'+
     '<span class="gradebook-col-date">'+(a.due_date?"Due "+fmt(a.due_date):"No deadline")+'</span></div>'+
     '<button type="button" class="gradebook-column-link" data-puzzle-action="open:'+a.key+'" title="'+escape(a.title)+'">'+escape(a.title)+'</button>'+
     '<span class="gradebook-col-type">'+(a.kind==="puzzle"?"Chess puzzles":a.kind==="written"?"Written response":"Study material")+'</span>'+
   '</th>'
 ).join("");
 const summary=assignments.map(a=>{
   const status=allMembers.map(m=>getStatus(m,a));
   const assigned=status.filter(c=>c.kind!=="unassigned").length;
   const completed=status.filter(c=>c.completed).length;
   return '<td class="gradebook-summary-value"><strong>'+completed+' / '+assigned+'</strong><span>completed</span></td>';
 }).join("");
 const rows=visible.map(m=>{
   const cells=assignments.map(a=>{
     const x=getStatus(m,a);
     return '<td class="gradebook-cell '+x.kind+'" title="'+escape(a.title)+' — '+escape(x.detail)+'">'+
       '<span class="gradebook-cell-value">'+escape(x.label)+'</span>'+
       '<span class="gradebook-cell-detail">'+escape(x.detail)+'</span>'+
     '</td>';
   }).join("");
   const hidden=query&&!m.name.toLocaleLowerCase().includes(query);
   return '<tr class="gradebook-member-row" data-gradebook-member="'+escape(m.name.toLocaleLowerCase())+'"'+(hidden?' hidden':'')+'>'+
     '<th scope="row" class="gradebook-member-col"><span class="gradebook-member-name">'+escape(m.name)+'</span></th>'+
     cells+'</tr>';
 }).join("");
 const controls='<div class="gradebook-controls">'+
   '<div class="gradebook-controls-left"><label for="gradebook-sort">Sort by</label>'+
     '<select id="gradebook-sort" class="field gradebook-select">'+
     '<option value="last"'+(state.gradebookSort!=="first"?' selected':'')+'>Last name</option>'+
     '<option value="first"'+(state.gradebookSort==="first"?' selected':'')+'>First name</option></select>'+
     '<label for="gradebook-status-filter">Show</label>'+
     '<select id="gradebook-status-filter" class="field gradebook-select">'+
     '<option value="all"'+(state.gradebookFilter!=="missing"?' selected':'')+'>All members</option>'+
     '<option value="missing"'+(state.gradebookFilter==="missing"?' selected':'')+'>Past-due work</option></select></div>'+
   '<label class="gradebook-search-wrap" for="gradebook-search">'+
     '<span>Search members</span><input type="search" id="gradebook-search" class="field gradebook-search" placeholder="Find a member" value="'+escape(state.gradebookSearch||"")+'"></label>'+
   '</div>';
 const table=assignments.length?
   '<div class="gradebook-scroll" role="region" tabindex="0" aria-label="Member assignment progress table; scroll horizontally to see more assignments">'+
   '<table class="gradebook-table"><thead><tr><th scope="col" class="gradebook-member-col gradebook-member-head">Members <span>'+displayMembers.length+'</span></th>'+header+'</tr></thead>'+
   '<tbody><tr class="gradebook-summary-row"><th scope="row" class="gradebook-member-col">Class completion</th>'+summary+'</tr>'+
     (rows||'<tr><td colspan="'+(assignments.length+1)+'" class="gradebook-empty-table">No members match this filter.</td></tr>')+
   '</tbody></table></div>'+
   '<p id="gradebook-search-empty" class="gradebook-no-results" role="status"'+(displayMembers.length?' hidden':'')+'>No members match your search or filter.</p>':
   '<div class="classwork-empty"><h2>No assignments yet</h2><p>Create an assignment in Classwork to see member progress here.</p></div>';
 return '<div class="top classwork-heading gradebook-page-heading"><div><div class="eyebrow">'+escape(state.data?.club?.name||"Chess club")+'</div>'+
     '<h1>Assignments</h1><p class="classwork-subtitle">Member progress, organized by assignment.</p></div>'+
     assignmentCreateActions(state)+'</div>'+
     assignmentViewTabs("gradebook")+
     '<div class="gradebook-view">'+
     '<div class="gradebook-section-heading"><div><h2>Gradebook</h2><p>Completion and submission tracking, not awarded grades.</p></div>'+
     '<span id="gradebook-visible-count" class="muted">'+displayMembers.length+' members</span></div>'+
     controls+
     (!data?'<div class="classwork-empty">Loading gradebook…</div>':
       (!data.general_ready?'<p class="classwork-setup">Study and written assignments require migration 0005. Puzzle progress is available.</p>':"")+table)+
     '</div>';
}
function listing(state){
 const entries=combinedAssignments(state);
 const canManage=state.data?.role==="moderator";
 const filter=state.assignmentFilter||"all";
 const today=new Date(),localDay=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const visible=entries.filter(a=>{
   if(filter==="all")return true;
   if(filter==="complete")return a.completed;
   if(filter==="todo")return !a.completed;
   return true;
 });
 function group(a){return a.due_date?(a.due_date<localDay?"Past due":"Due dates"):"No due date";}
 const sections=["Due dates","No due date","Past due"];
 const sortFn=(a,b)=>{
   if(a.due_date&&b.due_date)return a.due_date.localeCompare(b.due_date);
   return String(b.created_at||"").localeCompare(String(a.created_at||""));
 };
 const cards=sections.map(groupName=>{
   const assignments=visible.filter(a=>group(a)===groupName).sort(sortFn);
   if(!assignments.length)return "";
   return '<section class="classwork-section"><h2 class="classwork-topic">'+groupName+'</h2>'+
     '<div class="classwork-stack">'+assignments.map(a=>
       '<article class="assignment-card"><div class="assignment-icon '+a.kind+'">'+assignmentTypeIcon(a.kind)+'</div>'+
       '<div class="assignment-main"><div class="assignment-card-top"><span class="assignment-kind">'+a.kindName+'</span>'+
         '<span class="assignment-due">'+(a.due_date?"Due "+fmt(a.due_date):"No deadline")+'</span></div>'+
       '<button class="assignment-title-button" type="button" data-puzzle-action="open:'+a.entryId+'">'+escape(a.title)+'</button>'+
       '<p class="assignment-summary">'+(canManage?a.progress:a.myProgress)+
         (a.kind==="puzzle"?" · "+a.puzzles+" puzzles":"")+'</p>'+
       '</div><div class="assignment-card-action">'+btn("Open","open:"+a.entryId,"btn ghost small")+'</div></article>'
     ).join("")+'</div></section>';
 }).join("");
 const createMenu=canManage?assignmentCreateActions(state):"";
 return '<div class="top classwork-heading"><div><div class="eyebrow">'+escape(state.data?.club?.name||"Chess club")+'</div>'+
   '<h1>Assignments</h1><p class="classwork-subtitle">Practice and learning activities for your club.</p></div>'+
   createMenu+'</div>'+
   (canManage?assignmentViewTabs("classwork"):"")+
   '<div class="classwork-layout"><aside class="classwork-filters" aria-label="Assignment filters"><div class="classwork-filter-title">View</div>'+
     [["all","All assignments"],["todo",canManage?"In progress":"To do"],["complete","Completed"]].map(([key,title])=>
       '<button type="button" class="classwork-filter '+(filter===key?"active":"")+'" data-puzzle-action="filter:'+key+'"'+
       (filter===key?' aria-current="true"':'')+'>'+title+'</button>').join("")+
   '</aside><div class="classwork-content">'+
   (!state.generalReady?'<p class="classwork-setup">Study and written assignments require database migration 0005. Existing chess puzzles remain available.</p>':"")+
   (entries.length?cards||'<div class="classwork-empty">No assignments match this filter.</div>':
    '<div class="classwork-empty"><h2>No assignments yet</h2><p>Club assignments will appear here when published.</p></div>')+
   '</div></div>'+
   (state.showAssignmentForm?assignmentForm(state):"")+
   (state.showGeneralForm?generalForm(state):"");
}

function draftDefault(state){
 return state.puzzleDraft||{
   title:"",theme:"mateIn1",difficulty:"normal",count:6,due_date:"",
   puzzle_ids:"",mode:"practice",member_ids:null,items:[]
 };
}
function previewCard(p,i){
 return '<article class="puzzle-grid-card preview-card" data-preview-index="'+i+'">'+
   '<div class="puzzle-card-top"><span class="puzzle-card-number">Puzzle '+(i+1)+'</span>'+
     '<span class="puzzle-card-rating">Rating '+Number(p.rating||0)+'</span></div>'+
   '<div class="puzzle-toolbar" aria-label="Tools for puzzle '+(i+1)+'">'+
     puzzleTool("analyze","Analyze Position","preview-analyze:"+i)+
     puzzleTool("game","View Full Game","preview-game:"+i)+
     puzzleTool("change","Change this puzzle","preview-change:"+i)+
     puzzleTool("remove","Remove this puzzle","preview-remove:"+i)+
     puzzleTool("reset","Reset board","preview-reset:"+i)+
     puzzleTool("next","Play next move","preview-next:"+i)+
   '</div>'+boardHtml(p,null,i)+
   '<div class="puzzle-card-bottom"><span>'+(p.start_fen?.split(" ")[1]==="b"?"Black to move":"White to move")+'</span>'+
     '<span class="puzzle-card-id">Lichess '+escape(p.lichess_id)+'</span></div>'+
   '<div class="puzzle-card-feedback" id="preview-feedback-'+i+'" aria-live="polite"></div>'+
 '</article>';
}
function assignmentForm(state){
 const members=state.data?.members||[],d=draftDefault(state),selected=d.member_ids;
 const boards=(d.items||[]).map(previewCard).join("");
 return '<section class="puzzle-form-layer puzzle-editor-layer" role="dialog" aria-label="New puzzle assignment" aria-modal="true">'+
 '<div class="puzzle-form-panel puzzle-editor-panel">'+
 '<div class="panel-heading puzzle-editor-heading"><div><h2>Create puzzle assignment</h2><p class="muted">Choose your puzzles and review the boards before assigning.</p></div>'+btn("Close","cancel-assignment")+'</div>'+
 '<form id="puzzle-create-form" class="panel-body form">'+
 '<div class="puzzle-editor-field-row">'+
 '<label class="puzzle-editor-title">Assignment title<input name="title" class="field" required minlength="3" maxlength="100" value="'+escape(d.title)+'" placeholder="e.g. Mate in one — Week 1"></label>'+
 '<label>Due date (optional)<input name="due_date" class="field" type="date" value="'+escape(d.due_date)+'"></label></div>'+
 '<div class="puzzle-editor-field-row puzzle-editor-controls">'+
 '<label>Topic<select name="theme" class="field">'+topicOptions(d.theme)+'</select></label>'+
 '<label>Difficulty<select name="difficulty" class="field">'+options(DIFFICULTIES,d.difficulty)+'</select></label>'+
 '<label>Preview mode<select name="mode" class="field">'+
 '<option value="practice"'+(d.mode==="practice"?' selected':'')+'>Practice</option>'+
 '<option value="review"'+(d.mode==="review"?' selected':'')+'>Review moves</option>'+
 '</select></label>'+
 '<label>Puzzles<input name="count" class="field" type="number" min="1" max="10" value="'+Number(d.count||6)+'"></label>'+
 '</div>'+
 '<div class="puzzle-preview-top"><div><h3>Puzzle selection</h3><p class="muted">Inspect positions, replace unsuitable puzzles, or step through a solution before publishing.</p></div>'+
 '<div class="puzzle-editor-actions">'+
   btn("Generate puzzles","generate-preview","btn ghost small")+
   ((d.items||[]).length<10?btn("+ Add puzzle","preview-add","btn ghost small"):"")+
 '</div></div>'+
 '<div class="puzzle-preview-grid" id="puzzle-preview-grid">'+
 (boards||'<div class="puzzle-preview-placeholder">No puzzles selected. Choose a topic and select <strong>Generate puzzles</strong> to preview them.</div>')+
 '</div>'+
 '<div class="puzzle-member-section"><div class="spread"><h3>Assign to members</h3><span>'+btn("All","members-all","btn text")+" "+btn("Clear","members-none","btn text")+'</span></div>'+
 '<div class="puzzle-member-list">'+members.map(m=>'<label class="selectrow"><input class="puzzle-member" type="checkbox" value="'+escape(m.id)+'"'+(selected===null||selected.includes(m.id)?' checked':'')+'><span>'+escape(m.name)+'</span></label>').join("")+'</div></div>'+
 '<label class="puzzle-ids-field">Specific Lichess puzzle IDs (optional)<input class="field" name="puzzle_ids" value="'+escape(d.puzzle_ids)+'" placeholder="e.g. PSjmf, 0haqU"></label>'+
 '<p class="modal-hint">Use specific IDs to preview exact puzzles, or leave the field empty for a topic-based selection. You can preview up to 10 puzzles.</p>'+
 '<div id="puzzle-form-error" class="notice" role="alert" hidden></div>'+
 '<div class="form-actions">'+btn("Cancel","cancel-assignment")+'<button type="submit" class="btn" id="puzzle-submit"'+(!d.items?.length?' disabled':'')+'>Assign '+(d.items?.length||0)+' puzzles</button></div>'+
 '</form></div></section>';
}
function generalForm(state){
 const kind=state.showGeneralForm;
 const members=state.data?.members||[];
 const study=kind==="study";
 return '<section class="puzzle-form-layer" role="dialog" aria-modal="true" aria-label="Create assignment">'+
   '<div class="puzzle-form-panel"><div class="panel-heading"><h2>'+(study?"Create study material":"Create written response")+'</h2>'+
   btn("Close","cancel-general")+'</div><form class="panel-body form" id="general-create-form">'+
   '<label>Assignment title<input class="field" name="title" required minlength="3" maxlength="100" placeholder="'+
     (study?"e.g. Understanding basic endgames":"e.g. Explain your tournament decisions")+'"></label>'+
   '<label>Instructions<textarea class="field" name="instructions" rows="5" maxlength="3000"'+
     (!study?" required":"")+' placeholder="Tell members what to do..."></textarea></label>'+
   '<div class="puzzle-form-grid"><label>Resource link (optional)<input class="field" type="url" name="resource_url" placeholder="https://..."></label>'+
   '<label>Due date (optional)<input class="field" type="date" name="due_date"></label></div>'+
   '<div><div class="spread"><strong>Assign to members</strong><span>'+
     btn("All","general-all","btn text")+" "+btn("Clear","general-none","btn text")+'</span></div>'+
   '<div class="puzzle-member-list">'+members.map(m=>
     '<label class="selectrow"><input type="checkbox" class="general-member" value="'+escape(m.id)+'" checked>'+
     '<span>'+escape(m.name)+'</span></label>').join("")+'</div></div>'+
   '<p class="modal-hint">'+(study?
      "Members will read the instructions or resource and mark the activity completed.":
      "Members will type and submit a response that moderators can review.")+'</p>'+
   '<div id="general-form-error" class="notice" role="alert" hidden></div>'+
   '<div class="form-actions">'+btn("Cancel","cancel-general")+
     '<button class="btn" id="general-submit" type="submit">Assign to members</button></div></form></div></section>';
}
function generalDetail(state){
 const data=state.generalDetail;
 if(!data)return '<section class="panel"><div class="empty">Loading assignment…</div></section>';
 const a=data.assignment;
 const completed=!!data.submission;
 const mod=state.data?.role==="moderator";
 const progress=Array.isArray(data.progress)?data.progress:[];
 const resource=a.resource_url?
   '<a class="classwork-resource" href="'+escape(a.resource_url)+'" target="_blank" rel="noopener noreferrer">'+
   assignmentTypeIcon("study")+' Open study resource</a>':"";
 const answerArea=data.targeted?'<section class="panel classwork-turnin"><div class="panel-heading"><h2>Your work</h2>'+
   '<span class="pill '+(completed?"active":"")+'">'+(completed?"Completed":"Assigned")+'</span></div>'+
   '<div class="panel-body">'+
    (a.kind==="study"?
      '<p class="panel-note">'+(completed?"You have marked this study task complete.":"Read the instructions or resource, then mark this task as done.")+'</p>'+
      (!completed?btn("Mark as complete","complete-study","btn"):""):
      '<form id="general-response-form"><label for="written-response">Your response</label>'+
       '<textarea id="written-response" class="field" name="answer_text" rows="8" maxlength="3000" minlength="5" required placeholder="Write your response here...">'+
         escape(data.submission?.answer_text||"")+'</textarea>'+
       '<div id="general-response-error" class="notice" role="alert" hidden></div>'+
       '<button type="submit" class="btn">'+(completed?"Update response":"Submit response")+'</button></form>')+
   '</div></section>':
   '<section class="panel classwork-turnin"><div class="panel-heading"><h2>Your work</h2></div><div class="panel-body"><p class="panel-note">This assignment is not addressed to your account.</p></div></section>';
 const progressPanel=mod?'<section class="panel"><div class="panel-heading"><h2>Member submissions</h2>'+
     '<span class="muted">'+progress.filter(p=>p.submitted_at).length+' of '+progress.length+' completed</span></div>'+
   (progress.length?'<div class="classwork-submissions">'+progress.map(p=>
     '<details class="classwork-submission"><summary><span>'+escape(p.name)+'</span><span class="pill '+(p.submitted_at?"active":"")+'">'+
     (p.submitted_at?"Submitted":"Assigned")+'</span></summary>'+
     (p.submitted_at?
       '<div class="classwork-submission-answer">'+(a.kind==="written"?escape(p.answer_text||""):"Marked complete")+'</div>':
       '<div class="classwork-submission-answer muted">No submission yet.</div>')+'</details>'
   ).join("")+'</div>':'<div class="panel-body"><p>No members selected.</p></div>')+'</section>':"";
 return '<button type="button" class="back interactive" data-puzzle-action="back">← Assignments</button>'+
   '<div class="top classwork-heading"><div><div class="eyebrow">'+escape(a.kind==="study"?"Study material":"Written response")+'</div>'+
   '<h1>'+escape(a.title)+'</h1><p class="classwork-subtitle">'+
      (a.due_date?"Due "+fmt(a.due_date):"No deadline")+
      (a.author_name?" · Posted by "+escape(a.author_name):"")+'</p></div>'+
   (mod?btn("Delete","delete-general","btn danger-ghost small"):"")+'</div>'+
   '<div class="classwork-detail-grid"><div class="classwork-detail-main"><section class="panel">'+
     '<div class="panel-heading"><h2>Instructions</h2></div>'+
     '<div class="panel-body"><p class="classwork-instructions">'+escape(a.instructions||"No written instructions provided.")+'</p>'+resource+'</div>'+
   '</section>'+progressPanel+'</div><aside>'+answerArea+'</aside></div>';
}
function detail(state){
 const d=state.assignmentData;
 if(!d)return '<div class="panel"><div class="empty">Loading assignment…</div></div>';
 const items=d.items||[];
 const count=items.filter(p=>p.solved).length;
 const canReview=state.data?.role==="moderator";
 const boards=items.map((item,index)=>{
   const done=!!item.solved;
   const toolbar='<div class="puzzle-toolbar" aria-label="Puzzle '+(index+1)+' controls">'+
     puzzleTool("analyze","Analyze Position","student-analyze:"+index,!done&&!canReview)+
     puzzleTool("game","View Full Game","student-game:"+index,!done&&!canReview)+
     puzzleTool("reset","Reset board","student-reset:"+index)+
     puzzleTool("flip","Flip board","student-flip:"+index)+
   '</div>';
   return '<article class="puzzle-grid-card student-card" data-puzzle-index="'+index+'">'+
     '<div class="puzzle-card-top"><strong>Puzzle '+(index+1)+'</strong>'+
       '<span class="puzzle-card-state '+(done?'solved':'')+'" id="puzzle-state-chip-'+index+'">'+
       (done?'Solved':item.mistakes?'In progress':'Not started')+'</span></div>'+
     toolbar+
     boardHtml(item,state,index)+
     '<div class="puzzle-card-bottom">'+
       '<span>'+(item.start_fen?.split(" ")[1]==="b"?"Black to move":"White to move")+'</span>'+
       '<span data-puzzle-progress="'+index+'">Rating '+Number(item.rating||0)+'</span></div>'+
     '<div class="puzzle-card-feedback" id="puzzle-feedback-'+index+'" role="status" aria-live="polite"></div>'+
     '<div class="puzzle-card-mistakes" id="puzzle-mistake-count-'+index+'">Mistakes: '+(item.mistakes||0)+'</div>'+
   '</article>';
 }).join("");
 const report=Array.isArray(d.summary)?'<section class="panel puzzle-member-progress"><div class="panel-heading"><h2>Member progress</h2><span class="muted">'+d.summary.length+' members</span></div>'+
 '<div class="tablewrap"><table><thead><tr><th>Member</th><th class="num">Solved</th><th class="num">Mistakes</th></tr></thead><tbody>'+
 d.summary.map(m=>'<tr><td>'+escape(m.name)+'</td><td class="num">'+m.solved+" / "+items.length+'</td><td class="num">'+m.mistakes+'</td></tr>').join("")+
 '</tbody></table></div></section>':"";
 return '<button type="button" class="back interactive" data-puzzle-action="back">← Assignments</button>'+
 '<div class="top puzzle-student-heading"><div><div class="eyebrow">Puzzle assignment</div><h1>'+escape(d.assignment.title)+'</h1>'+
 '<p class="muted">'+escape(pretty(d.assignment.theme))+' · '+fmt(d.assignment.due_date)+' · '+items.length+' puzzles</p></div>'+
 '<div class="puzzle-assignment-counter" id="puzzle-solved-counter">'+count+' of '+items.length+' solved</div></div>'+
 (!d.canSolve?'<p class="panel-note puzzle-review-note">Previewing positions as a moderator. Your account is not assigned to solve these puzzles.</p>':"")+
 '<div class="puzzle-board-grid">'+boards+'</div>'+report;
}
function page(state){
 if(state.activeGeneralAssignment)return generalDetail(state);
 if(state.activeAssignment)return detail(state);
 if(state.data?.role==="moderator" && state.assignmentView==="gradebook")return gradebookView(state);
 return listing(state);
}
function updatePuzzleFeedback(state,item,index){
 const el=document.getElementById("puzzle-feedback-"+index);
 if(el)el.textContent=state.puzzleFeedback||"";
 const mistakes=document.getElementById("puzzle-mistake-count-"+index);
 if(mistakes)mistakes.textContent="Mistakes: "+(item.mistakes||0);
 const chip=document.getElementById("puzzle-state-chip-"+index);
 if(chip){
   chip.textContent=item.solved?"Solved":item.mistakes?"In progress":"Not started";
   chip.className="puzzle-card-state "+(item.solved?"solved":"");
 }
 const counter=document.getElementById("puzzle-solved-counter");
 if(counter&&state.assignmentData){
   const list=state.assignmentData.items;
   counter.textContent=list.filter(i=>i.solved).length+" of "+list.length+" solved";
 }
}

function capturePuzzleDraft(state){
 const form=document.getElementById("puzzle-create-form");
 const current=draftDefault(state);
 if(!form)return current;
 const data=Object.fromEntries(new FormData(form));
 const members=[...document.querySelectorAll(".puzzle-member:checked")].map(x=>x.value);
 state.puzzleDraft={
   ...current,
   title:String(data.title||""),theme:String(data.theme||"mix"),
   difficulty:String(data.difficulty||"normal"),
   count:Math.min(10,Math.max(1,Number(data.count)||6)),
   due_date:String(data.due_date||""),puzzle_ids:String(data.puzzle_ids||""),
   mode:String(data.mode||"practice"),member_ids:members
 };
 return state.puzzleDraft;
}
function analysisUrl(fen){
 const normalized=String(fen||"").trim();
 if(!/^[prnbqkPRNBQK1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+$/.test(normalized))return null;
 return "https://lichess.org/analysis/standard/"+normalized.replace(/ /g,"_");
}
function openExternal(url){
 if(!url || !/^https:\/\/lichess\.org\//.test(url))return;
 window.open(url,"_blank","noopener,noreferrer");
}
function bind({state,render,api,post,action}){
 document.querySelectorAll("[data-puzzle-action]").forEach(el=>el.onclick=()=>{
   const [cmd,...parts]=el.dataset.puzzleAction.split(":");
   const val=parts.join(":");
   if(cmd==="view"){
     if(val!=="classwork"&&val!=="gradebook")return;
     state.assignmentView=val;state.showCreateMenu=false;
     if(val==="gradebook"&&state.data?.role==="moderator"){
       action(async()=>{
         state.gradebook=await api("clubs/"+state.club+"/assignments/gradebook");
       });
     }else render();
   }
   if(cmd==="create-menu"){state.showCreateMenu=!state.showCreateMenu;render();}
   if(cmd==="filter"){state.assignmentFilter=val;render();}
   if(cmd==="new-assignment"){
     state.showAssignmentForm=true;state.puzzleDraft=null;
     state.showCreateMenu=false;state.showGeneralForm=null;render();
   }
   if(cmd==="new-general"){
     if(!state.generalReady){
       state.notice="Apply database migration 0005 to enable study and written assignments.";
       render();return;
     }
     state.showGeneralForm=val;state.showAssignmentForm=false;state.showCreateMenu=false;render();
   }
   if(cmd==="cancel-general"){state.showGeneralForm=null;render();}
   if(cmd==="cancel-assignment"){state.showAssignmentForm=false;state.puzzleDraft=null;render();}
   if(cmd==="general-all"||cmd==="general-none")document.querySelectorAll(".general-member").forEach(x=>x.checked=cmd==="general-all");
   if(cmd==="members-all"||cmd==="members-none")document.querySelectorAll(".puzzle-member").forEach(x=>x.checked=cmd==="members-all");
   if(cmd==="flip")liveBoards.get("student:"+state.puzzleIndex)?.flip();
   if(cmd==="generate-preview"||cmd==="preview-change"||cmd==="preview-add"){
     const draft=capturePuzzleDraft(state);
     const index=Number(val);
     if((cmd==="preview-change"||cmd==="preview-add") && !draft.items?.length)return;
     const existing=(draft.items||[]).map(x=>x.lichess_id);
     if(cmd==="preview-add"&&existing.length>=10)return;
     const request={
       theme:draft.theme,difficulty:draft.difficulty,
       count:cmd==="generate-preview"?draft.count:cmd==="preview-change"?1:1,
       puzzle_ids:cmd==="generate-preview"?draft.puzzle_ids:"",
       exclude_ids:cmd==="generate-preview"?[]:existing
     };
     const error=document.getElementById("puzzle-form-error");
     if(error){error.hidden=true;error.textContent="";}
     const create=document.getElementById("puzzle-submit");
     if(create)create.disabled=true;
     void (async()=>{
       try{
         const response=await post("clubs/"+state.club+"/puzzles/preview",request);
         const incoming=(response.puzzles||[]).map(item=>({...item,played:[],solved:false,mistakes:0}));
         if(!incoming.length)throw Error("Lichess did not return any suitable puzzles.");
         if(cmd==="generate-preview")draft.items=incoming;
         else if(cmd==="preview-change"){
           if(!Number.isInteger(index)||index<0||index>=draft.items.length)return;
           draft.items[index]=incoming[0];
         }else draft.items.push(incoming[0]);
         draft.count=draft.items.length;
         draft.puzzle_ids="";
         draft.error="";
         state.puzzleDraft=draft;
         render();
       }catch(e){
         draft.error=e.message||"Could not preview puzzles.";
         state.puzzleDraft=draft;
         const msg=document.getElementById("puzzle-form-error");
         if(msg){msg.textContent=draft.error;msg.hidden=false;}
         if(create)create.disabled=!(draft.items||[]).length;
       }
     })();
   }
   if(cmd==="preview-remove"){
     const draft=capturePuzzleDraft(state),index=Number(val);
     if(Number.isInteger(index)&&index>=0&&index<draft.items.length){
       draft.items.splice(index,1);draft.count=Math.max(1,draft.items.length);
       render();
     }
   }
   if(cmd==="preview-reset"||cmd==="preview-next"||cmd==="preview-analyze"||cmd==="preview-game"){
     const index=Number(val),draft=state.puzzleDraft;
     const item=draft?.items?.[index];
     if(!item)return;
     const board=liveBoards.get("preview:"+index);
     if(cmd==="preview-reset")board?.reset?.();
     if(cmd==="preview-next")board?.step?.();
     if(cmd==="preview-analyze")openExternal(analysisUrl(item.start_fen));
     if(cmd==="preview-game"){
       if(item.game_id)openExternal("https://lichess.org/"+item.game_id);
       else{
         const msg=document.getElementById("puzzle-form-error");
         if(msg){msg.textContent="The original Lichess game link is not available for this puzzle.";msg.hidden=false;}
       }
     }
     const feedback=document.getElementById("preview-feedback-"+index);
     if(feedback&&(cmd==="preview-reset"||cmd==="preview-next"))
       feedback.textContent=cmd==="preview-reset"?"Position reset.":item.solved?"Solution completed.":"Move played.";
   }
   if(cmd==="student-reset"||cmd==="student-flip"||cmd==="student-analyze"||cmd==="student-game"){
     const index=Number(val),item=state.assignmentData?.items?.[index];
     if(!item)return;
     const board=liveBoards.get("student:"+index);
     if(cmd==="student-reset")board?.reset?.();
     if(cmd==="student-flip")board?.flip?.();
     if(cmd==="student-analyze"&&(item.solved||state.data?.role==="moderator"))
       openExternal(analysisUrl(item.start_fen));
     if(cmd==="student-game"&&(item.solved||state.data?.role==="moderator")){
       void (async()=>{
         try{
           const result=await api("clubs/"+state.club+"/puzzles/assignments/"+state.activeAssignment+"/source/"+item.id);
           openExternal(result.game_url);
         }catch(e){
           const feedback=document.getElementById("puzzle-feedback-"+index);
           if(feedback)feedback.textContent=e.message;
         }
       })();
     }
   }

   if(cmd==="back"){
     action(async()=>{
       state.activeAssignment=null;state.assignmentData=null;
       state.activeGeneralAssignment=null;state.generalDetail=null;state.puzzleFeedback="";
       await list(state,api);
     });
   }
   if(cmd==="select"){state.puzzleIndex=Number(val);state.puzzleSquare=null;state.puzzleFeedback="";render();}
   if(cmd==="open"){
     action(async()=>{
       if(val.startsWith("g:")){
         const id=val.slice(2);
         state.activeAssignment=null;state.assignmentData=null;
         state.activeGeneralAssignment=id;
         state.generalDetail=await api("clubs/"+state.club+"/assignments/"+id);
       }else{
         state.activeGeneralAssignment=null;state.generalDetail=null;
         await open(state,api,val.startsWith("p:")?val.slice(2):val);
       }
     });
   }
   if(cmd==="complete-study"){
     action(async()=>{
       await post("clubs/"+state.club+"/assignments/"+state.activeGeneralAssignment+"/submit",{});
       state.generalDetail=await api("clubs/"+state.club+"/assignments/"+state.activeGeneralAssignment);
       await list(state,api);
     });
   }
   if(cmd==="delete-general"){
     if(!confirm("Delete this assignment and all its submissions? This cannot be undone."))return;
     action(async()=>{
       await api("clubs/"+state.club+"/assignments/"+state.activeGeneralAssignment,{method:"DELETE"});
       state.activeGeneralAssignment=null;state.generalDetail=null;
       await list(state,api);
     });
   }
 });
 const sort=document.getElementById("gradebook-sort");
 if(sort)sort.onchange=()=>{
   state.gradebookSort=sort.value==="first"?"first":"last";
   render();
 };
 const statusFilter=document.getElementById("gradebook-status-filter");
 if(statusFilter)statusFilter.onchange=()=>{
   state.gradebookFilter=statusFilter.value==="missing"?"missing":"all";
   render();
 };
 const search=document.getElementById("gradebook-search");
 if(search)search.oninput=()=>{
   state.gradebookSearch=search.value;
   const term=search.value.trim().toLocaleLowerCase();
   let shown=0;
   document.querySelectorAll(".gradebook-member-row").forEach(row=>{
     row.hidden=!String(row.dataset.gradebookMember||"").includes(term);
     if(!row.hidden)shown++;
   });
   const count=document.getElementById("gradebook-visible-count");
   if(count)count.textContent=shown+" members";
   const empty=document.getElementById("gradebook-search-empty");
   if(empty)empty.hidden=shown!==0;
 };
 const form=document.getElementById("puzzle-create-form");
 if(form)form.onsubmit=async e=>{
   e.preventDefault();
   const submit=document.getElementById("puzzle-submit"), error=document.getElementById("puzzle-form-error");
   const draft=capturePuzzleDraft(state);
   if(!draft.items?.length){error.textContent="Generate and review your puzzles before assigning.";error.hidden=false;return;}
   if(!draft.member_ids?.length){error.textContent="Select at least one member.";error.hidden=false;return;}
   const payload={
     title:draft.title,theme:draft.theme,difficulty:draft.difficulty,
     count:draft.items.length,due_date:draft.due_date,
     user_ids:draft.member_ids,puzzle_ids:draft.items.map(x=>x.lichess_id).join(",")
   };
   submit.disabled=true;error.hidden=true;
   try{
     const created=await post("clubs/"+state.club+"/puzzles/assignments",payload);
     state.showAssignmentForm=false;state.puzzleDraft=null;
     await list(state,api);await open(state,api,created.id);
     render();
   }catch(e){error.textContent=e.message;error.hidden=false;}finally{submit.disabled=false;}
 };

 const generalCreate=document.getElementById("general-create-form");
 if(generalCreate)generalCreate.onsubmit=async e=>{
   e.preventDefault();
   const submit=document.getElementById("general-submit"),error=document.getElementById("general-form-error");
   const payload=Object.fromEntries(new FormData(generalCreate));
   payload.kind=state.showGeneralForm;
   payload.user_ids=[...document.querySelectorAll(".general-member:checked")].map(x=>x.value);
   if(!payload.user_ids.length){error.textContent="Select at least one member.";error.hidden=false;return;}
   submit.disabled=true;error.hidden=true;
   try{
     const created=await post("clubs/"+state.club+"/assignments",payload);
     state.showGeneralForm=null;
     await list(state,api);
     state.activeGeneralAssignment=created.id;
     state.activeAssignment=null;state.assignmentData=null;
     state.generalDetail=await api("clubs/"+state.club+"/assignments/"+created.id);
     render();
   }catch(e){error.textContent=e.message;error.hidden=false;}
   finally{submit.disabled=false;}
 };
 const generalResponse=document.getElementById("general-response-form");
 if(generalResponse)generalResponse.onsubmit=async e=>{
   e.preventDefault();
   const error=document.getElementById("general-response-error");
   const btnSubmit=generalResponse.querySelector('button[type="submit"]');
   const answer=generalResponse.querySelector('textarea[name="answer_text"]')?.value||"";
   if(btnSubmit)btnSubmit.disabled=true;
   if(error)error.hidden=true;
   try{
     await post("clubs/"+state.club+"/assignments/"+state.activeGeneralAssignment+"/submit",{answer_text:answer});
     state.generalDetail=await api("clubs/"+state.club+"/assignments/"+state.activeGeneralAssignment);
     await list(state,api);render();
   }catch(e){if(error){error.textContent=e.message;error.hidden=false;}}
   finally{if(btnSubmit)btnSubmit.disabled=false;}
 };

 const host=document.getElementById("puzzle-board-host");
 if(host && state.assignmentData?.canSolve){
   const item=state.assignmentData.items[state.puzzleIndex];
   try{
     if(!window.PuzzleBoardFactory)throw Error("Chessboard component failed to load. Please refresh.");
     liveBoard=window.PuzzleBoardFactory.create({
       element:host,item,interactive:!item.solved,
       onMove:async uci=>{
         const result=await post("clubs/"+state.club+"/puzzles/assignments/"+state.activeAssignment+"/items/"+item.id,{move:uci});
         item.played=result.played;
         item.solved=result.solved;
         item.mistakes=result.mistakes;
         state.puzzleFeedback=result.correct?(result.solved?"Correct — puzzle solved.":"Correct. Find the next move."):"Not the best move. Try again.";
         updatePuzzleFeedback(state,item);
         return result;
       },
       onError:message=>{state.puzzleFeedback=message;updatePuzzleFeedback(state,item);}
     });
   }catch(err){
     host.textContent="Could not load chessboard: "+(err?.message||err);
   }
 }

}
window.PuzzleModule={page,list,open,bind,destroyBoard};
})();
