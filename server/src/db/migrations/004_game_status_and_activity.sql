-- Extend game_status enum with abandoned and expired values
ALTER TYPE game_status ADD VALUE IF NOT EXISTS 'abandoned';
ALTER TYPE game_status ADD VALUE IF NOT EXISTS 'expired';

-- Add last_activity_at to track when a game was last interacted with.
-- Used by the expiry job: waiting > 24h and active > 7d are marked expired.
-- New rows default to now(); existing rows are backfilled from created_at.
ALTER TABLE games ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
UPDATE games SET last_activity_at = created_at WHERE last_activity_at IS NULL;
ALTER TABLE games ALTER COLUMN last_activity_at SET NOT NULL;
ALTER TABLE games ALTER COLUMN last_activity_at SET DEFAULT now();

-- Composite index to make the hourly expiry query fast
-- (filters on status + last_activity_at together)
CREATE INDEX IF NOT EXISTS idx_games_status_last_activity
  ON games(status, last_activity_at);
