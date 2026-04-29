# Session: Spectator Mode

## Files modified

### Shared
- `shared/src/types.ts` — added `SpectateRoomPayload`, `SpectatorCountPayload`; added `spectate_room` to `ClientToServerEvents`; added `spectator_count` to `ServerToClientEvents`
- `shared/dist/types.js`, `shared/dist/types.d.ts` — rebuilt after types change

### Server
- `server/src/db/redis.ts` — added `addSpectator`, `removeSpectator`, `getSpectatorCount` helpers; added `game:{gameId}:spectators` to `deleteGameKeys`
- `server/src/ws/handlers.ts` — added `spectate_room` handler; added `spectator_count` to `ALLOWED_EVENTS`; added `spectatingGames: Set<string>` to `SocketData`; updated `disconnect` handler to distinguish spectators from participants; added silent spectator guard to `fill_cell` and `move_cursor`
- `server/src/routes/games.ts` — added `GET /api/games/watchable`; added `GET /api/games/:id/spectators`; added `?spectate=true` bypass on `GET /api/games/:id` membership check; imported `getSpectatorCount`

### Client
- `client/src/api/client.ts` — added `WatchableGame` type (extends `ActiveGame` with `puzzleId`); added `getWatchableGames()`, `getSpectatorCount()`, `joinGameById()`; updated `getGame()` to accept `{ spectate?: boolean }` option
- `client/src/pages/LobbyPage.tsx` — added `watchableGames` state, `getWatchableGames` effect (30s poll); added "Watch a game" section; added Watch button alongside Create game on puzzle cards (keyed by puzzleId)
- `client/src/pages/GamePage.tsx` — added `useSearchParams` to detect `?spectate=true`; added `spectatorCount` + `joiningFromSpectate` state; spectate-aware Effect 1 (`getGame` with spectate bypass), Effect 2 (skip `leave_room` on cleanup), Effect 3 (`spectate_room` vs `join_room`); `spectator_count` WS listener; header shows "Spectating" badge + watching count + "Join Game" button (waiting games); grid uses `readOnly` and no fill/cursor callbacks in spectator mode; sidebar shows spectator count card

### Docs / Skills
- `docs/contracts.md` — documented `spectate_room`, `spectator_count` WS events; documented `/watchable`, `/:id/spectators` REST endpoints; documented `game:{gameId}:spectators` Redis key
- `docs/redis.md` — documented `game:{gameId}:spectators` key
- `.claude/skills/redis-keys.md` — added `game:{gameId}:spectators` to key catalog

## No DB migration needed
Spectators are tracked in Redis only — no schema changes.

## Dependencies added
None.
