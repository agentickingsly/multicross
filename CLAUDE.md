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
See `postgres-patterns.md`, `react-component.md`, `security-performance.md`, and `crossword-domain.md` for all server and frontend conventions.

## Puzzle data format
See `crossword-domain.md` for grid format, clue structure, auto-numbering, and color conventions.

## Hard rules
1. Never rename a WS event or REST endpoint without updating /docs/contracts.md
2. Never add a dependency without noting it in your session summary
3. Write a DONE.md at the end of every session listing files created/modified
4. Prefer Sonnet over Opus — only use Opus for genuinely ambiguous problems
5. Never edit files directly on the VPS — all changes go through Git

## Key contracts
- WS events + REST endpoints: /docs/contracts.md
- Redis key conventions: /docs/redis.md
- DB schema: /server/src/db/schema.sql
- Shared types: /shared/src/types.ts

## Test conventions
See `vitest-testing.md` for test setup, helpers, email convention, and CI config.

## Skills — read before writing any code

**Always read (every session):**
- `.claude/skills/code-review.md` — self-review checklist, run before marking any task done
- `.claude/skills/security-performance.md` — mandatory security and performance rules
- `.claude/skills/multicross-gotchas.md` — project-specific traps: shared dist, ports, Redis, Express 5

**Read when the trigger applies:**

| Trigger | Skill file(s) |
|---------|---------------|
| Touching server DB or query code | `postgres-patterns.md` |
| Touching frontend components or pages | `react-component.md` |
| Touching grid, clue, or numbering logic | `crossword-domain.md` |
| Writing or running tests | `vitest-testing.md`, `testing.md` |
| Adding a DB migration | `migrations.md` |
| Touching Redis code | `redis-keys.md` |
| Deploying to production | `deploy-checklist.md`, `git-workflow.md` |
| Adding or changing env vars | `env-vars.md` |
