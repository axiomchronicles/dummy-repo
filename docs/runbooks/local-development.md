# Local development runbook

Tested with Docker Desktop 4.78.0, Engine 29.5.3 and Compose 5.1.4. Require Compose 2.24 or newer for optional `.env` file syntax. Plain `up` is the supported path; Compose Watch is not configured. The pinned Node 24.13.0 Debian image and PostgreSQL 17/Redis 7.4 manifests support amd64 and arm64. App containers run as the node user with an init process and 30-second shutdown grace.

## Start and inspect

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f api worker web
```

Open http://localhost:5173. Compose runs versioned migrations under an advisory lock and an idempotent persona seed before API/worker readiness. Serving processes never push or reset the schema. Normal shutdown is `docker compose down`; it preserves named volumes.

| Service       | Local address         | Container address |
| ------------- | --------------------- | ----------------- |
| Web           | http://localhost:5173 | web:5173          |
| API           | http://localhost:3000 | api:3000          |
| Worker health | http://localhost:3001 | worker:3001       |
| PostgreSQL    | localhost:5442        | postgres:5432     |
| Redis         | localhost:6389        | redis:6379        |

Ports are loopback-only. Change backing port variables and host DATABASE_URL/REDIS_URL together if occupied. PUBLIC_BASE_URL and ALLOWED_ORIGINS must match the browser origin. Browser assets never use container service DNS.

```bash
docker compose run --rm migrate
npm run db:generate
npm run db:migrate
docker compose exec postgres psql -U outreach -d outreach
docker compose exec redis redis-cli ping
docker compose restart worker
```

Review generated SQL before applying it. Host scripts load `.env` if present using Node's verified `--env-file-if-exists` option. Run host API/worker/web processes after stopping the corresponding Compose app to avoid port collisions; backing services can remain running. Vite uses API_PROXY_TARGET for host development. The static web server uses API_INTERNAL_URL inside Compose.

## Builds and recovery

`npm ci` installs the lockfile. `npm run build` produces API, worker, migration and seed CommonJS bundles plus `apps/web/dist`. Workspace source is bundled; third-party dependencies stay external. Nest uses explicit injection metadata. Runtime images prune development dependencies and contain no host node_modules mount. The Docker development target retains development tools.

API `/health/live` checks process life; `/health/ready` checks PostgreSQL/schema and Redis. Worker readiness also checks a recent successful outbox/recovery heartbeat. Bounded PostgreSQL queries and fail-fast producer Redis avoid indefinite coordination locks; worker Redis reconnects across outages. Readiness falls during dependency outages and recovers when connections return. Unfinished database intent is recovered without redialing uncertain live attempts.

For an unhealthy service inspect migration exit, backing logs and service DNS. Persisted import/report failure codes explain terminal errors. SSE reconnects replay database events and reauthorize sessions periodically. Logs omit keys, full phones, transcripts and raw provider payloads. Rebuild to apply source changes. Recovery tests intentionally restart only this Compose project's services; run browser acceptance afterward.

## Clean Compose acceptance

After building the local image, `npm run test:compose-smoke` creates a random isolated Compose project with fresh named volumes, uses ports3004/3005/5174/5443/6390, waits for API/worker/web readiness, signs in, validates four synthetic contacts, proves planning creates no attempts, simulates and downloads XLSX. Its cleanup stops that temporary project and removes only its newly created volumes; the normal developer project remains running. No real credentials or phone call is used. These smoke ports must be available.
