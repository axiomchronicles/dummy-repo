# Outreach Intern

A mock-first campaign operations workspace: React/Vite + Tailwind/shadcn web, NestJS API, independent BullMQ worker, PostgreSQL/Drizzle and Redis. The complete local demo needs no cloud account, paid API key or real call. PostgreSQL owns campaigns, outcomes, durable jobs/events and private reports. Local planning is deterministic and explicitly labeled.

## Run locally

Prerequisites: Docker Engine/Desktop with Compose2.24+; tested on Docker 29.5.3 / Compose 5.1.4, Linux arm64 containers. Images also support amd64. Optional host development/test tooling: Node 24.13+ LTS and npm; lockfile included.

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f api worker web
```

Open http://localhost:5173. Click **Enter demo workspace**; a new demo email creates an isolated workspace with five editable persona versions. Demo authentication fails startup in production configuration. Backing ports default 5442(PostgreSQL) and 6389(Redis), because common5432/6379 were already used locally; change POSTGRES_PORT/REDIS_PORT and corresponding host URLs in.env if needed. API http://localhost:3000; worker health http://localhost:3001. Containers use service DNS.

Compose runs a one-shot versioned migration and idempotent persona seed before API/worker readiness. No schema push or destructive startup reset. Normal shutdown preserves data:

```bash
docker compose down
```

## Demonstrate the workflow

1. Open Contacts and use the synthetic CSV sample, or upload CSV/XLSX. Map exact header names and specify a region for national phone formats. See duplicate, invalid, consent and suppression reasons. Correct blocking rows through the row dialog; revalidation is persisted. Synthetic samples use fictional555-01xx destinations.
2. Create a campaign through objective, contacts, persona, policy and review. **Save and build plan** records a strictly validated deterministic local plan; it creates no attempt.
3. Review eligible/excluded counts, timezone/window, concurrency and configured budget. **Run simulation**, then **Confirm simulation**, starts actual BullMQ jobs through the transactional outbox. Mock outcomes are explicitly synthetic; all four terminal outcomes are available.
4. Watch persisted progress/events; refresh to replay history/cursors. Open a call inspector for actual stored analysis/transcript; unavailable answers remain Unknown.
5. Generate CSV and XLSX asynchronously and download from Reports. Downloads are tenant-authorized; export rows match persisted outcomes. Formula-like values are protected as spreadsheet text without altering canonical data.
6. Restart worker/API to observe safe recovery; see the verification runbook for automated restart acceptance. Planning/default startup/seed/tests invoke no real voice provider.

Campaign pause/cancel stops pending dispatches. Already claimed/active calls may finish; no unsupported telephony termination is promised. Reimport never clears durable opt-out. Reports wait for active attempts to finish, including cancelled campaigns.

The operations pages also include agent version editing/sandbox, workspace activity, audit history, integrations and settings.

## Developer commands

```bash
npm ci
npm run db:setup
npm run dev:api
npm run dev:worker
npm run dev:web
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run test:compose-smoke
npm audit
```

Run host dev processes instead of the corresponding Compose app process to avoid port collisions; keep Compose postgres/redis running. Host scripts load .env automatically. Integration/E2E tests require the compiled Compose stack; recovery tests intentionally restart this project's services and briefly interrupt browser use. See [verification](docs/runbooks/verification.md) for exact results and test boundaries.

```bash
docker compose run --rm migrate
npm run db:generate
docker compose exec postgres psql -U outreach -d outreach
docker compose exec redis redis-cli ping
docker compose restart worker
```

Migration generation changes reviewed SQL under packages/database/migrations. It is a development operation; runtime images contain compiled serving/migration scripts and pruned production dependencies. One shared multi-stage image serves API/worker/web; no host node_modules mount. Development target supports host-independent tooling. Default credentials are local-only, not production secrets.

## Mock versus Sarvam

VOICE_PROVIDER=mock and LIVE_CALLS_ENABLED=false are defaults. Simulation always selects the local mock, even if Sarvam is configured. Live additionally requires complete SARVAM_* configuration, an acknowledged HTTPS high-entropy webhook bearer route, an authorized destination allowlist, consent, policy and deliberate launch confirmation. No real call was made during implementation.

Sarvam uses verified instant outbound API v1. Acceptance returns attempt_id; terminal webhook establishes outcome. Uncertain initiation is never redialed automatically. Sarvam's inspected documentation does not specify webhook signatures or instant-call cancellation. Live uses the server-configured committed Sarvam app/version; local persona prompt edits require a matching provider deployment. Cost caps bound configured reservations; actual provider duration/telephony/GST can differ from estimates. See [voice contract](docs/architecture/voice-provider-contract.md) and [environment reference](docs/runbooks/environment.md).

## Repository map

- apps/web: responsive operations routes; Query/RHF/Zod, accessible dialogs, persisted progress.
- apps/api: sessions/tenant guards, plans/actions/imports/reports, webhook inbox, OpenAPI and SSE.
- apps/worker: import/dispatch/reconciliation/analysis/report queues, outbox/recovery/retention and health.
- packages/contracts, config, database, voice-provider: shared schemas/config, relational migrations, mock/Sarvam transport.
- tests/integration, e2e: actual database/queues/API/browser and restart acceptance.
- docs: requirements inventory, audited official research/source register, architecture/ADRs, API and runbooks.

[Architecture](docs/architecture/architecture.md) · [Requirements/evidence](docs/requirements/requirements-matrix.md) · [API contracts](docs/architecture/api-contracts.md) · [Queue recovery](docs/architecture/queue-and-recovery.md) · [Source register](docs/research/source-register.md).

## Limits and troubleshooting

This complete development slice has no production identity-provider integration, automated Sarvam Analytics polling, recordings, provider cancellation, email or hosted analytics. No missing provider capability is invented. Source/transcript/report retention and deletion are described in [data lifecycle](docs/runbooks/data-lifecycle.md). Offset list cursors use deterministic sorting; event IDs support strict cursor replay. XLSX is bounded in memory, CSV parsed incrementally; both enforce upload/row/column/cell limits.

If API/worker unhealthy, inspect Compose migration exit and backing-service connectivity; readiness checks actual database/schema and Redis. Port collisions can be changed in.env; do not stop unrelated containers. Reports/import failures have persisted safe reason codes. Live startup with incomplete configuration fails safely. Rebuilding applies code updates; no Compose Watch is advertised. See [local runbook](docs/runbooks/local-development.md).

## Verified delivery

Current checks: 65 unit tests, 28 integration tests and 3 Playwright cases passed; formatting, lint, typecheck, build and clean Compose smoke passed; npm audit reports0 vulnerabilities. Five services are healthy. API restart with an open event stream completes through normal SIGTERM and preserves outcomes/replay. See the verification runbook for commands, failure fixes, artifact paths and scope. No real call, commit, push or deployment was performed.

## Monochrome shadcn and TypeScript SDK update

The operations UI now uses actual official shadcn components and Tailwind4 neutral tokens: black/white surfaces, compact navigation, open tables and lists, horizontal persona rows, accessible Dialog/Sheet and restrained separators. Public shadcn, Geist and Linear references are audited in docs/research/ui-reference-audit.md; component provenance is stored under apps/web/src/components/shadcn/provenance.json.

The official sarvamai1.1.12 SDK is used for optional configured LIVE plan content and connected LIVE call summaries. Configure MODEL_PROVIDER=sarvam with a separate SARVAM_MODEL_API_KEY; MODEL_PROVIDER=local is the default. Simulation always stays local. The SDK currently lacks instant outbound phone methods, so dialing retains the verified Voice Agents REST contract. SDK scope and exact methods are documented in docs/research/sarvam-typescript-sdk.md.

Current SDK/theme acceptance: 96 automated cases passed (65 unit, 28 integration, 3 Chromium). The full browser flow verifies real persisted state, row-correction refresh, explicit simulation, SSE replay, call inspection, CSV/XLSX downloads and accessible shadcn Dialog/Sheet controls. Actual UI previews are black/white open sections and rows. No paid model or real voice call was made.
