# Session 3 — WebSocket + Redis DONE

## Files created / modified

| File | Action |
|------|--------|
| `server/src/db/redis.ts` | Created — Redis singleton + pub/sub clients + helper functions |
| `server/src/ws/handlers.ts` | Created — full Socket.io handler implementation |

## What was implemented

### redis.ts
- `default` export: general-purpose ioredis client for reads/writes
- `pub` / `sub` exports: dedicated ioredis instances for pub/sub (ioredis requires separate connections)
- Helpers: `getGameState`, `setCell`, `getCursors`, `setCursor`, `addParticipant`, `removeParticipant`, `getParticipants`, `deleteGameKeys`
- Cell state stored as JSON `{ value, filledBy }` under field `{row}:{col}` (colon separator, per redis.md)

### handlers.ts
- **JWT middleware** on the `io.use` path — disconnects with error if token missing/invalid; attaches decoded payload to `socket.data.user`
- **join_room**: verifies game in postgres, joins Socket.io room, adds to Redis participants set, emits `room_joined` (cells from postgres for canonical IDs), broadcasts `participant_joined`
- **fill_cell**: validates A-Z / empty, writes Redis, checks puzzle answer from `puzzles.grid` JSON column, upserts `game_cells`, broadcasts `cell_updated` with `correct` flag, triggers `checkGameComplete`
- **move_cursor**: writes cursor to Redis, broadcasts `cursor_moved` to all *other* sockets (`socket.to(gameId)`)
- **leave_room**: leaves room, removes from Redis, broadcasts `participant_left`
- **disconnect**: iterates `socket.rooms`, cleans up Redis for each joined game, broadcasts `participant_left`
- **game_complete**: iterates full puzzle grid vs Redis state; on match → updates postgres `games.status = 'complete'`, emits `game_complete` with per-user stats, deletes Redis game keys

### Redis pub/sub (multi-instance)
- `subscribeToRoom(gameId)` subscribes to `channel:game:{gameId}` once per instance (tracked with `Set<string>`)
- All broadcasts (cell_updated, cursor_moved, participant_joined, participant_left, game_complete) publish `{ event, payload, sourceSocketId }` to the channel
- `sub.on("message")` handler skips relay if `sourceSocketId` is a live socket on this instance (already broadcast locally), otherwise calls `io.to(gameId).emit(event, payload)`

## Key decisions

1. **Postgres for room_joined cells** — Redis state hash doesn't store UUID cell IDs; querying postgres for `room_joined` gives complete `GameCell` objects. Redis remains the fast write path during play.
2. **Two-export pub/sub** — ioredis enters subscriber mode on first `subscribe()` call and can't issue other commands. Separate `pub` and `sub` clients avoid this constraint.
3. **socket.data.gameParticipants cache** — participant color needed on every `move_cursor`; caching after `join_room` avoids per-event DB queries.
4. **sourceSocketId dedup** — checking `io.sockets.sockets.has(sourceSocketId)` correctly skips re-broadcast on the originating instance while relaying on all others.

## Dependencies added
None — `ioredis`, `jsonwebtoken`, and `socket.io` were already listed in package.json.

## Test result
```
=== Results: 23 passed, 0 failed ===
```
All scenarios verified: JWT auth, join_room state load, fill_cell broadcast + correctness check, move_cursor exclusion, leave_room cleanup, input validation.
