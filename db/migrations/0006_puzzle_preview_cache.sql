-- Cache PUBLIC Lichess puzzle content and privately scope unpublished previews.
-- Sources are freely reusable Lichess puzzle data, never students' answers.
CREATE TABLE IF NOT EXISTS puzzle_bank (
 lichess_id TEXT PRIMARY KEY,
 source_theme TEXT NOT NULL,
 source_difficulty TEXT NOT NULL,
 rating INTEGER NOT NULL,
 themes TEXT NOT NULL,
 start_fen TEXT NOT NULL,
 solution_json TEXT NOT NULL,
 game_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS puzzle_bank_lookup
 ON puzzle_bank(source_theme,source_difficulty,created_at DESC);
CREATE TABLE IF NOT EXISTS puzzle_preview_drafts (
 id TEXT PRIMARY KEY,
 lichess_id TEXT NOT NULL REFERENCES puzzle_bank(lichess_id) ON DELETE CASCADE,
 club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS puzzle_preview_drafts_owner
 ON puzzle_preview_drafts(user_id,club_id,created_at DESC);
CREATE TABLE IF NOT EXISTS lichess_rate_state (
 name TEXT PRIMARY KEY,
 blocked_until INTEGER NOT NULL
);
-- Previously assigned puzzle content can populate the cache without new calls to Lichess.
INSERT OR IGNORE INTO puzzle_bank
 (lichess_id,source_theme,source_difficulty,rating,themes,start_fen,solution_json,game_id)
 SELECT i.lichess_id,a.theme,a.difficulty,i.rating,i.themes,i.start_fen,i.solution_json,NULL
 FROM puzzle_assignment_items i JOIN puzzle_assignments a ON a.id=i.assignment_id;
