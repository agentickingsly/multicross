# Session 4 — Frontend Shell DONE

## Files created

| File | Description |
|------|-------------|
| `src/App.tsx` | All 5 routes + ProtectedRoute (redirects to /login if no token) |
| `src/api/client.ts` | Mock API — 3 fake puzzles, in-memory game store, all CRUD functions |
| `src/ws/socket.ts` | Mock WS — in-memory event bus, connect/disconnect/emit/on/mockReceive |
| `src/pages/LandingPage.tsx` | App name, tagline, decorative mini grid, Login + Register buttons |
| `src/pages/LoginPage.tsx` | Email/password form, stores token + user to localStorage, redirects to /lobby |
| `src/pages/RegisterPage.tsx` | Email/displayName/password form, same auth flow |
| `src/pages/LobbyPage.tsx` | Puzzle list with Create game, room-code join input, logout |
| `src/pages/GamePage.tsx` | Loads game + puzzle, renders CrosswordGrid, WS event wiring, completion modal |
| `src/components/CrosswordGrid.tsx` | Full interactive crossword grid (see below) |

## CrosswordGrid features

- CSS-grid rendering, configurable cell size
- Black cells rendered as dark squares
- Clue numbers auto-derived from grid topology (across-start and down-start algorithm)
- Keyboard: arrows move selection, letter fills + advances cursor, Backspace clears/retreats, Tab toggles direction
- Cell click selects; re-click same cell toggles across/down direction
- Selected cell: light-blue highlight + blue border
- Correct cells (value matches puzzle answer): light-green background
- Participant cursors: colored border from `participant.color`, fed via `cursors` prop
- Clue list (Across + Down) alongside grid; clicking a clue jumps cursor to that word and highlights cells
- Active clue highlighted in blue in the clue list

## Mock data

Three 5x5 puzzles: "Mini Classic", "Quick Bite", "Word Play". Each has 3 across + 3 down clues with verified clue numbering. Demo room code `ABCD12` -> `game-demo`.

## Auth flow (end-to-end with mocks)

1. `/register` -> form -> stores `multicross_token` + `multicross_user` -> `/lobby`
2. `/lobby` -> pick puzzle -> `createGame()` -> `/game/:gameId`
3. `/game/:gameId` -> loads puzzle + game -> interactive CrosswordGrid
4. Demo: second participant cursor appears at row 1, col 0 after 1.5s

## No new dependencies added

All packages were already present in `client/package.json`.

---

# Session 6 — Integration: Client Wiring DONE

## Files Modified
- `src/api/client.ts` — replaced all mocks with real fetch calls to `http://localhost:3001/api`
- `src/ws/socket.ts` — replaced in-memory mock with real `socket.io-client` singleton
- `src/pages/GamePage.tsx` — added `join_room`/`leave_room` emits, `participant_joined`/`participant_left` listeners, removed demo mock code

## What Works

### API Client (`client.ts`)
- `login` → `POST /api/auth/login`, `register` → `POST /api/auth/register` (no auth header)
- `getPuzzles` → `GET /api/puzzles`, `getPuzzle` → `GET /api/puzzles/:id` (auth header)
- `createGame` → `POST /api/games`, `getGame` → `GET /api/games/:id` (auth header)
- 401 responses clear `multicross_token`/`multicross_user` from localStorage and redirect to `/login`

### WebSocket Client (`socket.ts`)
- Real `socket.io-client` singleton connecting to `http://localhost:3001` with `auth: { token }`
- `connect_error` and `disconnect` events logged; no crash
- `on()` returns unsubscribe function; `emit()` buffers until connected

### GamePage
- Emits `join_room { gameId, userId }` on mount (buffered by socket.io until connected)
- Emits `leave_room { gameId, userId }` then disconnects on unmount
- `participant_joined` → adds participant to list (deduped)
- `participant_left` → removes participant from list

### Auth Pages
No changes needed — already called `login()` / `register()` from client.ts.

### LobbyPage
No changes needed — already called `getPuzzles()`, `createGame()`, `joinGame()` from client.ts.

## Known Issues / Server Gaps

### 1. Join by Room Code — BLOCKED ❌
`GET /api/games?roomCode=X` does not exist on the server. The `joinGameByCode` function
attempts this call and will fail with a 404 until the server adds support.

**Fix needed in `server/src/routes/games.ts`:**
```ts
router.get("/", requireAuth, async (req, res) => {
  const { roomCode } = req.query;
  if (!roomCode) { res.status(400).json({ error: "roomCode required" }); return; }
  const result = await pool.query(
    `SELECT id FROM games WHERE room_code = $1`, [String(roomCode).toUpperCase()]
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Game not found" }); return; }
  res.json({ game: { id: result.rows[0].id } });
});
```
Also update `docs/contracts.md` to add `GET /api/games?roomCode=X → { game: { id } }`.

### 2. Join game status check
`POST /api/games/:id/join` rejects with 400 if status ≠ `waiting`. If WS transitions the
game to `active` on `join_room` before a second player's HTTP join, the second player will
get a 400.

### 3. Puzzle routes require auth
`GET /api/puzzles` and `GET /api/puzzles/:id` use `requireAuth`. Working correctly, but an
expired token mid-session will redirect to `/login`.

## End-to-End Flow Status

| Step | Status |
|------|--------|
| Register → lobby redirect | ✅ Works with server running |
| Lobby loads real puzzles | ✅ Works |
| Create game → redirect to game page | ✅ Works |
| Game page loads puzzle grid | ✅ Works |
| WS connects, `join_room` fires | ✅ Works |
| Typing a letter emits `fill_cell` | ✅ Works |
| Join game by room code | ❌ Blocked — server missing `GET /api/games?roomCode` |

## New Dependencies
- `socket.io-client` — already listed in `client/package.json`; hoisted to root `node_modules` by npm workspaces
