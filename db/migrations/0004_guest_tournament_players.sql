-- Guest tournament entrants need no login, email, or account.
-- Keep historical games untouched; new rounds are written to v2, which
-- supports both registered club members and tournament-only guests.
CREATE TABLE IF NOT EXISTS tournament_guests (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_guests_names
  ON tournament_guests(tournament_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS tournament_guests_tournament
  ON tournament_guests(tournament_id);

CREATE TABLE IF NOT EXISTS tournament_games_v2 (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  white_user_id TEXT REFERENCES users(id),
  white_guest_id TEXT REFERENCES tournament_guests(id),
  black_user_id TEXT REFERENCES users(id),
  black_guest_id TEXT REFERENCES tournament_guests(id),
  result TEXT CHECK(result IN ('1-0','0-1','1/2-1/2','bye') OR result IS NULL),
  CHECK((white_user_id IS NOT NULL) != (white_guest_id IS NOT NULL)),
  CHECK(NOT (black_user_id IS NOT NULL AND black_guest_id IS NOT NULL)),
  CHECK(white_user_id IS NULL OR black_user_id IS NULL OR white_user_id != black_user_id),
  CHECK(white_guest_id IS NULL OR black_guest_id IS NULL OR white_guest_id != black_guest_id)
);
CREATE INDEX IF NOT EXISTS tournament_games_v2_round
  ON tournament_games_v2(round_id);
