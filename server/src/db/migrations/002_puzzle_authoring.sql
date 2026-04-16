ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id);
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published'));
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS puzzles_author_id_idx ON puzzles(author_id);
