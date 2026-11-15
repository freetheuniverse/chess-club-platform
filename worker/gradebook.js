// Moderator-only club progress gradebook. This is a read-only view of
// *existing* puzzle completion and study/written submissions, not awarded grades.
// It intentionally returns no student emails, passwords or written answers.
export async function gradebookData(db,club){
  const members=(await db.prepare(
    "SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id "+
    "WHERE m.club_id=? ORDER BY u.name COLLATE NOCASE,u.id"
  ).bind(club).all()).results;
  const puzzles=(await db.prepare(`
    SELECT a.id,a.title,a.due_date,a.created_at,
      (SELECT COUNT(*) FROM puzzle_assignment_items i WHERE i.assignment_id=a.id) total_puzzles
    FROM puzzle_assignments a WHERE a.club_id=?
    ORDER BY a.created_at DESC,a.id DESC LIMIT 120
  `).bind(club).all()).results;
  const puzzleProgress=(await db.prepare(`
    SELECT t.assignment_id,t.user_id,COUNT(p.solved_at) solved,
      COALESCE(SUM(p.mistakes),0) mistakes
    FROM puzzle_assignment_members t
    JOIN puzzle_assignments a ON a.id=t.assignment_id
    LEFT JOIN puzzle_member_progress p
      ON p.assignment_id=t.assignment_id AND p.user_id=t.user_id
    WHERE a.club_id=?
    GROUP BY t.assignment_id,t.user_id
  `).bind(club).all()).results;
  const generalReady=!!(await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='club_assignments'"
  ).first());
  const general=generalReady?(await db.prepare(`
    SELECT id,title,kind,due_date,created_at FROM club_assignments
    WHERE club_id=? ORDER BY created_at DESC,id DESC LIMIT 120
  `).bind(club).all()).results:[];
  const generalProgress=generalReady?(await db.prepare(`
    SELECT t.assignment_id,t.user_id,s.submitted_at
    FROM club_assignment_targets t
    JOIN club_assignments a ON a.id=t.assignment_id
    LEFT JOIN club_assignment_submissions s
      ON s.assignment_id=t.assignment_id AND s.user_id=t.user_id
    WHERE a.club_id=?
  `).bind(club).all()).results:[];
  const assignments=[
    ...puzzles.map(a=>({
      key:"p:"+a.id,id:a.id,kind:"puzzle",title:a.title,
      due_date:a.due_date,created_at:a.created_at,total_puzzles:Number(a.total_puzzles)||0
    })),
    ...general.map(a=>({
      key:"g:"+a.id,id:a.id,kind:a.kind,title:a.title,
      due_date:a.due_date,created_at:a.created_at,total_puzzles:null
    }))
  ].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))||b.key.localeCompare(a.key));
  // Map entries only for actually targeted members. Missing assignments remain
  // unassigned (N/A), not incorrectly counted as missing or zero grades.
  const cells=[
    ...puzzleProgress.map(r=>({
      key:"p:"+r.assignment_id,user_id:r.user_id,
      solved:Number(r.solved)||0,mistakes:Number(r.mistakes)||0,
      submitted:false
    })),
    ...generalProgress.map(r=>({
      key:"g:"+r.assignment_id,user_id:r.user_id,
      solved:null,mistakes:null,submitted:!!r.submitted_at,
      submitted_at:r.submitted_at||null
    }))
  ];
  return {members,assignments,cells,general_ready:generalReady};
}
