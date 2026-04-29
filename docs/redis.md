# Redis Key Conventions

All keys are namespaced by `game:{gameId}` to avoid collisions across games.

---

## Keys

### `game:{gameId}:state` — Hash

Stores the current fill state of every non-empty cell in the grid.

- **Field:** `{row}:{col}` (e.g. `"3:7"`)
- **Value:** JSON string `{ "value": "A", "filledBy": "<userId>" }`
- **Set by:** Session 3 on each `fill_cell` event
- **TTL:** None (persists until game is archived)

### `game:{gameId}:cursors` — Hash

Stores the last-known cursor position for each participant.

- **Field:** `{userId}`
- **Value:** JSON string `{ "row": 3, "col": 7 }`
- **Set by:** Session 3 on each `move_cursor` event
- **Cleared:** When a participant leaves via `leave_room` or disconnect

### `game:{gameId}:participants` — Set

Tracks the set of user IDs currently in the game room.

- **Members:** `{userId}` strings
- **Updated by:** WS handlers on `join_room` (SADD) and `leave_room` / disconnect (SREM)
- **Used for:** Validating that a user is in a game before processing their events

### `game:{gameId}:members` — Set

Permanent record of every user who has ever joined this game via WS.

- **Members:** `{userId}` strings
- **Updated by:** WS `join_room` handler (SADD only — never removed on disconnect)
- **Used for:** Distinguishing a first-time join from a rejoin (to emit `rejoining: true` in `participant_joined`)
- **Cleared:** When game transitions to `complete` (same as other game keys)

### `game:{gameId}:spectators` — Set

Tracks the set of socket IDs currently watching the game as spectators.

- **Members:** `{socketId}` strings (not user IDs — a user can spectate from multiple tabs)
- **Updated by:** WS `spectate_room` handler (SADD) and socket `disconnect` (SREM)
- **Used for:** Computing the `spectator_count` broadcast payload
- **Cleared:** When game transitions to `complete`, `abandoned`, or `expired` (same as other game keys)

### `channel:game:{gameId}` — Pub/Sub Channel

Used for broadcasting real-time game events across multiple server instances.

- **Publishers:** Session 3 WS handlers after state mutations
- **Subscribers:** All server instances that have a socket in that game room
- **Message format:** JSON `{ "event": "<eventName>", "payload": { ... } }`

### `user:{userId}:connections` — String (integer counter)

Tracks how many active WebSocket connections a user currently has, for online presence in the friends list.

- **Value:** Integer (number of open sockets for this user)
- **Set by:** WS `connection` event via `incrementUserConnections`; decremented in `disconnecting` via `decrementUserConnections`; key deleted when counter reaches 0
- **Used for:** `GET /api/friends` to determine `online: boolean` for each friend
- **TTL:** None — key is deleted automatically when the counter reaches 0

### `channel:user:{userId}` — Pub/Sub Channel

Used for delivering per-user notifications (friend requests, game invites) across server instances.

- **Publishers:** `/api/friends/request` and `/api/games/:id/invite` route handlers
- **Subscribers:** All server instances (subscribed on first connect per user)
- **Message format:** JSON `{ "event": "<eventName>", "payload": { ... } }`
- **Relayed events:** `friend_request`, `game_invite`

---

## Key Lifetime

Keys for a game should be cleaned up when `games.status` transitions to `complete`.
A background job (or the `game_complete` handler) should call `DEL` on all three data keys.

---

## Naming Rules

1. Always use lowercase
2. Always include `game:` prefix before the gameId
3. Never use user IDs as top-level key components — scope them under a game key
