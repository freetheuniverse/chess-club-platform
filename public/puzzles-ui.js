(() => {
const THEME_OPTIONS=[["mix","Mixed tactics"],["fork","Forks"],["pin","Pins"],["skewer","Skewers"],["discoveredAttack","Discovered attacks"],["mateIn1","Mate in one"],["mateIn2","Mate in two"],["mateIn3","Mate in three"],["endgame","Endgames"],["opening","Openings"],["middlegame","Middlegames"],["hangingPiece","Hanging pieces"],["defensiveMove","Defensive moves"],["promotion","Promotion"],["sacrifice","Sacrifices"],["backRankMate","Back-rank mate"]];
const DIFFICULTIES=[["easiest","Very easy"],["easier","Easy"],["normal","Normal"],["harder","Hard"],["hardest","Very hard"]];
const symbols={w:{k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"},b:{k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}};
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pretty=x=>x?.replace(/([A-Z])/g," $1")||"";
const fmt=x=>x?new Date(x+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"No deadline";
const btn=(text,action,cls="btn ghost small")=>'<button type="button" class="'+cls+'" data-puzzle-action="'+action+'">'+text+"</button>";
const options=(pairs,selected)=>pairs.map(([key,label])=>'<option value="'+key+'"'+(key===selected?" selected":"")+'>'+label+"</option>").join("");
async function list(state,api){state.puzzleAssignments=(await api("clubs/"+state.club+"/puzzles/assignments")).assignments;}
async function open(state,api,id){
 state.activeAssignment=id;state.assignmentData=await api("clubs/"+state.club+"/puzzles/assignments/"+id);
 state.puzzleIndex=Math.max(0,state.assignmentData.items.findIndex(i=>!i.solved));
 state.puzzleFeedback="";state.puzzleSquare=null;
}
function boardPosition(item){
 if(!window.ChessEngine)throw Error("Chessboard is not loaded. Refresh this page.");
 const game=new window.ChessEngine(item.start_fen);
 for(const uci of item.played){
   const move={from:uci.slice(0,2),to:uci.slice(2,4)};
   if(uci.length===5)move.promotion=uci[4];
   game.move(move);
 }
 return game;
}
function boardHtml(item,state){
 let game;try{game=boardPosition(item);}catch(e){return '<p class="notice">'+escape(e.message)+'</p>';}
 const flip=item.start_fen.split(" ")[1]==="b";
 const files=flip?"hgfedcba":"abcdefgh",ranks=flip?"12345678":"87654321";
 const squares=[];
 for(const rank of ranks)for(const file of files){
   const square=file+rank,piece=game.get(square),dark=((file.charCodeAt(0)-97+Number(rank))%2===1);
   const selected=state.puzzleSquare===square;
   const pieceHtml=piece?'<span class="chess-piece '+(piece.color==="w"?"white-piece":"black-piece")+'">'+symbols[piece.color][piece.type]+'</span>':"";
   squares.push('<button type="button" aria-label="'+square+(piece?" "+piece.color+" "+piece.type:"")+'" class="chess-square '+(dark?"dark":"light")+(selected?" selected":"")+'" data-puzzle-square="'+square+'" '+(item.solved?'disabled':'')+'>'+pieceHtml+'</button>');
 }
 return '<div class="chess-board" role="group" aria-label="Chess puzzle board">'+squares.join("")+'</div>';
}
function listing(state){
 const arr=state.puzzleAssignments||[];
 const canManage=state.data?.role==="moderator";
 return '<div class="top"><div><div class="eyebrow">'+escape(state.data?.club?.name||"Chess club")+'</div><h1>Puzzle assignments</h1></div>'+
 (canManage?btn("Assign puzzles","new-assignment","btn"):"")+'</div>'+
 (state.puzzleLoading?'<div class="panel"><div class="empty">Loading assignments…</div></div>':
 arr.length?'<section class="panel"><div class="panel-heading"><h2>Assignments</h2><span class="muted">'+arr.length+' total</span></div>'+
 '<div class="tablewrap"><table><thead><tr><th>Assignment</th><th>Theme</th><th class="num">Puzzles</th><th>Due</th><th>Progress</th><th></th></tr></thead><tbody>'+
 arr.map(a=>'<tr><td><strong>'+escape(a.title)+'</strong></td><td>'+escape(pretty(a.theme))+'</td><td class="num">'+a.puzzles+'</td>'+
 '<td>'+fmt(a.due_date)+'</td><td class="muted">'+(canManage?a.solved+" / "+a.members*a.puzzles+" solved":a.my_solved+" / "+a.puzzles+" solved")+'</td>'+
 '<td>'+btn("Open","open:"+a.id)+'</td></tr>').join("")+'</tbody></table></div></section>':
 '<section class="panel"><div class="panel-heading"><h2>Puzzle assignments</h2></div><div class="empty-action"><p>No puzzles assigned to this club yet.</p>'+
 (canManage?btn("Create first assignment","new-assignment","btn"):"")+'</div></section>')+
 (state.showAssignmentForm?assignmentForm(state):"");
}
function assignmentForm(state){
 const members=state.data?.members||[];
 return '<section class="puzzle-form-layer" role="dialog" aria-label="New puzzle assignment" aria-modal="true"><div class="puzzle-form-panel">'+
 '<div class="panel-heading"><h2>Assign Lichess puzzles</h2>'+btn("Close","cancel-assignment")+'</div>'+
 '<form id="puzzle-create-form" class="panel-body form">'+
 '<label>Assignment title<input name="title" class="field" required minlength="3" maxlength="100" placeholder="e.g. Fork practice — Week 1"></label>'+
 '<div class="puzzle-form-grid"><label>Topic<select name="theme" class="field">'+options(THEME_OPTIONS,"mix")+'</select></label>'+
 '<label>Difficulty<select name="difficulty" class="field">'+options(DIFFICULTIES,"easier")+'</select></label>'+
 '<label>Number of puzzles<input class="field" name="count" type="number" min="1" max="10" value="5" required></label>'+
 '<label>Due date (optional)<input class="field" name="due_date" type="date"></label></div>'+
 '<div><div class="spread"><strong>Assign to members</strong><span>'+btn("All","members-all","btn text")+" "+btn("Clear","members-none","btn text")+'</span></div>'+
 '<div class="puzzle-member-list">'+members.map(m=>'<label class="selectrow"><input class="puzzle-member" type="checkbox" value="'+escape(m.id)+'" checked><span>'+escape(m.name)+'</span></label>').join("")+'</div></div>'+
 '<label>Lichess puzzle IDs (optional)<input class="field" name="puzzle_ids" placeholder="e.g. PSjmf, 0haqU"></label>'+
 '<p class="modal-hint">Leave IDs blank for randomly selected puzzles based on topic and difficulty. Specifying IDs uses exactly those puzzles.</p>'+
 '<div id="puzzle-form-error" class="notice" role="alert" hidden></div>'+
 '<div class="form-actions">'+btn("Cancel","cancel-assignment")+'<button type="submit" class="btn" id="puzzle-submit">Create assignment</button></div>'+
 '</form></div></section>';
}
function detail(state){
 const d=state.assignmentData;
 if(!d)return '<div class="panel"><div class="empty">Loading assignment…</div></div>';
 const items=d.items||[],item=items[state.puzzleIndex]||items[0];
 const count=items.filter(p=>p.solved).length;
 const left='<section class="panel"><div class="panel-heading"><h2>Puzzle list</h2><span class="muted">'+count+" of "+items.length+' solved</span></div>'+
 '<div class="puzzle-items">'+items.map((p,i)=>'<button type="button" class="puzzle-item '+(state.puzzleIndex===i?"current":"")+'" data-puzzle-action="select:'+i+'">'+
 '<span>Question '+(i+1)+'</span><span class="muted">'+p.rating+' · '+(p.solved?"Solved":p.mistakes?"In progress":"Not started")+'</span></button>').join("")+'</div>'+
 '<div class="panel-body"><p class="panel-note">Source: Lichess puzzles. Moves are checked by the club website.</p></div></section>';
 const board=item?'<section class="panel"><div class="panel-heading"><div><h2>Puzzle '+(state.puzzleIndex+1)+'</h2><p class="muted">'+escape(item.themes?.slice(0,3).map(pretty).join(" · "))+' · rating '+item.rating+'</p></div>'+
 '<span class="pill '+(item.solved?"active":"")+'">'+(item.solved?"Solved":"In progress")+'</span></div><div class="puzzle-solving">'+
 boardHtml(item,state)+'<div class="puzzle-instructions"><strong>'+(item.solved?"Completed":"Find the best move")+'</strong>'+
 '<p class="muted">'+(item.solved?"Good work. Select another puzzle from the list.":"Click a piece, then click the destination square. The opponent replies automatically when you find the correct move.")+'</p>'+
 '<div id="puzzle-feedback" class="puzzle-feedback" role="status">'+escape(state.puzzleFeedback||"")+'</div>'+
 '<p class="muted">Mistakes: '+item.mistakes+'</p>'+
 '<div class="row" style="margin-top:12px">'+(state.puzzleIndex>0?btn("Previous","select:"+(state.puzzleIndex-1)):"")+
 (state.puzzleIndex<items.length-1?btn("Next puzzle","select:"+(state.puzzleIndex+1),"btn"):"")+'</div>'+
 '</div></div></section>':"";
 const report=Array.isArray(d.summary)?'<section class="panel"><div class="panel-heading"><h2>Member progress</h2><span class="muted">'+d.summary.length+' members</span></div>'+
 '<div class="tablewrap"><table><thead><tr><th>Member</th><th class="num">Solved</th><th class="num">Mistakes</th></tr></thead><tbody>'+
 d.summary.map(s=>'<tr><td>'+escape(s.name)+'</td><td class="num">'+s.solved+" / "+items.length+'</td><td class="num">'+s.mistakes+'</td></tr>').join("")+
 '</tbody></table></div></section>':"";
 return '<a class="back interactive" data-puzzle-action="back">← Puzzle assignments</a>'+
 '<div class="workspace-title"><div class="eyebrow">Puzzle assignment</div><h1>'+escape(d.assignment.title)+'</h1>'+
 '<p class="muted">'+escape(pretty(d.assignment.theme))+' · '+fmt(d.assignment.due_date)+' · '+items.length+' puzzles</p></div>'+
 '<div class="tournament-workspace"><aside>'+left+'</aside><div class="workspace-main">'+
 (d.canSolve?board:'<section class="panel"><div class="panel-body"><p class="panel-note">This assignment is not assigned to your moderator account. Member progress is shown below.</p></div></section>')+
 report+'</div></div>';
}
function page(state){
 if(state.activeAssignment)return detail(state);
 return listing(state);
}
function bind({state,render,api,post,action}){
 document.querySelectorAll("[data-puzzle-action]").forEach(el=>el.onclick=()=>{
   const [cmd,val]=el.dataset.puzzleAction.split(":");
   if(cmd==="new-assignment"){state.showAssignmentForm=true;render();}
   if(cmd==="cancel-assignment"){state.showAssignmentForm=false;render();}
   if(cmd==="members-all"||cmd==="members-none")document.querySelectorAll(".puzzle-member").forEach(x=>x.checked=cmd==="members-all");
   if(cmd==="back"){state.activeAssignment=null;state.assignmentData=null;state.puzzleFeedback="";render();}
   if(cmd==="select"){state.puzzleIndex=Number(val);state.puzzleSquare=null;state.puzzleFeedback="";render();}
   if(cmd==="open"){action(async()=>{await open(state,api,val)});}
 });
 const form=document.getElementById("puzzle-create-form");
 if(form)form.onsubmit=async e=>{
   e.preventDefault();
   const submit=document.getElementById("puzzle-submit"), error=document.getElementById("puzzle-form-error");
   const payload=Object.fromEntries(new FormData(form));
   payload.count=Number(payload.count);payload.user_ids=[...document.querySelectorAll(".puzzle-member:checked")].map(x=>x.value);
   if(!payload.user_ids.length){error.textContent="Select at least one member.";error.hidden=false;return;}
   submit.disabled=true;error.hidden=true;
   try{
     const created=await post("clubs/"+state.club+"/puzzles/assignments",payload);
     state.showAssignmentForm=false;
     await list(state,api);await open(state,api,created.id);
     render();
   }catch(e){error.textContent=e.message;error.hidden=false;}finally{submit.disabled=false;}
 };
 document.querySelectorAll("[data-puzzle-square]").forEach(square=>square.onclick=async()=>{
   const item=state.assignmentData?.items[state.puzzleIndex];
   if(!item||item.solved||!state.assignmentData.canSolve||state.puzzleMoving)return;
   let game;try{game=boardPosition(item);}catch(e){state.puzzleFeedback=e.message;render();return;}
   const target=square.dataset.puzzleSquare;
   if(!state.puzzleSquare){
     const p=game.get(target);
     if(!p||p.color!==game.turn())return;
     state.puzzleSquare=target;render();return;
   }
   const from=state.puzzleSquare;state.puzzleSquare=null;
   if(from===target){render();return;}
   const p=game.get(target);
   if(p&&p.color===game.turn()){state.puzzleSquare=target;render();return;}
   let mv;
   const moving=game.get(from);
   let promotion=null;
   if(moving?.type==="p" && (target.endsWith("1") || target.endsWith("8"))){
     const answer=window.prompt("Promote to: q (queen), r (rook), b (bishop), n (knight)","q");
     if(answer===null){render();return;}
     promotion=String(answer).trim().toLowerCase();
     if(!["q","r","b","n"].includes(promotion)){
       state.puzzleFeedback="Choose q, r, b, or n for promotion.";render();return;
     }
   }
   const move={from,to:target};
   if(promotion)move.promotion=promotion;
   try{mv=game.move(move);}catch{}
   if(!mv){state.puzzleFeedback="That is not a legal move.";render();return;}
   state.puzzleMoving=true;
   try{
     const uci=mv.from+mv.to+(mv.promotion||"");
     const reply=await post("clubs/"+state.club+"/puzzles/assignments/"+state.activeAssignment+"/items/"+item.id,{move:uci});
     item.played=reply.played;item.solved=reply.solved;item.mistakes=reply.mistakes;
     state.puzzleFeedback=reply.correct?(reply.solved?"Correct — puzzle solved.":"Correct. Find the next move."):"Not the best move. Try again.";
     render();
   }catch(e){state.puzzleFeedback=e.message;render();}
   finally{state.puzzleMoving=false;}
 });
}
window.PuzzleModule={page,list,open,bind};
})();
