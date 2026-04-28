# Session: Completed Puzzle View + Game History Replay

## Files Created
- `server/src/db/migrations/006_game_moves.sql` — new table for append-only move history
- `client/src/hooks/useReplay.ts` — hook managing replay state (play/pause/speed/cells)
- `client/src/components/ReplayControls.tsx` — Play/Pause, speed selector (1×/2×/4×), step counter
- `server/src/__tests__/gameHistory.test.ts` — 7 integration tests for GET /api/games/:id/history

## Files Modified
- `shared/src/types.ts` — added `GameMove`, `GetGameHistoryResponse` interfaces
- `shared/dist/` — rebuilt after shared source change
- `server/src/ws/handlers.ts` — `fill_cell` handler now also inserts into `game_moves`
- `server/src/routes/games.ts` — added `GET /api/games/:id/history` endpoint (before `/:id`)
- `client/src/components/CrosswordGrid.tsx` — added `readOnly` prop; `onCellFill`/`onCursorMove` now optional
- `client/src/api/client.ts` — added `getGameHistory()` function
- `client/src/pages/GamePage.tsx` — view mode, replay integration, restructured WS lifecycle to skip WS for completed/abandoned/expired games
- `docs/contracts.md` — documented new endpoint, GameMove type, game_moves table

## Key decisions
- WS is not connected for completed/abandoned/expired games (no Redis key leak from spurious join_room)
- `hasFull: false` returned when `game_moves` is empty (pre-migration games) — replay shows a static "no history" message
- Replay replays deletions too (empty-string moves clear the cell during animation)
- `readOnly` on CrosswordGrid makes `onCellFill`/`onCursorMove` optional — existing live-game callers unchanged
- View mode entered: (a) directly on load when game.status === "complete", (b) via "View Puzzle" button in completion modal

## Verification
- Migration 006_game_moves.sql applied cleanly
- 103 tests pass (7 new in gameHistory.test.ts)
- Server and client TypeScript clean

---

# Session: Pagination and Sorting for Puzzle Browsing

## Files Modified

- `shared/src/types.ts` — Updated `ListPuzzlesResponse` to include `total`, `page`, `limit`, `totalPages`
- `shared/dist/` — Rebuilt after types change
- `server/src/routes/puzzles.ts` — Added `puzzleListQuerySchema` (page, limit, sort), `mineListQuerySchema` (page, limit), `SORT_CLAUSES` map; updated `GET /` and `GET /mine` to return paginated response with parallel count query
- `client/src/api/client.ts` — Added `PuzzleSortOption` type; updated `getPuzzles` and `getMyPuzzles` to accept optional pagination/sort params
- `client/src/pages/LobbyPage.tsx` — Added sort state, page state, pagination metadata; sort controls and pagination UI in "Start a new game" section; total puzzle count display
- `server/src/__tests__/puzzles.test.ts` — Added 12 new tests across two describe blocks for pagination and sort validation
- `docs/contracts.md` — Documented new query params and paginated response shape for GET /puzzles and GET /puzzles/mine

## Verification

- 96 tests passing (84 pre-existing + 12 new)
- Server and client TypeScript clean

---

# Session: Puzzle Rating System

## Files Created
- `server/src/db/migrations/005_puzzle_ratings.sql` — adds `puzzle_ratings` table, `play_count` column on puzzles, and indexes
- `server/src/__tests__/puzzleRatings.test.ts` — 14 integration tests for POST /rate and GET /stats

## Files Modified
- `shared/src/types.ts` — added `PuzzleStats`; added stats fields to `Puzzle`; added `GetPuzzleStatsResponse`, `RatePuzzleRequest`, `RatePuzzleResponse`
- `shared/dist/` — rebuilt after types change
- `server/src/routes/puzzles.ts` — added `POST /:id/rate` and `GET /:id/stats`; updated all puzzle queries to include `play_count`; list endpoints LEFT JOIN `puzzle_ratings` for aggregated stats
- `server/src/ws/handlers.ts` — increments `puzzles.play_count` in `checkGameComplete`
- `client/src/api/client.ts` — added `getPuzzleStats()` and `ratePuzzle()`
- `client/src/pages/GamePage.tsx` — added `StarRating` component; rating UI on completion modal with pre-population and live aggregate display
- `client/src/pages/LobbyPage.tsx` — displays stats (plays, avg difficulty/enjoyment, rating count) on puzzle cards
- `docs/contracts.md` — documented new endpoints and `puzzle_ratings` table

## Verification
- Migration applied cleanly (`005_puzzle_ratings.sql`)
- All 84 tests pass
- Server TypeScript clean

---

# Session 3 — Puzzle editor page + My puzzles section

## Files Modified

### client/src/pages/EditorPage.tsx (rewritten)
- Supports `/editor` (new puzzle) and `/editor/:id` (edit existing)
- Edit mode: fetches GET /api/puzzles/:id, verifies `authorId` matches current user, redirects to /lobby if not owner
- `onSave`: POST /api/puzzles for new, PUT /api/puzzles/:id for existing
- Draft save shows a fixed "Draft saved" toast (3 s) without redirecting
- Publish redirects to /lobby
- Save errors shown inline (no more alert())

### client/src/App.tsx (modified)
- Added protected route `/editor/:id` → EditorPage

### client/src/pages/LobbyPage.tsx (rewritten)
- "My puzzles" section above "Start a new game"
  - Fetches GET /api/puzzles/mine on mount
  - Shows title, status badge (draft/published), grid size, Edit + Delete buttons
  - Delete: confirm dialog → DELETE /api/puzzles/:id → removes from list
  - Edit: navigates to /editor/:id
  - "You haven't created any puzzles yet — create one!" when empty
- "+ New puzzle" button in My puzzles section header
- "Create puzzle" button in page header alongside logout

## No new dependencies added
## TypeScript: zero errors (`npx tsc --noEmit` clean in /client)

---

# Session 1 — Foundation / Scaffold

## Summary
Scaffolded the full monorepo structure, defined all shared contracts, and set up the dev environment. No business logic implemented.

## Files Created

### Root
- `package.json` — npm workspaces (shared, server, client) + concurrently dev script
- `.env.example` — all required environment variables
- `docker-compose.yml` — postgres:16 + redis:7 services
- `CLAUDE.md` — agent session ownership table (pre-existing, not modified)
- `DONE.md` — this file

### /shared
- `package.json`
- `tsconfig.json`
- `src/types.ts` — all domain interfaces (User, Puzzle, Game, GameParticipant, GameCell), WS event maps (ClientToServerEvents, ServerToClientEvents), REST request/response shapes

### /server
- `package.json` — Express, Socket.io, pg, ioredis, jsonwebtoken, zod, dotenv
- `tsconfig.json`
- `src/index.ts` — Express + Socket.io server entry point (stub)
- `src/routes/auth.ts` — POST /register, POST /login (501 stubs)
- `src/routes/puzzles.ts` — GET /, GET /:id (501 stubs)
- `src/routes/games.ts` — POST /, POST /:id/join, GET /:id (501 stubs)
- `src/ws/handlers.ts` — Socket.io event handler registration (stub)
- `src/db/pool.ts` — pg Pool singleton
- `src/db/redis.ts` — ioredis singleton
- `src/db/schema.sql` — full DDL for users, puzzles, games, game_participants, game_cells
- `src/db/migrations/` — empty directory (placeholder for future migrations)
- `src/scripts/seed.ts` — seed script stub

### /client
- `package.json` — React, Vite, TypeScript, react-router-dom, socket.io-client
- `tsconfig.json` + `tsconfig.node.json`
- `vite.config.ts` — path alias for @multicross/shared, proxy to :3001
- `index.html`
- `src/main.tsx` — React root with BrowserRouter
- `src/App.tsx` — route stubs (/, /game/:roomCode)
- `src/api/client.ts` — typed REST client stubs (fetch wrappers)
- `src/ws/socket.ts` — socket.io-client stub

### /docs
- `contracts.md` — all WS events, REST endpoints, Redis keys, DB schema summary
- `redis.md` — Redis key conventions with field formats and TTL notes
- `api.yaml` — OpenAPI 3.0 spec for all REST endpoints

## Dependencies Added
- Root: concurrently
- Server: express, socket.io, pg, ioredis, jsonwebtoken, dotenv, zod (+ @types/*)
- Client: react, react-dom, react-router-dom, socket.io-client, vite, @vitejs/plugin-react

## Verification
- `npm install` — clean (273 packages)
- `npm run build --workspace=shared` — passes (tsc)
- `server npx tsc --noEmit` — passes
