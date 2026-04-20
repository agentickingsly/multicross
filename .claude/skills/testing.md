# testing

## When to write tests

Write tests for every new feature and every modified code path. Tests are
not optional — do not mark a task complete until tests exist and pass.

## Setup and helpers
See `vitest-testing.md` for run commands, the `registerTestUser` helper, auth header helper, and CI config.

## Hard rule: never test against real infrastructure

Mock all PostgreSQL and Redis calls. Tests must pass without a running database
or Redis instance. Use `vi.mock` at the module level.

```ts
vi.mock("../db/pool", () => ({
  default: { query: vi.fn() },
}));
vi.mock("../db/redis", () => ({
  default: { hgetall: vi.fn(), hset: vi.fn(), hdel: vi.fn() },
  pub: { publish: vi.fn() },
  sub: { subscribe: vi.fn(), on: vi.fn() },
  getGameState: vi.fn(),
  setCell: vi.fn(),
  getCursors: vi.fn(),
  setCursor: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  addMember: vi.fn(),
  isMember: vi.fn(),
  deleteGameKeys: vi.fn(),
}));
```

Exception: integration tests in `server/src/__tests__/` that test full HTTP
request/response cycles via `supertest` DO use the real DB (see vitest-testing.md).
The distinction is: **unit tests** mock infrastructure; **integration tests** use
the real DB in the test environment.

## File locations

```
server/src/__tests__/          ← integration tests (supertest + real DB)
server/src/<module>/__tests__/ ← unit tests for a specific module (mocked)
```

If a module has no `__tests__/` subdirectory yet, create one.

## What to test

### For every new REST endpoint

- 200/201 happy path: correct status, expected response shape
- 401 without token
- 400 for invalid/missing request body fields (each Zod rule)
- 404 for unknown resource IDs
- 403 for accessing another user's resource
- 409 for uniqueness conflicts if applicable

### For every new utility/pure function

- Happy path with representative inputs
- Edge cases: empty input, zero, null/undefined, boundary values
- Failure cases: invalid input should throw or return expected error value

### For WS handlers (unit tests with mocked socket)

- Payload validation rejects malformed input
- DB writes are called with correct arguments
- Correct events are emitted to the right room/socket

## Before marking a task done

1. `npm run test --workspace=server` — all tests pass
2. No skipped or `.only` tests left in the codebase
3. If a function was too tightly coupled to infrastructure to unit-test
   cleanly, refactor first: extract pure logic, inject dependencies.
