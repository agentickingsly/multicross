# code-review

Perform a self-review pass on every change before marking a task complete.
This is not optional. Work through each checklist item and fix anything found.

## Checklist

### Unused code
- [ ] No unused variables or function parameters (TypeScript will catch some;
      check manually for `_`-prefixed suppressions that are no longer needed)
- [ ] No unused imports — remove them, do not leave dead `import` lines
- [ ] No dead branches (`if (false)`, conditions that can never be true given
      the types)

### Error handling
- [ ] Every `async` Express route uses `try/catch` and calls `next(err)` on
      failure — never let a thrown error reach Express unhandled
- [ ] WS handlers have `try/catch` around all async work and log via `logger`
- [ ] Errors logged with `logger.error({ err }, "message")` — never
      `console.log` or `console.error`
- [ ] Client `catch` blocks set error state via `setError(...)` — never
      silently swallow errors

### Input validation & API contracts
- [ ] Every new REST endpoint has a Zod schema that validates the request body
      before any DB or Redis access
- [ ] Every new WS handler validates its payload with a Zod schema
- [ ] UUIDs validated with `z.string().uuid()` — never assume a string is a
      valid UUID
- [ ] No raw `req.params.id` passed directly to a query without validation
- [ ] Auth-required endpoints derive user identity exclusively from `req.user`
      (set by the JWT middleware) — never trust a userId from `req.body`,
      `req.query`, or `req.params`
- [ ] New literal-path route segments (e.g. `/games/my-active`) are registered
      **before** wildcard/param routes (e.g. `/games/:id`) in the same router
      file — Express matches routes in declaration order and will swallow the
      literal as an ID otherwise

### Hardcoded values
- [ ] No hardcoded URLs, ports, secrets, or environment-specific strings in
      source — use `process.env.*` with a `.env.example` entry
- [ ] Color arrays, magic numbers, and reused string literals extracted to
      named constants at the top of the file

### Duplication
- [ ] No logic copy-pasted from another file — extract a shared helper if
      the same pattern appears more than once
- [ ] Row-mapping functions (`mapGameRow`, `mapParticipantRow`, etc.) reused,
      not reimplemented inline

### TypeScript quality
- [ ] No `any` — use `unknown` and narrow, or define an interface
- [ ] No implicit `any` — all function parameters, return types, and variables
      must be explicitly typed or provably inferred; never leave a parameter
      untyped and let TypeScript silently widen it to `any`
- [ ] No `as SomeType` casts without a comment explaining why it is safe
- [ ] All function parameters and return types are either inferred correctly
      or explicitly annotated
- [ ] `satisfies` used on style objects (`const s = { ... } satisfies
      Record<string, React.CSSProperties>`) — do not widen to `any`
- [ ] Types shared between client and server live in `shared/src/types.ts` —
      never redefine them locally in a route, component, or WS handler
- [ ] If `shared/src/types.ts` was changed: `npm run build --workspace=shared`
      has been run and `shared/dist/` is included in the same commit

### React / frontend specifics
- [ ] No direct DOM manipulation — all state goes through `useState`
- [ ] `useEffect` cleanup functions remove all event listeners and WS
      subscriptions
- [ ] `useCallback` / `useMemo` only where the dependency arrays are correct
      — an empty `[]` that should list deps is worse than no memoisation
- [ ] No inline object or function literals passed as props to components that
      re-render frequently (creates unnecessary re-renders)

### WebSocket
- [ ] New socket event payload types are added to `shared/src/types.ts`
      (alongside `RoomJoinedPayload`, `ParticipantJoinedPayload`, etc.) —
      never type them inline with an object literal in the handler
- [ ] New WS events added to `shared/src/types.ts` are also documented in
      `/docs/contracts.md` (hard rule #1)
- [ ] Broadcasts target a specific room (`io.to(gameId).emit(...)`) —
      never use a global `io.emit(...)` that would reach all connected clients

### Redis
- [ ] `members` (set of every userId who has ever joined a room, never cleared
      on disconnect) and `participants` (set of currently connected userIds,
      removed on disconnect) are kept strictly separate — do not read one when
      you mean the other
- [ ] Any new Redis key pattern introduced follows the `game:{gameId}:*`
      convention and is wired into `deleteGameKeys(gameId)` in
      `server/src/db/redis.ts` so it is cleaned up when a game ends

### Testing
See `testing.md` for mocking rules (unit vs. integration) and coverage expectations.

## How to perform the review

After writing code, re-read every changed file top-to-bottom with this list
open. Do not skim. If an item cannot be checked off, fix it now. Then re-run
the test suite to confirm nothing broke.
