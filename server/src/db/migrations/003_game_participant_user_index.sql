-- Index to support fast lookups of all games a user has joined.
-- The existing UNIQUE constraint on (game_id, user_id) is a compound btree
-- index; filtering by user_id alone requires a separate single-column index.
CREATE INDEX IF NOT EXISTS idx_game_participants_user_id
  ON game_participants(user_id);
