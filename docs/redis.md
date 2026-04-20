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

### `channel:game:{gameId}` — Pub/Sub Channel

Used for broadcasting real-time game events across multiple server instances.

- **Publishers:** Session 3 WS handlers after state mutations
- **Subscribers:** All server instances that have a socket in that game room
- **Message format:** JSON `{ "event": "<eventName>", "payload": { ... } }`

---

## Key Lifetime

Keys for a game should be cleaned up when `games.status` transitions to `complete`.
A background job (or the `game_complete` handler) should call `DEL` on all three data keys.

---

## Naming Rules

1. Always use lowercase
2. Always include `game:` prefix before the gameId
3. Never use user IDs as top-level key components — scope them under a game key
