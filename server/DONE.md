# Session 2 — REST API Done

## Files Created
- `src/middleware/auth.ts` — JWT Bearer auth middleware, attaches `req.user` to requests

## Files Modified
- `src/routes/auth.ts` — Full register/login implementation
- `src/routes/puzzles.ts` — GET /api/puzzles and GET /api/puzzles/:id (auth protected)
- `src/routes/games.ts` — POST /api/games, POST /api/games/:id/join, GET /api/games/:id (auth protected)
- `src/index.ts` — Added CORS middleware, global error handler, fixed dotenv path

## Dependencies Added
- `bcrypt` + `@types/bcrypt` — password hashing (12 rounds)
- `cors` + `@types/cors` — CORS headers using CLIENT_URL from .env

## Decisions
- **dotenv path**: `.env` lives at the repo root, not in `server/`. Replaced `import "dotenv/config"` with an explicit `dotenv.config({ path: resolve(__dirname, "../../.env") })` so the server finds the env file regardless of working directory.
- **Room code**: 6-char uppercase alphanumeric, retries up to 10 times on collision.
- **Participant colors**: 8 preset hex colors, picks the first unused one. Falls back to modulo if all are taken.
- **Transactions**: POST /api/games uses a pg transaction to atomically create the game + insert the creator as a participant.
- **Error responses**: All match the `{ error: string }` contract from contracts.md.

## Verified with curl
- `POST /api/auth/register` → 201 with `{ user, token }`
- `POST /api/auth/login` → 200 with `{ user, token }`
- `GET /api/puzzles` (with token) → 200 with `{ puzzles: [] }`
- `GET /api/puzzles` (no token) → 401
- Duplicate register → 409
- Wrong password → 401
