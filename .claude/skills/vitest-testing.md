# vitest-testing

## Setup
- Vitest 2.x + supertest in server/src/__tests__/
- Config: server/vitest.config.ts (singleFork: true — sequential execution)
- Run: npm run test --workspace=server
- Watch: npm run test:watch --workspace=server

## Test environment
- NODE_ENV=test skips: WS init, Redis connection, rate limiting, server listen
- app exported from server/src/index.ts for supertest
- DATABASE_URL must point to a test database
- INVITE_CODE is suppressed in vitest.config.ts

## Global setup
server/src/__tests__/setup.ts runs:
- beforeAll: runMigrations() — idempotent, safe to run every time
- afterAll: cleanup in FK-safe order:
  game_cells → game_participants → games → puzzles (test ones) → users

## Test email convention
Always use: testuser+${randomUUID()}@test.multicross
This pattern is used for cleanup — never use real emails in tests.

## Register helper (copy into test files that need auth)
import { randomUUID } from "crypto";
import request from "supertest";
import { app } from "../index";

async function registerTestUser() {
  const email = `testuser+${randomUUID()}@test.multicross`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, displayName: "Test User", password: "password123" });
  return {
    token: res.body.token as string,
    userId: res.body.user.id as string,
    email,
  };
}

## Auth header helper
function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

## What to test
See `testing.md` for the full policy: what to cover per endpoint, mocking rules, and unit vs integration test distinction.

## Existing test files
server/src/__tests__/gameLogic.test.ts — unit tests for generateRoomCode
server/src/__tests__/auth.test.ts — 7 integration tests for register/login
server/src/__tests__/games.test.ts — 6 integration tests for create/lookup/join

## CI integration
.github/workflows/ci.yml runs tests with:
- postgres:16-alpine service (POSTGRES_DB=crossword_test)
- DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crossword_test
- JWT_SECRET=test-secret-at-least-32-characters-long
- NODE_ENV=test
