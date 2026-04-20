# Multicross — shared agent context

## Project overview
Multiplayer crossword app. Players join a room via share code and solve
a puzzle together in real time. MVP is complete and production-ready.

## Current project state
- Backend: fully implemented (auth, REST API, WebSocket, Redis pub/sub)
- Frontend: fully implemented (lobby, game page, crossword grid, contribution view, puzzle editor)
- Database: migrations system in place; puzzles created via puzzle editor
- CI/CD: GitHub Actions — TypeScript checks and Vitest test suite on all pushes; auto-deploy to VPS on push to `production` via appleboy/ssh-action; manual deploy also available via workflow_dispatch
- Security: rate limiting, JWT pinning, WS membership enforcement, Zod validation

## Features shipped
- Puzzle editor with grid size selector
- Mobile keyboard fix (hidden input triggers native keyboard)
- Rejoin session (reconnect to an in-progress game)
- Active games section in lobby
- Game expiry and abandon flow

## Stack
- Backend: Node.js 20 LTS, Express, Socket.io, PostgreSQL (pg), Redis (ioredis), JWT, Zod, pino
- Frontend: React, Vite, TypeScript, react-router-dom, socket.io-client
- Shared: TypeScript types in /shared/src/types.ts
- Testing: Vitest + supertest in /server/src/__tests__/
- Infra: Docker Compose (postgres + redis), PM2, Caddy, Node 20 LTS

## Branching strategy
| Branch | Role |
|--------|------|
| `main` | Development branch — all feature work merges here |
| `production` | Auto-deploy branch — push here to trigger deploy to VPS |

To deploy: `git checkout production && git merge main && git push origin production && git checkout main`
See `.claude/skills/git-workflow.md` for the full procedure.

## Module ownership
| Path | Purpose |
|------|---------|
| /server/src/routes | REST API handlers |
| /server/src/ws | WebSocket + Redis pub/sub handlers |
| /server/src/db | pool.ts, migrate.ts, redis.ts, migrations/ |
| /server/src/middleware | auth.ts (JWT verify, requireAuth) |
| /server/src/__tests__ | Vitest integration + unit tests |
| /client/src/pages | LobbyPage, GamePage, LoginPage, RegisterPage, EditorPage |
| /client/src/components | CrosswordGrid.tsx, PuzzleEditor.tsx |
| /client/src/utils | crosswordUtils.ts (auto-numbering, shared logic) |
| /client/src/api | client.ts (all REST calls via apiFetch) |
| /client/src/ws | socket.ts (Socket.io singleton) |
| /shared/src | types.ts only — no logic |
| /scripts | seed.ts, puzzles.json |
| /docs | contracts.md, redis.md, api.yaml |

## Established patterns

### Server
- Server runs on PORT=3001 (default; set in server/.env)
- All async Express routes use try/catch with next(err)
- Zod validation on all REST request bodies before any DB access
- JWT identity always from s.data.user.userId in WS handlers — never from client payload
- pg pool imported from server/src/db/pool.ts — never create a new pool
- pino logger imported from server/src/logger.ts — never use console.log
- New DB columns require a migration in server/src/db/migrations/
- Migration files are numbered: 001_, 002_, 003_ etc.
- Rate limiter and WS init are skipped in NODE_ENV=test

### Frontend
- Auth token: localStorage key "multicross_token"
- User object: localStorage key "multicross_user" (JSON)
- API base URL: import.meta.env.VITE_API_URL
- All REST calls go through apiFetch() in client/src/api/client.ts
- All WS events go through the singleton in client/src/ws/socket.ts
- Cell colors use hex + 2-char alpha suffix (e.g. color + "88" = 53% opacity)
- filledBy in cell payloads is always userId, never displayName

### TypeScript
- Shared types imported from /shared/src/types.ts
- Never use 'any' — use unknown and narrow, or define an interface
- All route handlers typed with Request, Response, NextFunction

## Puzzle data format
Grid: (string | null)[][] where null = black cell, "" = empty white, "A"-"Z" = solution
Clues: { across: Record<number, string>, down: Record<number, string> }
Clue numbers derived from grid topology — not stored, always computed
Auto-numbering algorithm lives in client/src/utils/crosswordUtils.ts

## Hard rules
1. Never rename a WS event or REST endpoint without updating /docs/contracts.md
2. Never change the DB schema without a new migration file
3. Never add a dependency without noting it in your session summary
4. Never create a new pg Pool — import from server/src/db/pool.ts
5. Never use console.log — import logger from server/src/logger.ts
6. Write a DONE.md at the end of every session listing files created/modified
7. Prefer Sonnet over Opus — only use Opus for genuinely ambiguous problems
8. Never edit files directly on the VPS — all changes go through Git

## Key contracts
- WS events + REST endpoints: /docs/contracts.md
- Redis key conventions: /docs/redis.md
- DB schema: /server/src/db/schema.sql
- Shared types: /shared/src/types.ts

## Test conventions
- Test emails: testuser+uuid@test.multicross
- Tests run sequentially (singleFork: true in vitest.config.ts)
- NODE_ENV=test skips WS init, rate limiting, server listen
- Cleanup order: game_cells → game_participants → games → users

## Skills — read before writing any code
Always read the relevant skill files from .claude/skills/ before starting work:

- .claude/skills/postgres-patterns.md — DB conventions, query patterns, schema
- .claude/skills/react-component.md — component structure, style conventions, state patterns
- .claude/skills/crossword-domain.md — grid format, auto-numbering, puzzle rules
- .claude/skills/vitest-testing.md — test setup, helpers, what to test
- .claude/skills/multicross-gotchas.md — project gotchas: shared dist rebuild, ports, deploy chain, seed data, Redis members vs participants
- .claude/skills/testing.md — when and how to write tests, mocking rules, coverage expectations
- .claude/skills/code-review.md — self-review checklist to run before marking any task done
- .claude/skills/security-performance.md — mandatory security and performance rules for all new code
- .claude/skills/migrations.md — migration naming, local testing, Redis cleanup review, immutability rule
- .claude/skills/deploy-checklist.md — pre-deploy verification: shared dist, env vars, VPS edit rules
- .claude/skills/env-vars.md — all env vars, production rules for ALLOWED_ORIGINS and VITE_API_URL, how to add new vars
- .claude/skills/git-workflow.md — branch roles, deploy steps, no-force-push and no-VPS-edit rules
- .claude/skills/redis-keys.md — all Redis key patterns, permanent vs ephemeral, deleteGameKeys cleanup rules

Read all thirteen at the start of every session. They contain patterns that
must be followed consistently across all sessions.
