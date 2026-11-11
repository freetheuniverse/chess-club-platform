const state={user:null,clubs:[],club:null,data:null,tournament:null,tdata:null,tab:"overview",modal:null,notice:"",puzzleAssignments:null,activeAssignment:null,assignmentData:null,puzzleIndex:0,puzzleSquare:null,puzzleFeedback:"",puzzleMoving:false,showAssignmentForm:false,loading:true,viewRound:null,expandedGame:null,sidebarOpen:false};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=x=>x?new Date(x+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"";
async function api(path,options={}){
 const r=await fetch("/api/"+path,{credentials:"same-origin",...options,headers:options.body?{"Content-Type":"application/json"}:{}});
 const type=r.headers.get("content-type")||"";
 const data=type.includes("application/json")?await r.json().catch(()=>({})):null;
 if(!r.ok){
   if(data?.error)throw Error(data.error);
   if(r.status===503)throw Error("The website service is unavailable. Check your Cloudflare deployment and database.");
   if(r.status>=500)throw Error("Cloudflare could not complete this request. Check Workers Logs for a CPU limit or other server error.");
   throw Error("Request failed (HTTP "+r.status+"). If Cloudflare Access is enabled, confirm you are signed in.");
 }
 if(!data)throw Error("The server returned an unexpected response. Check Cloudflare Access and your deployment.");
 return data;
}
const post=(path,data={})=>api(path,{method:"POST",body:JSON.stringify(data)});
async function load(){try{let m=await api("auth/me");state.user=m.user;state.clubs=(await api("clubs")).clubs;if(state.club&&!state.clubs.some(c=>c.id===state.club))state.club=null;if(!state.club&&state.clubs.length)state.club=state.clubs[0].id;await refresh();}catch(e){state.user=null;}if(!state.user){try{await api("health");}catch(e){state.notice=e.message;}}state.loading=false;render()}
async function refresh(){if(!state.club){state.data=null;return;}state.data=await api("clubs/"+state.club);if(state.tournament)try{state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament)}catch{state.tournament=null;state.tdata=null}}
async function action(fn){try{state.notice="";await fn();await refresh();render()}catch(e){state.notice=e.message;render()}}
function button(label,cmd,cls="btn"){return '<button type="button" class="'+cls+'" data-action="'+cmd+'">'+label+"</button>"}
function empty(s){return '<div class="empty">'+esc(s)+"</div>"}
function sideIcon(name){
 const shapes={
   overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
   tournaments:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4"/>',
   puzzles:'<path d="M8 3H4a1 1 0 0 0-1 1v4h2a2 2 0 1 1 0 4H3v8a1 1 0 0 0 1 1h5v-2a2 2 0 1 1 4 0v2h7a1 1 0 0 0 1-1v-7h-2a2 2 0 1 1 0-4h2V4a1 1 0 0 0-1-1h-7v2a2 2 0 1 1-4 0V3Z"/>',
   members:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
   attendance:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-13 5 2 2 4-4"/>',
   club:'<path d="M3 21V8l9-5 9 5v13M3 21h18M9 21v-7h6v7"/>',
   join:'<path d="M9 12h12M16 7l5 5-5 5M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>'
 };
 return '<svg class="side-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[name]||shapes.club)+'</svg>';
}
function shell(content){
 const pages=[["overview","Overview"],["tournaments","Tournaments"],["puzzles","Puzzle Assignments"],["members","Members"],["attendance","Attendance"]];
 const managed=state.clubs.filter(c=>c.role==="moderator");
 const joined=state.clubs.filter(c=>c.role!=="moderator");
 const currentClub=state.clubs.find(c=>c.id===state.club);
 const pageLinks=pages.map(([key,title])=>
   '<button type="button" class="side-link '+(state.tab===key?"active":"")+'" data-action="tab:'+key+'"'+
   (state.tab===key?' aria-current="page"':'')+'>'+sideIcon(key)+'<span>'+title+'</span></button>'
 ).join("");
 const clubLinks=items=>items.map(c=>
   '<button type="button" class="side-club '+(state.club===c.id?"active":"")+'" data-action="club:'+esc(c.id)+'" '+
   (state.club===c.id?'aria-current="true" ':'')+'title="'+esc(c.name)+'">'+
   '<span class="side-club-dot" aria-hidden="true"></span><span class="side-club-name">'+esc(c.name)+'</span></button>'
 ).join("");
 const clubGroups=
   (managed.length?'<div class="side-group-label">Managed</div><div class="side-club-list">'+clubLinks(managed)+'</div>':'')+
   (joined.length?'<div class="side-group-label">Joined</div><div class="side-club-list">'+clubLinks(joined)+'</div>':'')+
   (!state.clubs.length?'<p class="side-empty">No clubs yet. Create or join one to get started.</p>':'');
 const workspace=currentClub?
   '<div class="side-section-divider"></div><div class="side-workspace-heading">'+
     '<div class="side-section-label">Club workspace</div>'+
     '<div class="side-workspace-club" title="'+esc(currentClub.name)+'">'+esc(currentClub.name)+'</div>'+
   '</div><nav class="side-nav" aria-label="Sections for '+esc(currentClub.name)+'">'+pageLinks+'</nav>':
   '<div class="side-section-divider"></div><p class="side-empty side-workspace-empty">Choose a club above to open its workspace.</p>';
 return '<div class="shell"><header class="topbar"><div class="topbar-inner">'+
   '<div class="identity"><button type="button" class="sidebar-toggle" data-action="toggle-sidebar" aria-label="Toggle navigation" aria-controls="sidebar-nav" aria-expanded="'+!!state.sidebarOpen+'"><span aria-hidden="true">☰</span></button>'+
   '<span class="brand">Chess Club Manager</span></div>'+
   '<div class="header-actions"><span class="header-user">'+esc(state.user?.name||"")+'</span>'+button("Sign out","logout","btn text")+'</div></div></header>'+
   '<div class="app-layout">'+
   (state.sidebarOpen?'<button type="button" class="sidebar-scrim" data-action="toggle-sidebar" aria-label="Close navigation"></button>':'')+
   '<aside class="sidebar '+(state.sidebarOpen?"is-open":"")+'" id="sidebar-nav" aria-label="Club navigation">'+
   '<nav class="side-clubs" aria-label="Your clubs">'+
     '<div class="side-section-heading"><span class="side-section-label">Your clubs</span>'+
       '<button type="button" class="side-add" data-action="new-club" title="Create a new club" aria-label="Create a new club">+</button></div>'+
     clubGroups+
     '<button type="button" class="side-link side-join" data-action="join-club">'+sideIcon("join")+'<span>Join a club</span></button>'+
   '</nav>'+workspace+
   '</aside>'+
   '<main class="main" id="maincontent">'+content+'</main></div></div>';
}
function renderHeader(){
 const name=state.data?.club?.name||"Your clubs";
 const titles={overview:"Overview",tournaments:"Tournaments",members:"Members",attendance:"Attendance",puzzles:"Puzzle Assignments"};
 return '<div class="top"><div><div class="eyebrow">'+esc(name)+'</div><h1>'+titles[state.tab]+'</h1></div>'+
  (state.data?.role==="moderator" && ["overview","tournaments"].includes(state.tab)?button("New tournament","new-tournament"):"")+
  '</div>';
}
function overview(){
 const d=state.data;
 const active=d.tournaments.filter(t=>t.status==="active").length;
 const dates=new Set(d.attendance.map(x=>x.event_date)).size;
 return '<div class="summary-line">'+[
  [d.members.length,"Members"],[d.tournaments.length,"Tournaments"],[active,"In progress"],[dates,"Attendance dates"]
 ].map(([v,k])=>'<div class="summary-cell"><span class="summary-label">'+k+'</span><div class="summary-value">'+v+'</div></div>').join("")+
 '</div><div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Recent tournaments</h2>'+button("View all","tab:tournaments","btn ghost small")+'</div>'+
 tournamentList(d.tournaments.slice(0,6))+'</section><div class="stack"><section class="panel"><div class="panel-heading"><h2>Club access</h2></div>'+
 '<div class="panel-body">'+(d.role==="moderator"?'<p class="panel-note">Share this code with new members.</p><div class="spread" style="margin-top:10px"><span class="code-line">'+esc(d.club.join_code)+'</span>'+button("Copy code","copy-code","btn ghost small")+'</div>':'<p class="panel-note">You are a member of this club.</p>')+
 '</div></section><section class="panel"><div class="panel-heading"><h2>Attendance</h2></div><div class="panel-body"><p class="panel-note">'+d.attendance.length+' recent attendance records</p><p style="margin-top:12px">'+button("View attendance","tab:attendance","btn ghost small")+'</p></div></section></div></div>';
}
function tournamentList(items){
 if(!items.length)return '<div class="empty-action"><p>No tournaments have been created.</p>'+button("Start new tournament","new-tournament")+'</div>';
 return '<div class="tablewrap"><table aria-label="Tournaments"><thead><tr><th>Tournament</th><th>Date</th><th class="num">Players</th><th>Status</th><th></th></tr></thead><tbody>'+
 items.map(t=>'<tr><td><button type="button" class="table-link" data-action="tournament:'+t.id+'">'+esc(t.title)+'</button></td>'+
 '<td>'+date(t.event_date)+'</td><td class="num">'+t.player_count+'</td><td><span class="pill '+esc(t.status)+'">'+esc(t.status)+'</span></td>'+
 '<td style="text-align:right">'+button("Open","tournament:"+t.id,"btn ghost small")+'</td></tr>').join("")+
 '</tbody></table></div>';
}
function tournaments(){
 return '<section class="panel"><div class="panel-heading"><h2>All tournaments</h2><span class="muted">'+state.data.tournaments.length+' total</span></div>'+
 tournamentList(state.data.tournaments)+'</section>';
}
function members(){
 const d=state.data;
 return '<section class="panel"><div class="panel-heading"><h2>Club members</h2><span class="muted">'+d.members.length+' players</span></div>'+
 (d.members.length?'<div class="tablewrap"><table><thead><tr><th>Player</th><th>Access</th><th class="num">Days present</th></tr></thead><tbody>'+
 d.members.map(m=>'<tr><td class="player-name">'+esc(m.name)+'</td><td><span class="pill">'+esc(m.role)+'</span></td><td class="num">'+d.attendance.filter(x=>x.user_id===m.id).length+'</td></tr>').join("")+'</tbody></table></div>':empty("No club members yet."))+'</section>';
}
function attendance(){
 const rows=state.data.attendance;
 return '<section class="panel"><div class="panel-heading"><h2>Attendance</h2><span class="muted">'+rows.length+' recent records</span></div>'+
 (rows.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Player</th></tr></thead><tbody>'+
 rows.map(x=>'<tr><td>'+date(x.event_date)+'</td><td>'+esc(x.name)+'</td></tr>').join("")+'</tbody></table></div>':empty("No tournament attendance has been recorded."))+
 '</section>';
}
function puzzles(){
 return window.PuzzleModule ? window.PuzzleModule.page(state) :
 '<section class="panel"><div class="panel-body">Puzzle interface could not load. Refresh the page.</div></section>';
}
function tournamentDetail(){
 const d=state.tdata,t=d.tournament,can=state.data.role==="moderator",completed=t.status==="completed";
 const roundCount=d.rounds.length;
 const roundNumber=state.viewRound && state.viewRound>=1 && state.viewRound<=roundCount?state.viewRound:roundCount;
 const visibleGames=d.games.filter(g=>g.round_number===roundNumber);
 const unselected=state.data.members.filter(m=>!d.players.some(p=>p.id===m.id));
 const counts=new Map(d.players.map(p=>[p.id,{wins:0,draws:0,losses:0}]));
 for(const g of d.games){
   if(!g.black_id||!g.result)continue;
   const white=counts.get(g.white_id),black=counts.get(g.black_id);
   if(g.result==="1-0"){if(white)white.wins++;if(black)black.losses++;}
   if(g.result==="0-1"){if(black)black.wins++;if(white)white.losses++;}
   if(g.result==="1/2-1/2"){if(black)black.draws++;if(white)white.draws++;}
 }
 function gameRow(g,index){
   if(!g.black_id)return '<div class="bye-row"><span class="board-number">'+(index+1)+'</span><strong>'+esc(g.white_name)+'</strong><span class="pill">Bye · 1 point</span></div>';
   const result=g.result==="1-0"?"White wins":g.result==="0-1"?"Black wins":g.result==="1/2-1/2"?"Draw":"";
   const expanded=state.expandedGame===g.id;
   let center;
   if(result){
     center='<span class="result-chip">'+result+'</span>'+(can&&!completed?'<button type="button" class="change-result" data-action="result-toggle:'+g.id+'">Change result</button>':'');
   }else{
     center=can&&!completed?'<button type="button" class="vs-toggle" aria-expanded="'+expanded+'" data-action="result-toggle:'+g.id+'">VS</button>':'<span class="muted">VS</span>';
   }
   const picker=can&&!completed&&expanded?'<div class="match-result">'+
     button("White wins","result:"+g.id+":1-0","btn ghost small")+
     button("Draw","result:"+g.id+":1/2-1/2","btn ghost small")+
     button("Black wins","result:"+g.id+":0-1","btn ghost small")+
     '</div>':'';
   return '<div class="match"><div class="match-row"><span class="board-number">'+(index+1)+'</span>'+
     '<span class="player-slot">'+esc(g.white_name)+'</span><div class="center-cell">'+center+'</div>'+
     '<span class="player-slot">'+esc(g.black_name)+'</span></div>'+picker+'</div>';
 }
 const roundNav=roundCount>1?'<div class="round-nav no-print">'+
   '<button type="button" class="btn ghost small" aria-label="Previous round" data-action="round:-1" '+(roundNumber<=1?'disabled':'')+'>‹</button>'+
   '<button type="button" class="btn ghost small" aria-label="Next round" data-action="round:1" '+(roundNumber>=roundCount?'disabled':'')+'>›</button></div>':'';
 const pairings=roundCount?'<div class="match-header"><span>Board</span><span>White</span><span class="center-cell">Result</span><span>Black</span></div>'+
 visibleGames.map(gameRow).join(""):empty("Add at least two players, then select New pairings.");
 const standings=d.standings.map((p,i)=>{
   const c=counts.get(p.id)||{wins:0,draws:0,losses:0};
   return '<tr><td class="num">'+(i+1)+'</td><td class="player-name">'+esc(p.name)+'</td><td class="num points">'+p.points.toFixed(1)+'</td>'+
    '<td class="num">'+c.wins+'</td><td class="num">'+c.draws+'</td><td class="num">'+c.losses+'</td></tr>';
 }).join("");
 return '<a class="back interactive" data-action="close-tournament">← Tournaments</a>'+
 '<div class="workspace-title"><div class="spread"><div><div class="eyebrow">Tournament</div><h1>'+esc(t.title)+'</h1>'+
 '<p class="muted">'+date(t.event_date)+' · '+d.players.length+' players · '+esc(t.status)+'</p></div>'+
 (can&&!completed&&roundCount?button("Finish tournament","complete-tournament","btn ghost small"):"")+
 '</div></div><div class="tournament-workspace"><aside>'+
 '<section class="panel"><div class="panel-heading"><h2>Player roster</h2><span class="muted">'+d.players.length+' players</span></div>'+
 '<div class="roster-list">'+(d.players.length?d.players.map((p,i)=>'<div class="roster-line"><span class="row"><span class="roster-number">'+(i+1)+'</span><strong>'+esc(p.name)+'</strong></span></div>').join(""):empty("No players added."))+'</div>'+
 (can&&t.status==="draft"?'<div class="roster-add"><div class="spread" style="margin-bottom:9px"><h3>Add club members</h3><span class="selection-actions">'+button("All","select-all","btn text")+button("Clear","select-none","btn text")+'</span></div>'+
 '<div class="roster-box">'+(unselected.length?unselected.map(p=>'<label class="selectrow"><input type="checkbox" class="playerpick" value="'+p.id+'"><span>'+esc(p.name)+'</span></label>').join(""):empty("All members are playing."))+
 '</div><div style="margin-top:11px">'+button("Add selected players","add-players","btn ghost small")+'</div></div>':'')+
 '</section></aside><div class="workspace-main"><section class="panel"><div class="panel-heading"><div class="round-title-control">'+
 '<h2>'+(roundCount?"Round "+roundNumber:"Pairings")+'</h2>'+roundNav+'</div>'+
 '<div class="round-actions">'+(can&&!completed?button(roundCount?"New pairings":"Start round 1","new-round","btn small"):"")+'</div></div>'+
 '<div>'+pairings+'</div></section>'+
 '<section class="panel"><div class="panel-heading"><h2>Standings</h2><span class="muted">Win 1 · Draw 0.5 · Loss 0</span></div>'+
 '<div class="tablewrap"><table aria-label="Standings"><thead><tr><th class="num">Rank</th><th>Player</th><th class="num">Points</th><th class="num">W</th><th class="num">D</th><th class="num">L</th></tr></thead>'+
 '<tbody>'+standings+'</tbody></table></div></section></div></div>';
}
function modal(){
 if(!state.modal)return "";
 const mode=state.modal;
 const title=mode==="new-club"?"Create club":mode==="join-club"?"Join club":"Start new tournament";
 const fields=mode==="new-club"?'<label>Club name<input class="field" name="name" placeholder="Club name" minlength="3" required></label>':
   mode==="join-club"?'<label>Club code<input class="field" name="code" placeholder="Join code" required></label>':
   '<label>Tournament name<input class="field" name="title" placeholder="Tournament name" minlength="3" required></label>'+
   '<label>Date<input type="date" class="field" name="event_date" required></label>'+
   '<div><div class="spread" style="margin-bottom:8px"><h3>Participating members</h3><span class="selection-actions">'+
   button("Select all","select-all-start","btn text")+button("Clear","select-none-start","btn text")+'</span></div>'+
   '<div class="roster-box">'+(state.data?.members.length?state.data.members.map(p=>
      '<label class="selectrow"><input type="checkbox" class="start-player" value="'+p.id+'"><span>'+esc(p.name)+'</span></label>').join(""):empty("Create or invite club members first."))+
   '</div><p class="modal-hint" style="margin-top:7px">You can also add members before the first round.</p></div>';
 return '<div class="modalcover"><section class="modal" role="dialog" aria-modal="true" aria-label="'+title+'">'+
 '<div class="modal-heading"><h2>'+title+'</h2><button class="close" type="button" aria-label="Close" data-action="close-modal">×</button></div>'+
 '<form id="modalform" class="form">'+fields+'<div class="form-actions">'+button("Cancel","close-modal","btn ghost")+
 '<button type="submit" class="btn">'+(mode==="join-club"?"Join club":mode==="new-club"?"Create club":"Start tournament")+'</button></div></form></section></div>';
}
function auth(){
 return '<div class="auth"><section class="modal"><div class="identity"><span class="brand">Chess Club Manager</span></div>'+
 '<h1 class="auth-title">Create account</h1><p class="auth-description">Register to manage or join a chess club.</p>'+
 '<form id="authform" class="form">'+
 '<label id="namefield">Your name<input name="name" class="field" placeholder="Full name" autocomplete="name" minlength="2" maxlength="100" required></label>'+
 '<label>Email address<input name="email" type="email" class="field" required autocomplete="email"></label>'+
 '<label>Password<input name="password" type="password" class="field" minlength="10" required autocomplete="new-password"></label>'+
 '<button type="submit" class="btn" id="authsubmit">Create account</button>'+
 '<div id="auth-error" class="notice" role="alert" hidden></div></form>'+
 '<p class="auth-footer"><span class="interactive" id="authswitch" role="button" tabindex="0">Already have an account? Sign in</span></p>'+
 '</section></div>';
}
function render(){
 // A chessboard uses document-level pointer handlers: release them before replacing DOM.
 if(typeof window!=="undefined")window.PuzzleModule?.destroyBoard?.();
 if(state.loading){$("app").innerHTML='<div class="auth"><section class="modal"><h2>Loading Chess Club Manager…</h2></section></div>';return;}
 if(!state.user){
   $("app").innerHTML=auth()+(state.notice?'<div class="notice" role="alert">'+esc(state.notice)+'</div>':"");
   bindAuth();return;
 }
 const viewingTournament=!!(state.tournament&&state.tdata);
 let content=(viewingTournament||state.tab==="puzzles")?"":renderHeader();
 if(state.notice)content+='<div class="notice" role="alert">'+esc(state.notice)+'</div>';
 if(!state.club){
   content+='<section class="panel"><div class="panel-heading"><h2>Set up your chess club</h2></div>'+
   '<div class="empty-action"><p>Create a club or join one with an invitation code.</p><div class="row">'+
   button("Create club","new-club")+button("Join club","join-club","btn ghost")+'</div></div></section>';
 } else if(viewingTournament) content+=tournamentDetail();
 else content+=({overview,tournaments,members,attendance,puzzles}[state.tab]||overview)();
 $("app").innerHTML=shell(content)+modal();
 bind();
}
function bindAuth(){
 let signup=true;
 const nameInput=$("namefield").querySelector("input");
 const passwordInput=$("authform").querySelector('input[name="password"]');
 // Do not rely on hidden required fields when switching to sign-in.
 const toggle=()=>{
   signup=!signup;
   $("namefield").style.display=signup?"":"none";
   nameInput.required=signup;
   passwordInput.autocomplete=signup?"new-password":"current-password";
   $("authsubmit").textContent=signup?"Create account":"Sign in";
   const title=document.querySelector(".auth-title");if(title)title.textContent=signup?"Create account":"Sign in";
   $("authswitch").textContent=signup?"Already have an account? Sign in":"New here? Create an account";
   const errorEl=$("auth-error");errorEl.hidden=true;errorEl.textContent="";
 };
 $("authswitch").onclick=toggle;
 $("authswitch").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}};
 $("authform").onsubmit=async e=>{
   e.preventDefault();
   const form=e.currentTarget,f=new FormData(form),submit=$("authsubmit"),errorEl=$("auth-error");
   errorEl.hidden=true;errorEl.textContent="";submit.disabled=true;
   try{
     const result=await post("auth/"+(signup?"register":"login"),Object.fromEntries(f));
     state.user=result.user;state.clubs=(await api("clubs")).clubs;
     state.club=state.clubs[0]?.id||null;state.notice="";
     await refresh();render();
   }catch(e){
     errorEl.textContent=e.message||"Account request failed. Please try again.";errorEl.hidden=false;
   }finally{submit.disabled=false;}
 };
}
function bind(){
 document.querySelectorAll("[data-action]").forEach(el=>el.onclick=()=>{
   const [a,id,value]=el.dataset.action.split(":");
   if(a==="tab"){
     state.tab=id;state.sidebarOpen=false;state.tournament=null;state.tdata=null;
     state.viewRound=null;state.expandedGame=null;state.activeAssignment=null;state.assignmentData=null;
     if(id==="puzzles" && state.club && typeof window!=="undefined" && window.PuzzleModule){
       action(async()=>{await window.PuzzleModule.list(state,api);});
     } else render();
   } else if(a==="toggle-sidebar"){
     state.sidebarOpen=!state.sidebarOpen;render();
   } else if(a==="club"){
     if(id===state.club){
       state.sidebarOpen=false;render();return;
     }
     action(async()=>{
       state.club=id;state.sidebarOpen=false;state.tab="overview";
       state.tournament=null;state.tdata=null;state.viewRound=null;state.expandedGame=null;
       state.puzzleAssignments=null;state.activeAssignment=null;state.assignmentData=null;state.showAssignmentForm=false;
     });
   } else if(a==="new-club"||a==="join-club"||a==="new-tournament"){
     state.modal=a;state.notice="";state.sidebarOpen=false;render();
   } else if(a==="close-modal"){
     state.modal=null;render();
   } else if(a==="copy-code"){
     navigator.clipboard?.writeText(state.data.club.join_code).then(()=>{state.notice="Join code copied.";render()});
   } else if(a==="logout"){
     action(async()=>{await post("auth/logout");state.user=null;state.club=null;state.data=null;state.tournament=null;state.viewRound=null;state.expandedGame=null;state.puzzleAssignments=null;state.activeAssignment=null;state.assignmentData=null;state.showAssignmentForm=false;});
   } else if(a==="tournament"){
     action(async()=>{
       state.tournament=id;state.viewRound=null;state.expandedGame=null;
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+id);
     });
   } else if(a==="close-tournament"){
     state.tournament=null;state.tdata=null;state.viewRound=null;state.expandedGame=null;render();
   } else if(a==="round"){
     const count=state.tdata?.rounds.length||0;
     const current=state.viewRound||count;
     state.viewRound=Math.max(1,Math.min(count,current+Number(id)));
     state.expandedGame=null;render();
   } else if(a==="result-toggle"){
     state.expandedGame=state.expandedGame===id?null:id;render();
   } else if(a==="result"){
     action(async()=>{
       await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/games/"+id,{result:value});
       state.expandedGame=null;
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament);
     });
   } else if(a==="select-all"||a==="select-none"){
     document.querySelectorAll(".playerpick").forEach(x=>x.checked=a==="select-all");
   } else if(a==="select-all-start"||a==="select-none-start"){
     document.querySelectorAll(".start-player").forEach(x=>x.checked=a==="select-all-start");
   } else if(a==="add-players"){
     action(async()=>{
       const ids=[...document.querySelectorAll(".playerpick:checked")].map(x=>x.value);
       if(!ids.length)throw Error("Select at least one player.");
       await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/players",{user_ids:ids});
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament);
     });
   } else if(a==="new-round"){
     if(!confirm("Generate the next round of pairings?"))return;
     action(async()=>{
       await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/rounds");
       state.viewRound=null;state.expandedGame=null;
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament);
     });
   } else if(a==="complete-tournament"){
     if(!confirm("Finish this tournament? Results will become read-only."))return;
     action(async()=>{
       await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/complete");
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament);
     });
   }
 });
 if(typeof window!=="undefined" && window.PuzzleModule && state.tab==="puzzles")window.PuzzleModule.bind({state,render,api,post,action});
 const form=$("modalform");
 if(form)form.onsubmit=e=>{
   e.preventDefault();
   const b=Object.fromEntries(new FormData(form));
   const mode=state.modal;
   const ids=[...document.querySelectorAll(".start-player:checked")].map(x=>x.value);
   action(async()=>{
     let result;
     if(mode==="new-club"){result=await post("clubs/create",b);state.club=result.id;state.tab="overview";state.sidebarOpen=false;}
     else if(mode==="join-club"){result=await post("clubs/join",b);state.club=result.club.id;state.tab="overview";state.sidebarOpen=false;}
     else{
       result=await post("clubs/"+state.club+"/tournaments",{title:b.title,event_date:b.event_date});
       state.tournament=result.id;state.viewRound=null;state.expandedGame=null;
       if(ids.length)await post("clubs/"+state.club+"/tournaments/"+result.id+"/players",{user_ids:ids});
       state.tdata=await api("clubs/"+state.club+"/tournaments/"+result.id);
     }
     state.clubs=(await api("clubs")).clubs;state.modal=null;
   });
 };
}

render();load();
