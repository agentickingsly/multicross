# Environment Variables

## server/.env
| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `ALLOWED_ORIGINS` | CORS allowed origins — **must be `https://multicross.org` in production, never `http://`** |
| `PORT` | Port Express listens on |

## client/.env
| Var | Purpose |
|-----|---------|
| `VITE_API_URL` | Base URL for all REST calls via `apiFetch()` — must match the server origin or the client will call the wrong endpoint |

## Adding a new env var
1. Add it to the relevant `.env.example` file in the same commit.
2. SSH into the VPS and add it to `server/.env` or `client/.env` manually.
3. If the var is needed in CI (e.g., for integration tests), add it to GitHub Actions secrets and reference it in the workflow file.

## Production rules
- `ALLOWED_ORIGINS` must always be `https://multicross.org` — never `http://`.
- `VITE_API_URL` must exactly match the server's public origin. A mismatch causes all client API calls to fail silently or hit the wrong host.
