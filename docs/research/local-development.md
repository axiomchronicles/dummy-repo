# Docker Compose and local developer environment research

Access date 2026-10-24. Local runtime verified using docker version and docker compose version: Docker Desktop 4.78.0, Engine 29.5.3, server linux/arm64, Compose 5.1.4. Availability does not claim the application has been built or run yet.

## Topology and compatibility

Use one TypeScript workspace with web, api and worker as separate processes. PostgreSQL owns state/artifacts; Redis coordinates BullMQ. No cloud account, mail service, S3, GPU or telemetry is required. A bounded first slice can store uploaded bytes/report bytes in PostgreSQL with protected download routes; introduce object storage only for demonstrated volume/retention needs and document storage limits.

| Service  | Internal address   | Host exposure                          | Readiness                                                                       |
| -------- | ------------------ | -------------------------------------- | ------------------------------------------------------------------------------- |
| web      | web:5173 or web:80 | 5173                                   | Served index request; /api reverse proxy to api                                 |
| api      | api:3000           | optional 3000 for developer HTTP tests | /health/live process; /health/ready DB query + Redis ping + migration readiness |
| worker   | worker:3001        | optional status port                   | HTTP status checks recent heartbeat, DB and Redis, accepting processors         |
| postgres | postgres:5432      | optional loopback 5432                 | pg_isready -U configured user -d configured database                            |
| redis    | redis:6379         | optional loopback 6379                 | redis-cli ping                                                                  |
| migrate  | one-shot app image | none                                   | exits zero after versioned migration and idempotent demo seed                   |

Official image registry manifest metadata inspected today confirms amd64 and arm64 for node:24-bookworm-slim, postgres:17-bookworm, redis:7.4-bookworm. Digests inspected: node sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205; postgres sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27; redis sha256:44960b3100c48159a66d28c18b0588c193492e25f7551d60e51dd464fc3eca5b. Lead may pin a full Node 24 patch after verifying its manifest. PostgreSQL17 avoids PostgreSQL18 data-path changes and is adequate for verified Drizzle driver support; this is a conservative stable version choice, not a latest claim.

## Compose requirements and design

API and worker depend on postgres/redis with condition service_healthy and migrate with service_completed_successfully. Health dependencies gate initial startup, but do not solve runtime reconnection. Implement bounded exponential startup connection retries and ongoing driver/Redis reconnect behavior; readiness becomes unavailable during outages. Never run drizzle push or destructive seed on app startup. Migration is a one-shot process, safe when rerun; simultaneous migrators require an advisory lock or one controlled runner.

Redis uses appendonly yes, appendfsync everysec and maxmemory-policy noeviction with a named /data volume. PostgreSQL uses a named data volume matching the selected major's image path. AOF is appropriate local durability, but DB outbox/recovery remains mandatory because Redis state may be lost. Local passwords are non-secret demo defaults and never production credentials. Compose service DNS is used between containers; localhost is only host/browser routing. Bind backing-service ports to 127.0.0.1 if exposed.

Build context is repository root; npm ci reads a reproducible lockfile. Multi-stage app builds compile shared packages, API and worker. Avoid host node_modules mounts and ignore node_modules, .git, .env, exports, test/browser artifacts in .dockerignore. Run app processes as node user where practical; use exec-form CMD or entrypoint exec so SIGTERM reaches Node. init: true reaps children. stop_grace_period ~30s permits BullMQ worker.close() to finish current safe work and close Queue, Redis and PostgreSQL handles; API drains connections and ends SSE. A shutdown while external request is uncertain must retain ambiguity in PostgreSQL, not retry blindly.

Default compose up --build starts mock provider and development-only demo identity; production config validation rejects demo auth. Web API proxy preserves same-origin cookie/SSE behavior and avoids embedding internal DNS into browser assets. Only public VITE variables may enter the browser bundle; API keys are server-side. CORS is explicit if developer accesses API directly.

Plain compose up is the normal path. Compose Watch is optional and requires 2.22+ according to official docs; exclude node_modules because compiled dependencies are host/architecture-specific. If not implemented, do not advertise watch.

## Proposed commands, to be verified by lead

```bash
cp .env.example .env
docker compose up --build
docker compose ps
docker compose logs -f api worker web
docker compose run --rm migrate
docker compose exec api node dist/apps/api/main.js # illustrative only; actual script must be documented
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run test:integration
npm run test:e2e
docker compose restart worker
docker compose down
```

These are recommendations, not recorded successful app checks. Final runbook must replace illustrative shell command with actual workspace scripts. Do not use down -v as normal shutdown. Explicit reset should state it destroys local data. On unhealthy DB inspect postgres logs/credentials/volume path; on unhealthy API check migration exit and DB/Redis DNS; on stalled jobs inspect worker readiness, outbox attempts and persisted failures, not just Redis queue count. Check service ports for host collisions; service DNS remains constant when host ports change.

## Sources

All accessed 2026-10-24:

- Docker Docs, Control startup and shutdown order in Compose: https://docs.docker.com/compose/how-tos/startup-order/ — service_healthy/service_completed_successfully; dependency restart:true applies to explicit Compose operations, not an all-purpose outage recovery guarantee.
- Docker Docs, Define services in Docker Compose: https://docs.docker.com/reference/compose-file/services/ — healthcheck, init, stop_signal, stop_grace_period, environment, restart.
- Docker Docs, Environment variables precedence in Docker Compose: https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/ — CLI/environment/env_file/image precedence; .env interpolation does not automatically expose all variables in containers.
- Docker Docs, Define and manage volumes: https://docs.docker.com/reference/compose-file/volumes/ — named durable volumes.
- Docker Docs, Use Compose Watch: https://docs.docker.com/compose/how-tos/file-watch/ — minimum2.22, relative paths, ignore native node_modules.
- Docker Official Node Image README: https://raw.githubusercontent.com/nodejs/docker-node/main/README.md — image variants and node user; Debian slim avoids Alpine musl issues with native packages.
- Docker Hub official tag metadata: https://hub.docker.com/v2/repositories/library/node/tags/24-bookworm-slim , https://hub.docker.com/v2/repositories/library/postgres/tags/17-bookworm , https://hub.docker.com/v2/repositories/library/redis/tags/7.4-bookworm — tag digests/architectures above.
- Redis Persistence: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ — site HTTP403; authoritative Redis7.4 configuration source fallback https://raw.githubusercontent.com/redis/redis/7.4/redis.conf .

Acceptance: clean database migrates; all five processes healthy; full simulation/report path needs no credentials; worker restart restores work without duplicate attempts; PostgreSQL/Redis restart restores readiness; normal down preserves database. Lead must record exact smoke command results.
