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

### Input validation
- [ ] Every new REST endpoint has a Zod schema that validates the request body
      before any DB or Redis access
- [ ] Every new WS handler validates its payload with a Zod schema
- [ ] UUIDs validated with `z.string().uuid()` — never assume a string is a
      valid UUID
- [ ] No raw `req.params.id` passed directly to a query without validation

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
- [ ] No `as SomeType` casts without a comment explaining why it is safe
- [ ] All function parameters and return types are either inferred correctly
      or explicitly annotated
- [ ] `satisfies` used on style objects (`const s = { ... } satisfies
      Record<string, React.CSSProperties>`) — do not widen to `any`

### React / frontend specifics
- [ ] No direct DOM manipulation — all state goes through `useState`
- [ ] `useEffect` cleanup functions remove all event listeners and WS
      subscriptions
- [ ] `useCallback` / `useMemo` only where the dependency arrays are correct
      — an empty `[]` that should list deps is worse than no memoisation
- [ ] No inline object or function literals passed as props to components that
      re-render frequently (creates unnecessary re-renders)

## How to perform the review

After writing code, re-read every changed file top-to-bottom with this list
open. Do not skim. If an item cannot be checked off, fix it now. Then re-run
the test suite to confirm nothing broke.
