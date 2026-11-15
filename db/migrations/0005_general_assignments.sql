-- General club assignments (study materials and written responses).
-- Puzzle assignments stay in their original tables and appear alongside these
-- in the Assignments interface; no existing puzzle data is changed.
CREATE TABLE IF NOT EXISTS club_assignments (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('study','written')),
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  resource_url TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS club_assignments_club
  ON club_assignments(club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS club_assignment_targets (
  assignment_id TEXT NOT NULL REFERENCES club_assignments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_assignment_submissions (
  assignment_id TEXT NOT NULL REFERENCES club_assignments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id, user_id)
);
CREATE INDEX IF NOT EXISTS club_assignment_submissions_lookup
  ON club_assignment_submissions(assignment_id, submitted_at DESC);
