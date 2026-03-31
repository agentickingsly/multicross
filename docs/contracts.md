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
| `fill_cell` | `{ gameId: string, row: number, col: number, value: string, userId: string }` |
| `move_cursor` | `{ gameId: string, row: number, col: number, userId: string }` |
| `leave_room` | `{ gameId: string, userId: string }` |

### Server → Client

| Event | Payload |
|-------|---------|
| `room_joined` | `{ game: Game, participants: GameParticipant[], cells: GameCell[] }` |
| `cell_updated` | `{ row: number, col: number, value: string, filledBy: string, correct: boolean }` |
| `cursor_moved` | `{ userId: string, row: number, col: number, color: string }` |
| `participant_joined` | `{ participant: GameParticipant }` |
| `participant_left` | `{ userId: string }` |
| `game_complete` | `{ completedAt: string, stats: { userId: string, cellsFilled: number }[] }` |

---

## 2. REST Endpoints

Base path: `/api`

| Method | Path | Request Body | Response Body |
|--------|------|-------------|---------------|
| POST | `/auth/register` | `{ email, displayName, password }` | `{ user: User, token: string }` |
| POST | `/auth/login` | `{ email, password }` | `{ user: User, token: string }` |
| GET | `/puzzles` | — | `{ puzzles: Puzzle[] }` |
| GET | `/puzzles/:id` | — | `{ puzzle: Puzzle }` |
| POST | `/games` | `{ puzzleId: string }` | `{ game: Game }` |
| POST | `/games/:id/join` | `{ userId: string }` | `{ game: Game, participant: GameParticipant }` |
| GET | `/games/:id` | — | `{ game: Game, participants: GameParticipant[], cells: GameCell[] }` |

All error responses: `{ error: string }` with appropriate HTTP status code.
Protected routes (POST /games, POST /games/:id/join, GET /games/:id) require `Authorization: Bearer <token>` header.

---

## 3. Redis Keys

See `/docs/redis.md` for full details.

| Key | Type | Description |
|-----|------|-------------|
| `game:{gameId}:state` | Hash | Full game grid: field = `{row}:{col}`, value = `{ value, filledBy }` JSON |
| `game:{gameId}:cursors` | Hash | Cursor positions: field = `{userId}`, value = `{ row, col }` JSON |
| `game:{gameId}:participants` | Set | Set of `userId` strings currently in the room |
| `channel:game:{gameId}` | Pub/Sub channel | Used to broadcast events to all server instances |

---

## 4. Database Schema Summary

See `/server/src/db/schema.sql` for full DDL.

| Table | Primary Key | Notable Columns |
|-------|-------------|-----------------|
| `users` | `id` (uuid) | `email` (unique), `display_name`, `password_hash` |
| `puzzles` | `id` (uuid) | `width`, `height`, `grid` (jsonb), `clues` (jsonb) |
| `games` | `id` (uuid) | `room_code` (unique 6-char), `status` (enum), `puzzle_id` → puzzles, `created_by` → users |
| `game_participants` | `id` (uuid) | `game_id` → games, `user_id` → users, `color` (hex), unique(game_id, user_id) |
| `game_cells` | `id` (uuid) | `game_id` → games, `row`, `col`, `value` (char), `filled_by` → users, unique(game_id, row, col) |

---

## 5. Shared Types Location

All TypeScript interfaces: `/shared/src/types.ts`
Compiled output: `/shared/dist/types.{js,d.ts}`
