-- Match invite/challenge
CREATE TABLE IF NOT EXISTS competitive_matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id    UUID NOT NULL REFERENCES users(id),
  opponent_id      UUID NOT NULL REFERENCES users(id),
  puzzle_id        UUID NOT NULL REFERENCES puzzles(id),
  status           TEXT NOT NULL DEFAULT 'pending',
  -- valid statuses: pending | active | completed | cancelled | timed_out
  time_limit_seconds INTEGER NOT NULL DEFAULT 600,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  winner_id        UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each player's cell fills (separate from cooperative game_cells)
CREATE TABLE IF NOT EXISTS competitive_cells (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id  UUID NOT NULL REFERENCES competitive_matches(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  row       INTEGER NOT NULL,
  col       INTEGER NOT NULL,
  value     TEXT NOT NULL DEFAULT '',
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id, row, col)
);

CREATE INDEX IF NOT EXISTS idx_competitive_matches_challenger ON competitive_matches(challenger_id);
CREATE INDEX IF NOT EXISTS idx_competitive_matches_opponent  ON competitive_matches(opponent_id);
CREATE INDEX IF NOT EXISTS idx_competitive_cells_match_user  ON competitive_cells(match_id, user_id);
