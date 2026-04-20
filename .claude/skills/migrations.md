# Database Migrations

## File location and naming
Migration files live in `server/src/db/migrations/`. Name each file `00N_description.sql`, incrementing from the last existing number (e.g., if `004_` exists, the next is `005_`).

## Before committing
Always test locally with:
```
npm run migrate --workspace=server
```
Confirm the migration applies cleanly on a fresh run before committing.

## Game-related changes
If a migration adds or removes a table or column that is part of a game's lifecycle (e.g., `games`, `game_cells`, `game_participants`, or related tables), review `deleteGameKeys` in `server/src/db/redis.ts` to ensure Redis cleanup remains complete. Missing cleanup can leave stale keys in Redis after a game is deleted.

## Immutability rule
Never modify an existing migration file. If a previously applied migration needs to change, add a new migration that performs the corrective change.
