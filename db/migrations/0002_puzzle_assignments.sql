-- Moderator-assigned Lichess puzzles with server-verified per-member progress.
CREATE TABLE IF NOT EXISTS puzzle_assignments (
 id TEXT PRIMARY KEY,
 club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 theme TEXT NOT NULL,
 difficulty TEXT NOT NULL,
 due_date TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS puzzle_assignments_club ON puzzle_assignments(club_id, created_at DESC);
CREATE TABLE IF NOT EXISTS puzzle_assignment_members (
 assignment_id TEXT NOT NULL REFERENCES puzzle_assignments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY (assignment_id,user_id)
);
CREATE TABLE IF NOT EXISTS puzzle_assignment_items (
 id TEXT PRIMARY KEY,
 assignment_id TEXT NOT NULL REFERENCES puzzle_assignments(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 lichess_id TEXT NOT NULL,
 rating INTEGER NOT NULL,
 themes TEXT NOT NULL,
 start_fen TEXT NOT NULL,
 solution_json TEXT NOT NULL,
 UNIQUE (assignment_id,position),
 UNIQUE (assignment_id,lichess_id)
);
CREATE TABLE IF NOT EXISTS puzzle_member_progress (
 assignment_id TEXT NOT NULL REFERENCES puzzle_assignments(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES puzzle_assignment_items(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 played_json TEXT NOT NULL DEFAULT '[]',
 mistakes INTEGER NOT NULL DEFAULT 0,
 solved_at TEXT,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(assignment_id,item_id,user_id)
);
CREATE INDEX IF NOT EXISTS puzzle_member_progress_assignment ON puzzle_member_progress(assignment_id,user_id);
