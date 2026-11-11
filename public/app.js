const state={user:null,clubs:[],club:null,data:null,tournament:null,tdata:null,tab:"overview",modal:null,notice:"",loading:true};
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
function button(label,cmd,cls="btn"){return '<button class="'+cls+'" data-action="'+cmd+'">'+label+"</button>"}
function empty(s){return '<div class="empty">'+esc(s)+"</div>"}
function shell(content){
 const nav=[["overview","Overview"],["tournaments","Tournaments"],["members","Members"],["attendance","Attendance"],["puzzles","Puzzles"]];
 const options=state.clubs.map(c=>'<option value="'+c.id+'" '+(c.id===state.club?"selected":"")+'>'+esc(c.name)+'</option>').join("");
 return '<div class="shell"><header class="topbar"><div class="topbar-inner">'+
  '<div class="identity"><span class="mark" aria-hidden="true">♞</span><span class="brand">Chess Club</span></div>'+
  '<div class="header-actions">'+
  (state.clubs.length?'<select id="clubselect" class="field compact" aria-label="Select club">'+options+'</select>':'')+
  button("Join club","join-club","btn ghost small")+button("New club","new-club","btn ghost small")+
  '<span class="header-user">'+esc(state.user?.name||"")+'</span>'+button("Sign out","logout","btn text")+
  '</div></div></header>'+
  '<nav class="tab-bar" aria-label="Club pages"><div class="tab-inner">'+
  nav.map(([k,v])=>'<button type="button" class="nav '+(state.tab===k?"active":"")+'" data-action="tab:'+k+'"'+(state.tab===k?' aria-current="page"':'')+'>'+v+'</button>').join("")+
  '</div></nav><main class="main" id="maincontent">'+content+'</main></div>';
}
function renderHeader(){
 const name=state.data?.club?.name||"Your clubs";
 const titles={overview:"Overview",tournaments:"Tournaments",members:"Members",attendance:"Attendance",puzzles:"Puzzles"};
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
 return '<section class="panel"><div class="panel-heading"><h2>Chess puzzles</h2></div><div class="panel-body">'+
 '<p class="panel-note">Puzzle practice and verified progress tracking are not yet connected to this club.</p>'+
 '<div style="margin-top:16px"><a class="btn ghost" href="https://lichess.org/training" target="_blank" rel="noopener noreferrer">Practice on Lichess</a></div>'+
 '</div></section>';
}
function tournamentDetail(){const d=state.tdata,t=d.tournament,can=state.data.role==="moderator",completed=t.status==="completed";const unselected=state.data.members.filter(m=>!d.players.some(p=>p.id===m.id));return '<a class="back interactive" data-action="close-tournament">← Back to tournaments</a><div class="spread"><div><div class="eyebrow">Tournament workspace</div><h1>'+esc(t.title)+'</h1><span class="muted">'+date(t.event_date)+' · '+d.players.length+' participants · '+esc(t.status)+'</span></div>'+(can&&!completed?button("Finish tournament","complete-tournament","btn ghost"):"")+'</div><div class="content-grid"><div class="stack"><div class="panel"><div class="spread"><h2>Rounds & pairings</h2>'+(can&&!completed?button("+ Generate round","new-round","btn small"):"")+'</div>'+(d.rounds.length?d.rounds.map(r=>'<div><h3>Round '+r.round_number+'</h3><div class="tablewrap"><table><thead><tr><th>White</th><th>Black</th><th>Result</th></tr></thead><tbody>'+d.games.filter(g=>g.round_number===r.round_number).map(g=>'<tr><td>'+esc(g.white_name)+'</td><td>'+esc(g.black_name||"BYE")+'</td><td>'+(g.result==="bye"?"1 point · bye":can&&!completed?'<select class="field" style="padding:7px;width:auto" data-game="'+g.id+'"><option value="" '+(!g.result?"selected":"")+'>Not played</option>'+[["1-0","White wins"],["0-1","Black wins"],["1/2-1/2","Draw"]].map(([k,v])=>'<option value="'+k+'" '+(g.result===k?"selected":"")+'>'+v+'</option>').join("")+'</select>':esc(g.result||"Pending"))+'</td></tr>').join("")+'</tbody></table></div></div>').join(""):empty("No rounds yet. Add players and generate the first round."))+'</div><div class="panel"><h2>Standings</h2><table><thead><tr><th>#</th><th>Player</th><th>Points</th></tr></thead><tbody>'+d.standings.map((p,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(p.name)+'</td><td class="score">'+p.points.toFixed(1)+'</td></tr>').join("")+'</tbody></table></div></div><div class="stack"><div class="panel"><h2>Participants</h2><p class="muted">'+d.players.length+' registered players</p>'+d.players.map(p=>'<div class="card-item">'+esc(p.name)+'</div>').join("")+(d.players.length?"":empty("No participants registered."))+'</div>'+(can&&t.status==="draft"?'<div class="panel"><h2>Add club members</h2><div id="playerchoices">'+(unselected.length?unselected.map(p=>'<label class="selectrow"><input type="checkbox" class="playerpick" value="'+p.id+'">'+esc(p.name)+'</label>').join(""):empty("All club members are enrolled."))+'</div><p>'+button("Add selected players","add-players")+'</p><div class="hint">Each added player receives one attendance record for this date if the tournament date is not in the future.</div></div>':"")+'</div></div>'}
function modal(){if(!state.modal)return "";let mode=state.modal;let title=mode==="new-club"?"Create a chess club":mode==="join-club"?"Join a chess club":"New tournament";return '<div class="modalcover"><div class="modal"><div class="spread"><h2>'+title+'</h2>'+button("×","close-modal","close")+'</div><form id="modalform" class="form">'+(mode==="new-club"?'<label>Club name<input class="field" name="name" placeholder="e.g. SHJC Chess Club" minlength="3" required></label>':mode==="join-club"?'<label>Club join code<input class="field" name="code" placeholder="Enter your code" required></label>':'<label>Tournament name<input class="field" name="title" placeholder="November Club Tournament" minlength="3" required></label><label>Event date<input type="date" class="field" name="event_date" required></label>')+'<button class="btn" type="submit">'+(mode==="join-club"?"Join": "Create")+'</button></form></div></div>'}
function auth(){return '<div class="auth"><div class="modal"><div class="brand" style="color:#173b28;margin-bottom:23px"><span class="mark">♞</span> Chess Club</div><div class="eyebrow">Your chess community</div><h1>Every move matters.</h1><p class="muted">One place for players, tournaments and attendance.</p><form id="authform" class="form"><label id="namefield">Your name<input name="name" class="field" placeholder="Full name" autocomplete="name"></label><label>Email address<input name="email" type="email" class="field" required autocomplete="email"></label><label>Password<input name="password" type="password" class="field" minlength="10" required autocomplete="current-password"></label><button type="submit" class="btn" id="authsubmit">Create account</button><div id="auth-error" class="notice" role="alert" hidden></div></form><p class="muted" style="text-align:center"><span id="authswitch" class="interactive">Already have an account? Sign in</span></p><p class="hint">Accounts are stored privately in your Cloudflare database.</p></div></div>'}
function render(){if(state.loading){$("app").innerHTML='<div class="auth"><h2>Loading chess club…</h2></div>';return}if(!state.user){$("app").innerHTML=auth()+(state.notice?'<div class="notice" style="position:fixed;top:12px;right:12px">'+esc(state.notice)+'</div>':"");bindAuth();return}let content=renderHeader();if(state.notice)content+='<div class="notice">'+esc(state.notice)+'</div>';if(!state.club){content+='<div class="banner"><div><h2>Start your first chess club</h2><p>Create a club for moderators or join an existing one as a student.</p></div><div class="row">'+button("Create club","new-club")+button("Join club","join-club","btn ghost")+'</div></div>'}else if(state.tournament&&state.tdata)content+=tournamentDetail();else content+=({overview,tournaments,members,attendance,puzzles}[state.tab]||overview)();$("app").innerHTML=shell(content)+modal();bind();}
function bindAuth(){
 let signup=true;
 $("authswitch").onclick=()=>{
   signup=!signup;
   $("namefield").style.display=signup?"":"none";
   $("authsubmit").textContent=signup?"Create account":"Sign in";
   $("authswitch").textContent=signup?"Already have an account? Sign in":"New here? Create an account";
   const errorEl=$("auth-error");errorEl.hidden=true;errorEl.textContent="";
 };
 $("authform").onsubmit=async e=>{
   e.preventDefault();
   const form=e.currentTarget, f=new FormData(form), button=$("authsubmit"), errorEl=$("auth-error");
   errorEl.hidden=true;errorEl.textContent="";button.disabled=true;
   try {
     const result=await post("auth/"+(signup?"register":"login"),Object.fromEntries(f));
     state.user=result.user;
     state.clubs=(await api("clubs")).clubs;
     state.club=state.clubs[0]?.id||null;
     state.notice="";
     await refresh();
     render();
   } catch(e) {
     // Keep the form fields in place so a failed request doesn't erase the user's entry.
     errorEl.textContent=e.message||"Account request failed. Please try again.";
     errorEl.hidden=false;
   } finally {
     button.disabled=false;
   }
 };
}
function bind(){document.querySelectorAll("[data-action]").forEach(el=>el.onclick=()=>{const [a,id]=el.dataset.action.split(":");if(a==="tab"){state.tab=id;state.tournament=null;state.tdata=null;render()}else if(a==="new-club"||a==="join-club"||a==="new-tournament"){state.modal=a;render()}else if(a==="close-modal"){state.modal=null;render()}else if(a==="copy-code"){navigator.clipboard?.writeText(state.data.club.join_code).then(()=>{state.notice="Join code copied";render()})}else if(a==="logout"){action(async()=>{await post("auth/logout");state.user=null;state.club=null;state.data=null;state.tournament=null})}else if(a==="tournament"){action(async()=>{state.tournament=id;state.tdata=await api("clubs/"+state.club+"/tournaments/"+id)})}else if(a==="close-tournament"){state.tournament=null;state.tdata=null;render()}else if(a==="add-players"){action(async()=>{const ids=[...document.querySelectorAll(".playerpick:checked")].map(x=>x.value);await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/players",{user_ids:ids});state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament)})}else if(a==="new-round"){if(!confirm("Generate the next round of pairings?"))return;action(async()=>{await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/rounds");state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament)})}else if(a==="complete-tournament"){if(!confirm("Mark this tournament as completed? Results will become read-only."))return;action(async()=>{await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/complete");state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament)})}});
const select=$("clubselect");if(select)select.onchange=()=>action(async()=>{state.club=select.value;state.tournament=null;state.tdata=null});document.querySelectorAll("[data-game]").forEach(el=>el.onchange=()=>{if(!el.value)return;action(async()=>{await post("clubs/"+state.club+"/tournaments/"+state.tournament+"/games/"+el.dataset.game,{result:el.value});state.tdata=await api("clubs/"+state.club+"/tournaments/"+state.tournament)})});const form=$("modalform");if(form)form.onsubmit=e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));const mode=state.modal;action(async()=>{let result;if(mode==="new-club"){result=await post("clubs/create",b);state.club=result.id}else if(mode==="join-club"){result=await post("clubs/join",b);state.club=result.club.id}else{result=await post("clubs/"+state.club+"/tournaments",b);state.tournament=result.id;state.tdata=await api("clubs/"+state.club+"/tournaments/"+result.id)}state.clubs=(await api("clubs")).clubs;state.modal=null})}}
render();load();
