# Deploy Checklist

Before marking a feature done, verify each item that applies:

## 1. Shared types changed?
If `shared/src/types.ts` was modified, run:
```
npm run build --workspace=shared
```
Then commit `shared/dist/` in the **same commit** as the types change. CI will fail if `shared/dist/` is out of sync.

## 2. Client code changed?
No manual step needed — `deploy.sh` rebuilds the client automatically on deploy.

## 3. New migrations added?
No manual step needed — `deploy.sh` runs `npm run migrate --workspace=server` automatically on deploy.

## 4. New env vars added?
Update the VPS `.env` manually via SSH and document in `.env.example`. See `env-vars.md` for the full procedure and production rules.

---
For branch/deploy steps and VPS editing rules, see `git-workflow.md`.
