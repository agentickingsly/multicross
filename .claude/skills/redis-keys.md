# Redis Key Patterns

## Current keys

| Key pattern | Type | Lifetime | Purpose |
|-------------|------|----------|---------|
| `game:{gameId}:members` | Set | Permanent | All user IDs who ever joined the game. Never cleared on disconnect. Cleaned up by `deleteGameKeys` when the game completes, is abandoned, or expires. |
| `game:{gameId}:participants` | Set | Ephemeral | Live presence — users currently connected. Cleared on disconnect. |
| `game:{gameId}:cursors` | Hash | Ephemeral | Current cursor position per user. Cleared with the game. |
| `game:{gameId}:cells` | Hash | Ephemeral | Current cell state for the board. Cleared with the game. |
| `game:{gameId}:spectators` | Set | Ephemeral | Socket IDs currently spectating (not user IDs — one user can have multiple tabs). Cleared on disconnect and in `deleteGameKeys`. |

## Adding a new Redis key
1. Add the pattern to the table above (name, type, lifetime, purpose).
2. Add cleanup to `deleteGameKeys` in `server/src/db/redis.ts`.
3. Note whether the key is **permanent** (survives disconnects, deleted only on game end) or **ephemeral** (cleared on disconnect or session end).

## Cleanup reference
`deleteGameKeys` in `server/src/db/redis.ts` is the single place responsible for removing all Redis state for a game. It must stay in sync with this list — any key not deleted there will leak until Redis eviction.

For the detailed explanation of WHY `members` and `participants` are kept separate (and how the `rejoining` flag works), see `multicross-gotchas.md` §5.
