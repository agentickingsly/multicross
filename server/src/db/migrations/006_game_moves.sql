CREATE TABLE IF NOT EXISTS game_moves (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row         INTEGER     NOT NULL,
  col         INTEGER     NOT NULL,
  value       TEXT        NOT NULL DEFAULT '' CHECK (value ~ '^[A-Z]?$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_moves_game_id ON game_moves (game_id, created_at);
