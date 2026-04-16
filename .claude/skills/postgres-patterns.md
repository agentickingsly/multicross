# postgres-patterns

## Connection
- Pool is a singleton — always import from server/src/db/pool.ts
- Never create a new Pool instance
- Use pool.query() for single queries
- Use pool.connect() only when you need a transaction

## Transaction pattern
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO ...', [...]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

## Schema conventions
- All PKs: UUID DEFAULT gen_random_uuid()
- All timestamps: TIMESTAMPTZ NOT NULL DEFAULT now()
- FK naming: column named {referenced_table}_id
- Enums created with DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL END $$
- Hard deletes only — no soft delete pattern

## Migration conventions
- Files in server/src/db/migrations/
- Named: 001_description.sql, 002_description.sql etc
- Always use IF NOT EXISTS on CREATE TABLE
- Always use IF NOT EXISTS on CREATE INDEX
- Wrap ENUM creation in the duplicate_object exception block
- Run with: npm run migrate

## Current schema summary
users: id, email, display_name, password_hash, created_at
puzzles: id, title, author, author_id, width, height, grid (jsonb),
         clues (jsonb), status ('draft'|'published'), updated_at, created_at
games: id, puzzle_id, room_code (6 char unique), status ('waiting'|'active'|'complete'),
       created_by, started_at, completed_at, created_at
game_participants: id, game_id, user_id, joined_at, color (hex string)
game_cells: id, game_id, row, col, value (char), filled_by, filled_at
_migrations: id, filename, applied_at

## Query patterns
-- Always parameterize, never interpolate
pool.query('SELECT * FROM users WHERE id = $1', [userId])

-- Upsert pattern used for game_cells
INSERT INTO game_cells (game_id, row, col, value, filled_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (game_id, row, col)
DO UPDATE SET value = $4, filled_by = $5, filled_at = now()

-- Ownership check pattern (use before update/delete)
const check = await pool.query(
  'SELECT id FROM puzzles WHERE id = $1 AND author_id = $2',
  [puzzleId, req.user.userId]
);
if (!check.rows[0]) return res.status(403).json({ error: 'Forbidden' });

## Zod validation — always validate before DB access
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const parsed = schema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
