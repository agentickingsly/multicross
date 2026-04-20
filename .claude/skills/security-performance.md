# security-performance

Apply these rules automatically when writing any new code. They are not
suggestions — treat violations the same as a type error.

---

## Input validation

- Every REST endpoint body validated with Zod before any DB or Redis access.
  Extend existing schemas; do not add a new endpoint without one.
- `req.params` values (especially IDs) must be validated — use
  `z.string().uuid()` for UUID params.
- Never trust `userId` from the request body or query string. Always read it
  from the verified JWT: `req.user!.userId` (REST) or `s.data.user.userId` (WS).
- Strip unknown fields with Zod's `.strip()` (the default) — never spread
  `req.body` directly into a DB insert.

## Sensitive data in logs

- Never log: passwords, password hashes, JWT tokens, session tokens, full
  request bodies that may contain credentials.
- Log user IDs and email addresses only at `debug` level — never `info` in
  production paths.
- Pino's `redact` option can be configured in `server/src/logger.ts` if new
  sensitive fields are introduced.

## Rate limiting

- Any new endpoint that accepts unauthenticated requests must be rate limited.
- Auth endpoints (`/api/auth/*`) already have `authLimiter` (10 req / 15 min).
- For new public endpoints, add a limiter in `server/src/index.ts` using the
  same `express-rate-limit` pattern, scoped to the route prefix.
- Rate limiters are skipped in `NODE_ENV=test` — wrap them in the existing
  `if (process.env.NODE_ENV !== "test")` guard.

## N+1 queries

- Never query inside a loop. If you need data for a list of IDs, use a single
  `WHERE id = ANY($1::uuid[])` query.
- Use JOINs to fetch related data in one round-trip instead of sequential
  queries.
- `Promise.all([query1, query2])` is fine for independent queries — do not
  await them serially when they can run concurrently.
- When loading participants + cells in WS handlers, always use `Promise.all`
  as the existing handlers do.

## Redis access patterns

- Prefer `HGET` / `HSET` over `HGETALL` when you only need one field.
- `HGETALL` (used in `getGameState`) is acceptable for game state because the
  hash is bounded by the grid size — do not use it on unbounded keys.
- Never use `KEYS *` or `SCAN` in hot paths — all lookups must be O(1) by key.
- Set TTLs on ephemeral keys if they could accumulate (e.g., per-connection
  scratch data). Game keys are cleaned up by `deleteGameKeys` on completion —
  do not add new game keys without adding them to that function.

## Event loop

- No `fs.readFileSync`, `execSync`, or other synchronous blocking calls in
  request handlers or WS callbacks.
- CPU-intensive work (e.g. bcrypt) is already handled by libuv's thread pool
  via the async bcrypt API — keep using the async version.
- JSON parsing of large payloads should be bounded — the existing
  `express.json({ limit: "16kb" })` covers REST; WS payloads are validated by
  Zod which implicitly limits them.

## Database indexes

When adding a new query that filters or joins on a column:
1. Check `server/src/db/schema.sql` for existing indexes.
2. If the column is not indexed and the table can grow large (users, games,
   game_cells), add an index in the migration file.
3. `game_cells(game_id, row, col)` and `game_participants(game_id, user_id)`
   already have unique constraints (which act as indexes).
4. Any new FK column should have an index: `CREATE INDEX IF NOT EXISTS ...`

## WebSocket broadcast scope

- `io.to(gameId).emit(...)` broadcasts to everyone in the room — use only
  when ALL participants need the event (e.g. `cell_updated`, `game_complete`).
- `s.to(gameId).emit(...)` broadcasts to everyone EXCEPT the sender — use for
  presence events (`participant_joined`, `cursor_moved`).
- `s.emit(...)` sends only to the connecting socket — use for `room_joined`
  and error responses.
- Never emit to `io.emit(...)` (all connected clients) — all game events must
  be scoped to a room.
- Always publish to the Redis pub/sub channel after a local broadcast so that
  other server instances relay the event to their sockets.

## Authentication checks in WS handlers

- The JWT middleware on `io.use(...)` authenticates the socket connection but
  does NOT verify room membership.
- Every `fill_cell` and `move_cursor` handler must verify the user is a
  `game_participants` member before processing. Do not skip this check for
  performance — it prevents users from writing to games they haven't joined.
- Use the existing pattern:
  ```ts
  const memberCheck = await pool.query(
    "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
    [gameId, userId]
  );
  if (!memberCheck.rows[0]) { s.emit("error" as any, { error: "Not a participant" }); return; }
  ```
