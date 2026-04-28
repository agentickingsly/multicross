-- Tier 1: ban + admin columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Tier 3: game reports
CREATE TABLE IF NOT EXISTS game_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_reports_game_id_idx          ON game_reports(game_id);
CREATE INDEX IF NOT EXISTS game_reports_reporter_id_idx      ON game_reports(reporter_id);
CREATE INDEX IF NOT EXISTS game_reports_reported_user_id_idx ON game_reports(reported_user_id);

-- Seed admin (only if the account already exists)
DO $$
BEGIN
  UPDATE users SET is_admin = true WHERE email = 'agentickingsly@gmail.com';
END $$;
