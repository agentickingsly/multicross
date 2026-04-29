DO $$ BEGIN
  CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE game_invite_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS friendships (
  id           UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       friendship_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT uq_friendship       UNIQUE (requester_id, addressee_id),
  CONSTRAINT chk_no_self_friend  CHECK  (requester_id != addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);

CREATE TABLE IF NOT EXISTS game_invites (
  id         UUID               NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id    UUID               NOT NULL REFERENCES games(id)  ON DELETE CASCADE,
  inviter_id UUID               NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  invitee_id UUID               NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status     game_invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ        NOT NULL DEFAULT now(),
  CONSTRAINT uq_game_invite UNIQUE (game_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_game_invites_invitee ON game_invites(invitee_id);
