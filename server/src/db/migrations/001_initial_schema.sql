-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Puzzles
CREATE TABLE IF NOT EXISTS puzzles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  author     TEXT NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  grid       JSONB NOT NULL,
  clues      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game status enum
DO $$ BEGIN
  CREATE TYPE game_status AS ENUM ('waiting', 'active', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Games
CREATE TABLE IF NOT EXISTS games (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id    UUID NOT NULL REFERENCES puzzles(id),
  room_code    CHAR(6) NOT NULL UNIQUE,
  status       game_status NOT NULL DEFAULT 'waiting',
  created_by   UUID NOT NULL REFERENCES users(id),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game participants
CREATE TABLE IF NOT EXISTS game_participants (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id   UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  color     TEXT NOT NULL,
  UNIQUE (game_id, user_id)
);

-- Game cells (current fill state)
CREATE TABLE IF NOT EXISTS game_cells (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id   UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  row       INTEGER NOT NULL,
  col       INTEGER NOT NULL,
  value     CHAR(1) NOT NULL,
  filled_by UUID REFERENCES users(id),
  filled_at TIMESTAMPTZ,
  UNIQUE (game_id, row, col)
);
