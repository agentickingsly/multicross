ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS puzzle_ratings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id   UUID        NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  difficulty  INTEGER     NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  enjoyment   INTEGER     NOT NULL CHECK (enjoyment  BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_ratings_puzzle_id ON puzzle_ratings(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_ratings_user_id   ON puzzle_ratings(user_id);
