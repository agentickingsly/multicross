# Session: Competitive 1v1 Mode

## Files created

| File | Purpose |
|------|---------|
| `server/src/db/migrations/010_competitive_mode.sql` | DB migration: competitive_matches + competitive_cells tables + indexes |
| `server/src/routes/competitive.ts` | REST routes: POST /challenge, GET /matches, GET /matches/:matchId |
| `client/src/components/ChallengeModal.tsx` | Modal for picking puzzle + time limit and sending a challenge |
| `client/src/components/IncomingChallengeModal.tsx` | Modal shown when match_invite WS event arrives |
| `client/src/pages/CompetitivePage.tsx` | /competitive/:matchId — side-by-side boards, countdown timer, result overlay |

## Files modified

| File | Change |
|------|--------|
| `shared/src/types.ts` | Added 8 new WS payload interfaces + 5 server→client events + 3 client→server events + REST response shapes |
| `shared/dist/types.js` / `shared/dist/types.d.ts` | Rebuilt after types change |
| `server/src/index.ts` | Mounted competitiveRouter at /api/competitive |
| `server/src/ws/handlers.ts` | Added ALLOWED_USER_EVENTS for match events; matchTimers Map; match_accept / match_decline / match_fill_cell handlers; resolveMatch() + startMatchTimer() helpers |
| `client/src/components/CrosswordGrid.tsx` | Added optional hiddenLetters prop (fills show as neutral grey #94a3b8, no letter rendered) |
| `client/src/api/client.ts` | Added challengeFriend(), getCompetitiveMatches(), getCompetitiveMatch() |
| `client/src/pages/LobbyPage.tsx` | Added ChallengeModal + IncomingChallengeModal; match_invite + match_started WS listeners; Challenge button on each friend row |
| `client/src/App.tsx` | Added /competitive/:matchId protected route |
| `docs/contracts.md` | Documented all 8 new WS events and 3 new REST endpoints; updated DB schema table |

## Design notes

- All competitive WS events use user channels (channel:user:{id}) — no new socket.io room needed
- Opponent letter values are never sent over the wire: match_cell_updated carries only `filled: boolean`; GET /matches/:matchId opponent query selects only row/col
- Server-side timer uses a module-level Map<matchId, NodeJS.Timeout>; timers are lost on restart (documented as TODO in handlers.ts)
- Draw condition: winnerId = null when cell counts are equal at timeout; frontend shows "Draw" overlay
- hiddenLetters prop is purely additive — all existing CrosswordGrid callers unaffected
