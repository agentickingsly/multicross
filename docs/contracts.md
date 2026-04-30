# Interface Contracts

This document is the single source of truth for all interface boundaries in the Multicross app.
**Any session that changes an event name, endpoint, or Redis key MUST update this file.**

---

## 1. WebSocket Events

All events are typed in `/shared/src/types.ts`.

### Client → Server

| Event | Payload |
|-------|---------|
| `join_room` | `{ gameId: string, userId: string }` |
| `spectate_room` | `{ gameId: string }` — join as spectator; does NOT create a participant record or add to Redis members/participants |
| `fill_cell` | `{ gameId: string, row: number, col: number, value: string, userId: string }` — silently ignored for spectators |
| `move_cursor` | `{ gameId: string, row: number, col: number, userId: string }` — silently ignored for spectators |
| `leave_room` | `{ gameId: string, userId: string }` |

### Server → Client

| Event | Payload |
|-------|---------|
| `room_joined` | `{ game: Game, participants: GameParticipant[], cells: GameCell[], cursors: Record<string, {row,col}> }` |
| `cell_updated` | `{ row: number, col: number, value: string, filledBy: string, correct: boolean }` |
| `cursor_moved` | `{ userId: string, row: number, col: number, color: string }` |
| `participant_joined` | `{ participant: GameParticipant, displayName: string, rejoining: boolean }` |
| `participant_left` | `{ userId: string }` |
| `game_complete` | `{ completedAt: string, stats: { userId: string, cellsFilled: number }[] }` |
| `game_abandoned` | `{ gameId: string }` |
| `spectator_count` | `{ gameId: string, count: number }` — broadcast to all room members when spectator count changes |
| `friend_request` | `{ friendshipId: string, requesterId: string, requesterDisplayName: string }` — sent to the addressee's personal room when a friend request is received |
| `game_invite` | `{ inviteId: string, inviterId: string, inviterDisplayName: string, gameId: string, puzzleTitle: string }` — sent to the invitee's personal room when a game invite is received |

---

## 2. REST Endpoints

Base path: `/api`

| Method | Path | Request Body | Response Body |
|--------|------|-------------|---------------|
| POST | `/auth/register` | `{ email, displayName, password }` | `{ user: User, token: string }` |
| POST | `/auth/login` | `{ email, password }` | `{ user: User, token: string }` |
| GET | `/puzzles` | — | `{ puzzles: Puzzle[], total: number, page: number, limit: number, totalPages: number }` |
| GET | `/puzzles` query params | `page` (int ≥1, default 1), `limit` (int 1–50, default 12), `sort` (`newest`\|`most_played`\|`most_difficult`\|`most_enjoyable`, default `newest`) | — |
| GET | `/puzzles/mine` | — | `{ puzzles: Puzzle[], total: number, page: number, limit: number, totalPages: number }` |
| GET | `/puzzles/mine` query params | `page` (int ≥1, default 1), `limit` (int 1–50, default 12) | — |
| GET | `/puzzles/:id` | — | `{ puzzle: Puzzle }` |
| POST | `/games` | `{ puzzleId: string }` | `{ game: Game }` |
| POST | `/games/:id/join` | — | `{ participant: GameParticipant }` — 200 for new join or rejoin (idempotent); 400 if game is no longer active |
| PATCH | `/games/:id/abandon` | — | `{ success: true }` — creator only; 403 for others; 400 if already finished |
| GET | `/games/my-active` | — | `{ games: ActiveGame[] }` — caller's waiting/active games only |
| GET | `/games/:id` | — | `{ game: Game, participants: GameParticipant[], cells: GameCell[] }` — add `?spectate=true` to skip participant membership check |
| GET | `/games/:id/spectators` | — | `{ count: number }` — current spectator count from Redis |
| GET | `/games/watchable` | — | `{ games: ActiveGame[] }` — active/waiting games the current user is NOT a participant of (max 20) |
| GET | `/games/:id/history` | — | `{ moves: GameMove[], hasFull: boolean }` — participant only; `hasFull` is true when full move history exists, false for games played before move recording was added |
| GET | `/puzzles/:id/stats` | — | `{ stats: PuzzleStats, userRating: { difficulty, enjoyment } \| null }` |
| POST | `/puzzles/:id/rate` | `{ difficulty: 1-5, enjoyment: 1-5 }` | `{ stats: PuzzleStats }` |
| POST | `/games/:id/report` | `{ reportedUserId: uuid, reason: string (max 500) }` | `{ success: true }` — 400 if self-report or invalid fields; 404 if game/user not found |
| POST | `/friends/request` | `{ addresseeId: uuid }` | `{ friendshipId: uuid }` — 400 if self-request; 404 if user not found; 409 if already exists |
| GET | `/friends/requests` | — | `{ requests: FriendRequest[] }` — pending incoming requests |
| GET | `/friends` | — | `{ friends: Friend[] }` — accepted friends with online status |
| POST | `/friends/:id/accept` | — | `{ success: true }` — addressee only; 404 if not found or already processed |
| POST | `/friends/:id/decline` | — | `{ success: true }` — addressee only |
| DELETE | `/friends/:id` | — | `{ success: true }` — either party; 404 if not found |
| GET | `/friends/search` | query: `q` (min 2 chars) | `{ users: UserSearchResult[] }` — users matching display name; excludes non-searchable users unless already friends with the caller |
| POST | `/friends/request-by-code` | `{ inviteCode: string }` | `{ friendshipId: uuid }` — finds user by invite code and sends request; bypasses is_searchable; 400 if self-request; 404 if code not found; 409 if already exists |
| POST | `/games/:id/invite` | `{ inviteeId: uuid }` | `{ inviteId: uuid }` — 400 if not friends or game inactive; 403 if not participant; 409 if pending invite exists |
| GET | `/invites` | — | `{ invites: GameInviteItem[] }` — pending game invites for current user |
| POST | `/invites/:id/accept` | — | `{ success: true, gameId: uuid }` — joins game as participant; 400 if game no longer active; 404 if not found |
| POST | `/invites/:id/decline` | — | `{ success: true }` — 404 if not found |
| GET | `/users/me` | — | `{ user: User }` — current user profile including inviteCode and isSearchable |
| PATCH | `/users/me/privacy` | `{ isSearchable: boolean }` | `{ success: true, isSearchable: boolean }` — 400 for non-boolean; 401 without token |
| POST | `/admin/users/:id/ban` | `{ reason?: string }` | `{ success: true }` — admin only; 403 for non-admin |
| POST | `/admin/users/:id/unban` | — | `{ success: true }` — admin only |
| GET | `/admin/users` | query: `page` (default 1), `limit` (default 20, max 100) | `{ users: AdminUser[], total, page, limit, totalPages }` — admin only |
| GET | `/admin/reports` | query: `page` (default 1), `limit` (default 20, max 100) | `{ reports: AdminReport[], total, page, limit, totalPages }` — admin only |

`AdminUser`: `{ id, email, displayName, isBanned, bannedAt, bannedReason, isAdmin, createdAt }`
`AdminReport`: `{ id, gameId, reason, createdAt, reporter: { id, email, displayName }, reportedUser: { id, email, displayName } }`

`ActiveGame`: `{ id, roomCode, status: "waiting"|"active", createdAt, puzzleTitle, participantCount: number }`

`Friend`: `{ friendshipId: uuid, userId: uuid, displayName: string, online: boolean }`

`FriendRequest`: `{ friendshipId: uuid, requesterId: uuid, displayName: string, createdAt: string }`

`UserSearchResult`: `{ id: uuid, displayName: string }`

`GameInviteItem`: `{ id: uuid, gameId: uuid, inviterId: uuid, inviterDisplayName: string, puzzleTitle: string, gameStatus: string, createdAt: string }`

`GameMove`: `{ id, gameId, userId, row, col, value: string (empty string = deletion), createdAt }`

`PuzzleStats`: `{ averageDifficulty: number|null, averageEnjoyment: number|null, playCount: number, ratingCount: number }`

All error responses: `{ error: string }` with appropriate HTTP status code.
Protected routes (POST /games, POST /games/:id/join, GET /games/:id) require `Authorization: Bearer <token>` header.
All puzzle rating endpoints require `Authorization: Bearer <token>` header.

---

## 3. Redis Keys

See `/docs/redis.md` for full details.

| Key | Type | Description |
|-----|------|-------------|
| `game:{gameId}:state` | Hash | Full game grid: field = `{row}:{col}`, value = `{ value, filledBy }` JSON |
| `game:{gameId}:cursors` | Hash | Cursor positions: field = `{userId}`, value = `{ row, col }` JSON |
| `game:{gameId}:participants` | Set | Set of `userId` strings currently active in the room |
| `game:{gameId}:members` | Set | Permanent set of `userId` strings who have ever joined via WS (used for rejoin detection) |
| `game:{gameId}:spectators` | Set | Set of socket IDs currently watching the game as spectators (ephemeral, cleared on game end) |
| `channel:game:{gameId}` | Pub/Sub channel | Used to broadcast events to all server instances |

---

## 4. Database Schema Summary

See `/server/src/db/schema.sql` for full DDL.

| Table | Primary Key | Notable Columns |
|-------|-------------|-----------------|
| `users` | `id` (uuid) | `email` (unique), `display_name`, `password_hash`, `is_banned` (bool), `banned_at`, `banned_reason`, `is_admin` (bool), `is_searchable` (bool, default true), `invite_code` (varchar 12, unique) |
| `puzzles` | `id` (uuid) | `width`, `height`, `grid` (jsonb), `clues` (jsonb) |
| `games` | `id` (uuid) | `room_code` (unique 6-char), `status` (`waiting`\|`active`\|`complete`\|`abandoned`\|`expired`), `puzzle_id` → puzzles, `created_by` → users, `last_activity_at` (updated on each fill_cell) |
| `game_participants` | `id` (uuid) | `game_id` → games, `user_id` → users, `color` (hex), unique(game_id, user_id) |
| `game_cells` | `id` (uuid) | `game_id` → games, `row`, `col`, `value` (char), `filled_by` → users, unique(game_id, row, col) |
| `game_moves` | `id` (uuid) | `game_id` → games, `user_id` → users, `row`, `col`, `value` (text, empty=deletion), `created_at` — append-only move history; not updated on re-fill |
| `puzzle_ratings` | `id` (uuid) | `puzzle_id` → puzzles, `user_id` → users, `difficulty` (1-5), `enjoyment` (1-5), unique(puzzle_id, user_id) |
| `game_reports` | `id` (uuid) | `game_id` → games (CASCADE), `reporter_id` → users (CASCADE), `reported_user_id` → users (CASCADE), `reason` (text), `created_at` |

---

## 5. Shared Types Location

All TypeScript interfaces: `/shared/src/types.ts`
Compiled output: `/shared/dist/types.{js,d.ts}`
