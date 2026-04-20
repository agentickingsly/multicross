# multicross-gotchas

Project-specific rules and hard-won lessons for working on the Multicross
codebase. Read this at the start of any session before touching shared types,
Redis, or the deploy pipeline.

---

## 1. Always rebuild `shared/dist/` after editing `shared/src/types.ts`

**The trap:** `server/tsconfig.json` resolves `@multicross/shared` via a `paths`
alias pointing to `../shared/dist/types` — the *compiled* output, not the
source. CI does the same (`tsc --noEmit`, no build step for shared). The dist
files are committed to the repo, so if you edit `shared/src/types.ts` and
forget to rebuild, the server (and CI) will type-check against the old dist and
produce errors like:

```
Object literal may only specify known properties,
and 'cursors' does not exist in type 'RoomJoinedPayload'.
```

**The fix:** every time `shared/src/types.ts` changes, run:

```bash
npm run build --workspace=shared
```

then `git add shared/dist/` alongside the source change in the same commit.

The root-level `npm run build` does this correctly (runs shared → server →
client in order), but CI only runs `tsc --noEmit` per package and never invokes
the build script.

---

## 2. Server port is 3001; client dev server is 5173

- Backend: `PORT=3001` (default in `server/.env.example`)
- Frontend Vite dev server: `5173` (Vite default)
- `VITE_API_URL` in the client `.env` must point to the backend, e.g.
  `http://localhost:3001`
- `ALLOWED_ORIGINS` in the server `.env` must include the frontend origin, e.g.
  `http://localhost:5173`
- In production, Caddy sits in front and proxies both; `app.set('trust proxy', 1)`
  is set immediately after `const app = express()` to honour `X-Forwarded-For`.

---

## 3. Deploy chain (production)

```
npm run build          # shared → server → client (in order, do not skip shared)
npm run migrate        # runs pending SQL migrations via ts-node
npm run seed           # optional: loads seed puzzles (idempotent-ish, see §5)
pm2 restart multicross # or pm2 start dist/index.js --name multicross
```

Caddy serves the frontend static files and reverse-proxies `/api` and
`/socket.io` to `localhost:3001`. The client `dist/` is served from
`server/dist/../client/dist` in production mode (Express static middleware in
`server/src/index.ts`).

---

## 4. Seed data location and structure

| Path | What |
|------|------|
| `/scripts/puzzles.json` | Source JSON for seed puzzles (3 puzzles: Mini Monday, Week Starter, Wednesday Challenge) |
| `server/src/scripts/seed.ts` | Script that reads puzzles.json and upserts into the `puzzles` table |
| `npm run seed` (root) | Delegates to `npm run seed --workspace=server` |

Seed puzzles are inserted with `status = 'published'`. The script uses
`ON CONFLICT (title) DO NOTHING` so running it twice is safe for titles but
**will not update** an existing puzzle if its content changed — delete the row
first if you need to reseed a specific puzzle.

---

## 5. Redis: `members` vs `participants` — they are different keys

Two Redis sets track players per game, with different lifetimes:

| Key | Type | When added | When removed |
|-----|------|-----------|-------------|
| `game:{gameId}:participants` | Set | `join_room` WS event | `leave_room` or socket `disconnect` |
| `game:{gameId}:members` | Set | `join_room` WS event | Only when game is deleted (`deleteGameKeys`) |

**`participants`** = who is *currently connected* to the room. Used for
membership checks before processing `fill_cell` / `move_cursor`.

**`members`** = who has *ever* connected to this game via WS. Never cleared on
disconnect. Used exclusively by the `join_room` handler to detect whether a
player is rejoining (`isMember → true`) vs joining for the first time
(`isMember → false`), so the `participant_joined` broadcast can carry
`rejoining: boolean` for the UI.

Both keys are wiped by `deleteGameKeys(gameId)` when the game completes.
Helper functions live in `server/src/db/redis.ts`:
- `addParticipant` / `removeParticipant` / `getParticipants`
- `addMember` / `isMember`

---

## 6. Migration numbering

Migration files live in `server/src/db/migrations/` and must be named
`NNN_description.sql` (zero-padded to 3 digits). The migrate runner applies
them in filename order and records each in the `_migrations` table — they are
**never re-run**. Current files: `001_initial_schema.sql`,
`002_puzzle_authoring.sql`. Next migration must be `003_`.

---

## 7. Docker Compose is for local infra only

`docker-compose.yml` starts Postgres 16 and Redis 7. It does **not** run the
app. The app is run via `npm run dev` (development) or PM2 (production).
Schema is pre-loaded into the Postgres container via
`docker-entrypoint-initdb.d/01_schema.sql` only on first volume creation;
after that, use `npm run migrate`.
