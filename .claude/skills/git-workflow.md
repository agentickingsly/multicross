# Git Workflow

## Branch roles
| Branch | Purpose |
|--------|---------|
| `main` | Development branch — all feature work merges here |
| `production` | Deploy branch — only receives merges from `main` when ready to release |

## To deploy
Before running these steps, verify the pre-deploy checklist in `deploy-checklist.md`.

```
git checkout production
git merge main
git push origin production
git checkout main
```

## Rules
- **Never force push** to `main` or `production`.
- **Never edit files directly on the VPS.** The deploy script runs `git checkout -- .` before pulling, which silently discards any direct VPS edits. All changes must go through Git.
- Only merge `main` → `production` when the feature is verified and ready to release.
