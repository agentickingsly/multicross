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
