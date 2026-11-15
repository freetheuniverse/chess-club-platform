import {gradebookData} from "./gradebook.js";
// General club assignments. Puzzle assignments stay on the Lichess routes.
// This module does not accept guest tournament players or unauthenticated users.

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const error=(message,status=400)=>json({error:message},status);
const validDue=value=>!value||(
  typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value+"T12:00:00Z")) &&
  new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value
);
const validUrl=value=>{
  if(!value)return true;
  try{
    const url=new URL(value);
    return typeof value==="string" && url.protocol==="https:" && !!url.hostname && !url.username && !url.password && value.length<=800;
  }catch{return false;}
};
const cleanText=(v,max)=>typeof v==="string"&&v.trim().length<=max?v.trim():null;
const ready=async db=>!!(await db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='club_assignments'"
).first());

async function listAssignments(db,club,user,role){
  const exists=await ready(db);
  if(!exists)return json({assignments:[],ready:false});
  const rows=(await db.prepare(`
    SELECT a.id,a.title,a.kind,a.instructions,a.resource_url,a.due_date,a.created_at,
      (SELECT count(*) FROM club_assignment_targets t WHERE t.assignment_id=a.id) assigned,
      (SELECT count(*) FROM club_assignment_submissions s WHERE s.assignment_id=a.id) submitted,
      (SELECT count(*) FROM club_assignment_submissions s WHERE s.assignment_id=a.id AND s.user_id=?) my_submitted
    FROM club_assignments a
    WHERE a.club_id=? AND (?='moderator' OR EXISTS (
      SELECT 1 FROM club_assignment_targets t WHERE t.assignment_id=a.id AND t.user_id=?
    ))
    ORDER BY a.created_at DESC,a.id DESC
    LIMIT 150
  `).bind(user.id,club,role,user.id).all()).results;
  return json({assignments:rows,ready:true});
}
async function createAssignment(db,club,user,role,b){
  if(role!=="moderator")return error("Only moderators can create assignments.",403);
  if(!(await ready(db)))return error("Assignments require database migration 0005. Run npm run db:migrate:cloud.",503);
  const title=cleanText(b?.title,100);
  const instructions=cleanText(b?.instructions??"",3000);
  const kind=b?.kind;
  const due=b?.due_date||null,resource=typeof b?.resource_url==="string"?b.resource_url.trim()||null:b?.resource_url||null;
  if(!title||title.length<3)return error("Enter a title between 3 and 100 characters.");
  if(instructions===null)return error("Instructions must be 3,000 characters or fewer.");
  if(kind!=="study"&&kind!=="written")return error("Choose a supported assignment type.");
  if(!validDue(due))return error("Invalid due date.");
  if(!validUrl(resource))return error("Use an HTTPS resource link with no embedded credentials.");
  if(kind==="study"&&!instructions&&!resource)return error("Add study instructions or a resource link.");
  const all=(await db.prepare("SELECT user_id FROM memberships WHERE club_id=?").bind(club).all()).results.map(r=>r.user_id);
  const users=Array.isArray(b?.user_ids)?[...new Set(b.user_ids)]:[];
  if(!users.length||users.length>200)return error("Choose between 1 and 200 club members.");
  if(users.some(id=>typeof id!=="string"||!all.includes(id)))return error("One or more selected members do not belong to this club.",403);
  const id=crypto.randomUUID();
  const statements=[
    db.prepare("INSERT INTO club_assignments(id,club_id,author_id,kind,title,instructions,resource_url,due_date) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id,club,user.id,kind,title,instructions||"",resource,due),
    ...users.map(uid=>db.prepare("INSERT INTO club_assignment_targets(assignment_id,user_id) VALUES(?,?)").bind(id,uid))
  ];
  await db.batch(statements);
  return json({id},201);
}
async function detail(db,club,user,role,id){
  const a=await db.prepare("SELECT a.*,u.name author_name FROM club_assignments a JOIN users u ON u.id=a.author_id WHERE a.id=? AND a.club_id=?")
    .bind(id,club).first();
  if(!a)return null;
  const target=await db.prepare("SELECT 1 AS yes FROM club_assignment_targets WHERE assignment_id=? AND user_id=?")
    .bind(id,user.id).first();
  if(role!=="moderator"&&!target)return null;
  const mine=target?await db.prepare(
    "SELECT answer_text,submitted_at FROM club_assignment_submissions WHERE assignment_id=? AND user_id=?"
  ).bind(id,user.id).first():null;
  const output={
    assignment:{id:a.id,title:a.title,kind:a.kind,instructions:a.instructions,resource_url:a.resource_url,
      due_date:a.due_date,created_at:a.created_at,author_name:a.author_name},
    targeted:!!target,submission:mine||null
  };
  if(role==="moderator"){
    output.progress=(await db.prepare(`
      SELECT u.id,u.name,s.submitted_at,s.answer_text
      FROM club_assignment_targets t JOIN users u ON u.id=t.user_id
      LEFT JOIN club_assignment_submissions s ON s.assignment_id=t.assignment_id AND s.user_id=t.user_id
      WHERE t.assignment_id=? ORDER BY u.name
    `).bind(id).all()).results;
  }
  return output;
}
async function submit(db,club,user,role,id,b){
  const d=await detail(db,club,user,role,id);
  if(!d)return error("Assignment not found.",404);
  if(!d.targeted)return error("This assignment was not assigned to you.",403);
  const answer=d.assignment.kind==="written"?cleanText(b?.answer_text,3000):"";
  if(d.assignment.kind==="written"&&(!answer||answer.length<5))
    return error("Write a response of at least 5 characters (maximum 3,000).");
  await db.prepare(`
    INSERT INTO club_assignment_submissions(assignment_id,user_id,answer_text,submitted_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(assignment_id,user_id) DO UPDATE SET
      answer_text=excluded.answer_text,submitted_at=CURRENT_TIMESTAMP
  `).bind(id,user.id,answer).run();
  return json({ok:true});
}
export async function handleGeneralAssignments({db,club,user,role,path,method,req}){
  try{
    if(path[3]!=="assignments")return error("Not found.",404);
    if(path.length===4&&method==="GET")return listAssignments(db,club,user,role);
    if(path.length===5&&path[4]==="gradebook"&&method==="GET"){
      if(role!=="moderator")return error("Only moderators can view club-wide assignment progress.",403);
      return json(await gradebookData(db,club));
    }
    if(path.length===4&&method==="POST")return createAssignment(db,club,user,role,await req.json());
    if(!(await ready(db)))return error("Assignments require database migration 0005. Run npm run db:migrate:cloud.",503);
    const id=path[4];
    if(path.length===5&&method==="GET"){
      const d=await detail(db,club,user,role,id);
      return d?json(d):error("Assignment not found.",404);
    }
    if(path.length===5&&method==="DELETE"){
      if(role!=="moderator")return error("Only moderators can delete assignments.",403);
      const found=await db.prepare("SELECT id FROM club_assignments WHERE id=? AND club_id=?").bind(id,club).first();
      if(!found)return error("Assignment not found.",404);
      await db.prepare("DELETE FROM club_assignments WHERE id=? AND club_id=?").bind(id,club).run();
      return json({ok:true});
    }
    if(path.length===6&&path[5]==="submit"&&method==="POST")return submit(db,club,user,role,id,await req.json());
    return error("Assignment endpoint not found.",404);
  }catch(e){
    console.error("General assignment API failed",e);
    return error("Could not complete the assignment request. Check Worker logs.",500);
  }
}

export {validDue,validUrl};
