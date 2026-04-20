# Multicross

[![CI](https://github.com/agentickingsly/multicross/actions/workflows/ci.yml/badge.svg)](https://github.com/agentickingsly/multicross/actions/workflows/ci.yml)

Multiplayer crossword app. Solve puzzles together in real time.

## Prerequisites

- Node.js 18+
- PostgreSQL 16
- Redis 7
- Docker (optional, for local dev)

## Branching strategy

| Branch | Purpose |
|---|---|
| `main` | Active development. All feature branches merge here via PR. CI runs type checks and tests on every push and PR. Never auto-deploys. |
| `production` | Stable release branch. Reflects what is live on multicross.org. Auto-deploys to VPS on every push. |

**Workflow:**
1. Feature work happens on `feature/*` branches; PRs merge into `main`.
2. When ready to release, open a PR from `main` → `production` (or merge directly).
3. Pushing to `production` triggers the Deploy workflow, which runs the full test suite before deploying.

## Local development

```bash
# 1. Clone the repo
git clone <repo-url>
cd multicross

# 2. Copy and fill in environment files
cp server/.env.example server/.env   # edit JWT_SECRET and DATABASE_URL at minimum
cp client/.env.example client/.env

# 3. Start Postgres + Redis
docker-compose up -d

# 4. Install dependencies
npm install

# 5. Run database migrations
npm run migrate

# 6. Seed initial puzzle data
npm run seed

# 7. Start server (:3001) and client (:5173) together
npm run dev
```

## Environment variables

### Server (`server/.env`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/crossword` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing JWTs — must be 32+ chars | `openssl rand -base64 48` |
| `PORT` | Port the API server listens on | `3001` |
| `NODE_ENV` | Runtime environment | `development` or `production` |
| `LOG_LEVEL` | Pino log level | `info`, `debug`, `warn`, `error` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `https://example.com,https://www.example.com` |

### Client (`client/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Base URL of the API server | `http://localhost:3001` |

## Production deployment

```bash
# 1. Set required environment variables
export NODE_ENV=production
export ALLOWED_ORIGINS=https://your-frontend-domain.com
export JWT_SECRET=$(openssl rand -base64 48)
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...

# 2. Build all packages
npm run build

# 3. Run migrations against the production database
npm run migrate

# 4. Start the server
npm run start
```

The production server serves the compiled React client from `client/dist` via Express static middleware, so no separate static host is required.

## Tech stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 18+ |
| API framework | Express |
| Real-time | Socket.io |
| Database | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Auth | JWT (jsonwebtoken) |
| Frontend framework | React |
| Frontend build | Vite |
| Language | TypeScript (shared types in `/shared`) |
| Local infra | Docker Compose |
