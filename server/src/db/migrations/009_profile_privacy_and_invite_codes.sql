ALTER TABLE users ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12);

-- Backfill invite codes for existing users
-- Format: XXXX-YYYYYY (4 uppercase alpha + dash + 6 uppercase alphanumeric)
DO $$
DECLARE
  r RECORD;
  code TEXT;
  attempts INT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  alpha TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  i INT;
BEGIN
  FOR r IN SELECT id FROM users WHERE invite_code IS NULL LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      code := '';
      FOR i IN 1..4 LOOP
        code := code || substr(alpha, floor(random() * 26 + 1)::int, 1);
      END LOOP;
      code := code || '-';
      FOR i IN 1..6 LOOP
        code := code || substr(chars, floor(random() * 36 + 1)::int, 1);
      END LOOP;
      BEGIN
        UPDATE users SET invite_code = code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempts > 100 THEN
          RAISE EXCEPTION 'Could not generate unique invite code after 100 attempts for user %', r.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN invite_code SET NOT NULL;

ALTER TABLE users ADD CONSTRAINT uq_users_invite_code UNIQUE (invite_code);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
