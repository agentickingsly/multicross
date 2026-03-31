# Crossword MVP — shared agent context

## Project overview
Multiplayer crossword app. Players join a room via share code and solve a puzzle together in real time.

## Module ownership
Each agent session owns one module. Do NOT modify files outside your assigned module.

| Module | Path | Owned by |
|--------|------|----------|
| REST API | /server/routes | Session 2 |
| WebSocket + Redis | /server/ws, /server/db/redis.ts | Session 3 |
| React frontend | /client/src | Session 4 |
| Puzzle parser | /scripts, /server/routes/puzzles.ts | Session 5 |
| Integration | all (read-only except glue code) | Session 6 |
| Shared types | /shared | Any session (additive only) |

## Key contracts
- All WS event names and payloads: /docs/contracts.md
- Redis key conventions: /docs/redis.md
- REST API spec: /docs/api.yaml
- DB schema: /server/db/schema.sql

## Hard rules
1. Never rename a WS event or REST endpoint without updating contracts.md
2. Never change the DB schema without a migration file in /server/db/migrations
3. Never add a dependency without noting it in your session summary
4. Prefer Sonnet over Opus for all tasks — only use Opus if you genuinely need deep reasoning
5. Write a DONE.md summary at the end of your session listing files created/modified

## Stack
- Backend: Node.js, Express, Socket.io, PostgreSQL (pg), Redis (ioredis), JWT, Zod
- Frontend: React, Vite, TypeScript, react-router-dom
- Shared: TypeScript types in /shared/typexs.ts
- Infra: Docker Compose (postgres + redis)
