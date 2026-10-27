# Runtime, Development Stack, and Current Testability Audit

**Document Reference:** `docs/flutter-ui/backend-audit/dev-and-testing.md`  
**Audit Date:** 2026-10-26  
**Auditor:** Agent E (Runtime, Development Stack, and Current Testability)  
**Target Codebase:** CallingAgents (`outreach-intern`)  
**Context:** Preparation for Flutter Multiplatform UI (macOS Desktop, iOS Simulator, Android Emulator, Physical Mobile LAN)

---

## 1. Executive Summary

This audit evaluates the local runtime architecture, service orchestration, network topology, and testing harness of the `outreach-intern` backend. The primary objective is to verify operational readiness and establish exact integration boundaries for building, testing, and verifying the upcoming Flutter client application across macOS desktop, iOS simulator, Android emulator, and physical mobile targets.

### Key Audit Findings

1. **Strict Loopback Binding (`127.0.0.1`):**  
   Every host port published by Docker Compose (`compose.yaml:31,51,68,89,113`) binds strictly to `127.0.0.1`. While macOS desktop and iOS simulator can reach `http://localhost:3000` directly and Android emulator can reach `http://10.0.2.2:3000` via loopback routing, **physical devices connected to the host via LAN Wi-Fi will be refused connection** unless host port bindings are broadened to `0.0.0.0`, port-forwarded over USB via `adb reverse`, or served via host process mode (`npm run dev:api`).
2. **Robust Multi-Stage Docker & Health Checking:**  
   Docker Compose orchestrates 6 container services (`postgres`, `redis`, `migrate`, `api`, `worker`, `web`) with pinned image digests, custom healthchecks, inter-service dependency gating, and named volume persistence (`postgres-data`, `redis-data`).
3. **Flexible Dual Development Modes:**  
   Developers can run either fully containerized Docker execution mode (`docker compose up --build -d`) or hybrid host-process mode (`npm run dev:api`, `npm run dev:worker`) backed by containerized PostgreSQL and Redis. Backing port defaults (PostgreSQL on host `5442`, Redis on host `6389`) avoid conflicts with standard local databases.
4. **Authoritative Automated Test Suite (96 Tests + Composed Smoke):**  
   The codebase contains **65 passing unit tests** across 7 test files (`vitest run --config vitest.config.ts`), **28 passing integration tests** across 5 test files (`vitest run --config vitest.integration.config.ts`), and **3 passing Playwright browser E2E tests** (`playwright.config.ts`), supplemented by a standalone isolated Compose smoke acceptance script (`scripts/compose-smoke.ts`).
5. **Completely Deterministic Mock Voice & Local Planning:**  
   The default voice provider (`MockVoiceProvider`) deterministically computes terminal outcomes (`connected`, `no_answer`, `busy`, `failed`) using a SHA-256 hash modulo 4 without network transport. Standard synthetic fixtures guarantee reproducible testing of all 4 outcome paths, structured analyses, transcripts, SSE streams, and Excel/CSV report exports.

---

## 2. Docker Compose Services & Infrastructure

The container stack is configured in `compose.yaml` (lines 1–130) under project name `outreach-intern` (`compose.yaml:1`).

### 2.1 Service Configuration Matrix

| Service Name | Base Image / Build Target | Host Port Binding | Container Port | Volume Mount / Storage | Healthcheck Configuration | Restart Policy & Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`postgres`** | `postgres:17-bookworm@sha256:858bb5...` (`compose.yaml:26`) | `127.0.0.1:${POSTGRES_PORT:-5442}:5432` (`compose.yaml:31`) | `5432` | `postgres-data:/var/lib/postgresql/data` (`compose.yaml:32`) | `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` (`compose.yaml:34-37`) Interval: 3s, Timeout: 3s, Retries: 20 | `restart: unless-stopped` |
| **`redis`** | `redis:7.4-bookworm@sha256:44960b...` (`compose.yaml:40`) | `127.0.0.1:${REDIS_PORT:-6389}:6379` (`compose.yaml:51`) | `6379` | `redis-data:/data` (`compose.yaml:52`) Command: `--appendonly yes --appendfsync everysec --maxmemory-policy noeviction` (`compose.yaml:43-50`) | `redis-cli ping` (`compose.yaml:54-57`) Interval: 3s, Timeout: 3s, Retries: 20 | `restart: unless-stopped` |
| **`migrate`** | `outreach-intern-local` (Target: `runtime`, `compose.yaml:6,60`) | *None* | *None* | Ephemeral container | *None* (exits on completion) Command: `node dist/migrate.cjs && node dist/seed.cjs` (`compose.yaml:61`) | `restart: 'no'` (`compose.yaml:64`) Depends on: `postgres: { condition: service_healthy }` |
| **`api`** | `outreach-intern-local` (Target: `runtime`, `compose.yaml:6,66`) | `127.0.0.1:${API_PORT:-3000}:3000` (`compose.yaml:68`) | `3000` | Code bundled in image (`dist/api.cjs`) | Node HTTP GET to `http://127.0.0.1:3000/health/ready` (`compose.yaml:74-84`) Interval: 5s, Timeout: 3s, Retries: 12, Start Period: 10s | `restart: unless-stopped` Depends on: `postgres: healthy`, `redis: healthy`, `migrate: completed_successfully` |
| **`worker`** | `outreach-intern-local` (Target: `runtime`, `compose.yaml:6,87`) | `127.0.0.1:${WORKER_PORT:-3001}:3001` (`compose.yaml:89`) | `3001` | Code bundled in image (`dist/worker.cjs`) | Node HTTP GET to `http://127.0.0.1:3001/health/ready` (`compose.yaml:95-105`) Interval: 5s, Timeout: 3s, Retries: 12, Start Period: 10s | `restart: unless-stopped` Depends on: `postgres: healthy`, `redis: healthy`, `migrate: completed_successfully` |
| **`web`** | `outreach-intern-local` (Target: `runtime`, `compose.yaml:6,108`) | `127.0.0.1:${WEB_PORT:-5173}:5173` (`compose.yaml:113`) | `5173` | Built assets in `apps/web/dist` (`compose.yaml:109`) | Node HTTP GET to `http://127.0.0.1:5173/` (`compose.yaml:117-126`) Interval: 5s, Timeout: 3s, Retries: 12 | `restart: unless-stopped` Depends on: `api: { condition: service_healthy }` |

### 2.2 Shared Application Container Anchor (`&app` and `&environment`)

The services `migrate`, `api`, `worker`, and `web` inherit common definitions via YAML anchors (`compose.yaml:2-23`):
- **Image:** `outreach-intern-local` built from `./Dockerfile` target `runtime` (`compose.yaml:3-6`).
- **Process Init:** `init: true` (`compose.yaml:21`), providing PID 1 reaping for clean signal propagation.
- **Grace Period:** `stop_grace_period: 30s` (`compose.yaml:22`), allowing in-flight worker jobs and active SSE connections to close cleanly.
- **Internal Service DNS:**
  - `DATABASE_URL: postgresql://${POSTGRES_USER:-outreach}:${POSTGRES_PASSWORD:-outreach}@postgres:5432/${POSTGRES_DB:-outreach}` (`compose.yaml:15`)
  - `REDIS_URL: redis://redis:6379` (`compose.yaml:16`)
  - `PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-http://localhost:5173}` (`compose.yaml:20`)
  - `API_INTERNAL_URL: http://api:3000` (in `web` service, `compose.yaml:112`)

### 2.3 Volume Persistence & Safety

- **Named Volumes:** `postgres-data` and `redis-data` (`compose.yaml:128-130`).
- **Persistence Guarantees:** Named volumes persist across `docker compose stop`, `docker compose restart`, and normal `docker compose down` (`docs/runbooks/local-development.md:14-15`).
- **Destructive Commands:** Volume data is removed **only** if the developer explicitly specifies `--volumes` (`docker compose down -v`) or manually deletes volumes (`docker volume rm`).
- **Startup Migration Isolation:** `migrate` executes `node dist/migrate.cjs && node dist/seed.cjs` (`compose.yaml:61`). Database schema migrations run under an advisory lock (`packages/database/src/migrate.ts`) to prevent race conditions. Serving processes (`api`, `worker`) never execute migrations or alter tables dynamically at startup (`docs/runbooks/local-development.md:14`).

---

## 3. Local Host Process Dev Mode vs. Docker Container Execution Mode

Developers can run the stack in two distinct modes depending on development velocity and debugging requirements.

```
                          ┌────────────────────────────────────────────────────────┐
                          │                   DOCKER ENGINE                        │
                          │                                                        │
                          │  ┌──────────────┐             ┌─────────────┐          │
                          │  │  PostgreSQL  │             │    Redis    │          │
                          │  │  (Port 5432) │             │ (Port 6379) │          │
                          │  └──────┬───────┘             └──────┬──────┘          │
                          └─────────┼────────────────────────────┼─────────────────┘
                                    │ Published                  │ Published
                                    │ 127.0.0.1:5442             │ 127.0.0.1:6389
                                    ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             LOCAL HOST WORKSTATION                               │
│                                                                                  │
│  ┌─────────────────────────┐ ┌───────────────────────────┐ ┌──────────────────┐  │
│  │ npm run dev:api         │ │ npm run dev:worker        │ │ Flutter Client   │  │
│  │ (Node tsx --watch)      │ │ (Node tsx --watch)        │ │ (macOS Desktop)  │  │
│  │ Listens on 0.0.0.0:3000 │ │ Listens on 0.0.0.0:3001   │ │ Connects to      │  │
│  │ (apps/api/src/main.ts)  │ │ (apps/worker/src/main.ts) │ │ localhost:3000   │  │
│  └─────────────────────────┘ └───────────────────────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Comparison Table

| Attribute | Docker Container Execution Mode | Host Process Development Mode (Hybrid) |
| :--- | :--- | :--- |
| **Trigger Command** | `docker compose up --build -d` (`docs/runbooks/local-development.md:9`) | `docker compose up -d postgres redis`<br>`npm run dev:api`<br>`npm run dev:worker` |
| **API Process** | Docker container `api` running pre-bundled `dist/api.cjs` (`compose.yaml:67`) | Host process via `node --import tsx --watch apps/api/src/main.ts` (`package.json:14`) |
| **Worker Process** | Docker container `worker` running pre-bundled `dist/worker.cjs` (`compose.yaml:88`) | Host process via `node --import tsx --watch apps/worker/src/main.ts` (`package.json:15`) |
| **Code Changes** | Requires rebuilding the bundle (`npm run build`) and recreating containers (`docker compose up -d --build`) | Instant hot-reloading on TypeScript file save via `tsx --watch` |
| **PostgreSQL Connection** | `postgresql://outreach:outreach@postgres:5432/outreach` (`compose.yaml:15`) | `postgresql://outreach:outreach@localhost:5442/outreach` (`.env.example:9`) |
| **Redis Connection** | `redis://redis:6379` (`compose.yaml:16`) | `redis://localhost:6389` (`.env.example:10`) |
| **Listening Address** | Container binds `0.0.0.0:3000`; Docker publishes to host `127.0.0.1:3000` (`compose.yaml:68`) | Host process binds directly to `0.0.0.0:3000` (`apps/api/src/main.ts:136`) |
| **Source of Env Vars** | `compose.yaml` defaults + optional `.env` file | `.env` loaded via Node's `--env-file-if-exists=.env` (`package.json:14-16`) |
| **Debugging / Tracing** | Requires `docker logs -f api` or container attachment | Direct Node inspector/debugger attachment, terminal `stdout`/`stderr` |

### 3.2 Port Collision Prevention Rules

As documented in `docs/runbooks/local-development.md` (lines 35–36):
> *"Run host API/worker/web processes after stopping the corresponding Compose app to avoid port collisions; backing services can remain running."*

If the Docker `api` container is running and a developer executes `npm run dev:api`, the host process will crash with `EADDRINUSE: address already in use :::3000`. To switch to host process mode:
```bash
docker compose stop api worker web
npm run dev:api
# in separate terminal:
npm run dev:worker
```

---

## 4. Network Endpoints & Topology for Flutter Targets

When testing or running the Flutter application across different device profiles, network address resolution differs significantly due to emulator virtualization and OS sandboxing.

### 4.1 Target Platform Routing Matrix

| Flutter Target Platform | Target Identifier | API Base URL | Worker Health URL | Network Path & Mechanism | Considerations & Prerequisites |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **macOS Desktop** | `macos` | `http://localhost:3000` or `http://127.0.0.1:3000` | `http://localhost:3001` | Native host process loopback connection. | Direct connectivity in both Docker and host process modes. No proxy or tunneling required. |
| **iOS Simulator** | `ios` | `http://localhost:3000` or `http://127.0.0.1:3000` | `http://localhost:3001` | iOS Simulator shares the macOS host network namespace directly. | Works immediately with Docker's `127.0.0.1:3000` port mapping. Cleartext HTTP to localhost is allowed by iOS ATS by default. |
| **Android Emulator** | `android` | `http://10.0.2.2:3000` | `http://10.0.2.2:3001` | QEMU virtual router alias: `10.0.2.2` inside the guest VM routes directly to the host's `127.0.0.1`. | **1.** `localhost` inside Android refers to the emulator itself, not the host.<br>**2.** Android 9+ (API 28+) blocks cleartext HTTP by default. Must configure `android:usesCleartextTraffic="true"` in `AndroidManifest.xml`. |
| **Physical LAN Device (Wi-Fi)** | `android` / `ios` | `http://<HOST_LAN_IP>:3000` (e.g. `http://192.168.1.150:3000`) | `http://<HOST_LAN_IP>:3001` | Device routes over local Wi-Fi router to host's physical network adapter. | **BLOCKED BY DEFAULT IN DOCKER MODE:** `compose.yaml:68` binds strictly to `127.0.0.1:3000`. See Section 4.2 for required adjustments. |
| **Physical Android via USB** | `android` | `http://localhost:3000` | `http://localhost:3001` | Port-forwarded over USB cable using ADB reverse tunnel. | Run `adb reverse tcp:3000 tcp:3000` on the host. Forwarded requests hit host `127.0.0.1:3000` directly. |

### 4.2 The Loopback Binding Constraint & Solutions for Physical Devices

In `compose.yaml` line 68:
```yaml
ports: ['127.0.0.1:${API_PORT:-3000}:3000']
```
This loopback specification is a security feature ensuring local services are not exposed to the local network or public internet by default (`docs/runbooks/local-development.md:24`). However, this prevents physical phones on the same Wi-Fi network from reaching `http://<HOST_LAN_IP>:3000`.

To enable physical device testing over LAN, developers have four valid architectural options:

1. **Option A (Host Dev Mode - Easiest):**  
   Run `docker compose up -d postgres redis` and start the API via `npm run dev:api`. The API process explicitly listens on `0.0.0.0` (`apps/api/src/main.ts:136: await app.listen(config.API_PORT, '0.0.0.0')`), making it reachable on the host's LAN IP.
2. **Option B (USB Reverse Tunnel for Android):**  
   Connect the physical Android device via USB with USB Debugging enabled, and execute:
   ```bash
   adb reverse tcp:3000 tcp:3000
   ```
   The Flutter app on the device connects to `http://localhost:3000`, which ADB forwards over USB to host loopback `127.0.0.1:3000`.
3. **Option C (Compose Local Override):**  
   Create a `compose.override.yaml` (or update `compose.yaml` port binding) to expose the API to all host network interfaces:
   ```yaml
   services:
     api:
       ports:
         - '0.0.0.0:${API_PORT:-3000}:3000'
   ```
4. **Option D (Reverse Proxy / Tunnel):**  
   Run a lightweight reverse proxy or tunnel tool (e.g., Caddy, NGINX, or ngrok/Cloudflare Tunnel) that accepts external LAN requests and forwards them to `127.0.0.1:3000`.

### 4.3 Client Request Constraints: Cookies, Origins & Rate Limits

The Flutter client HTTP layer must respect three specific backend constraints:

1. **Cookie-Based Session Authentication (`outreach_session`):**  
   The demo sign-in endpoint (`POST /api/v1/auth/demo`, `apps/api/src/controllers.ts:26-30`) creates a user and workspace, issuing a session cookie via Express:
   ```typescript
   // apps/api/src/auth.ts:129-135
   res.cookie('outreach_session', token, {
     httpOnly: true,
     sameSite: 'strict',
     secure: false,
     maxAge: config.SESSION_TTL_HOURS * 3600000,
     path: '/',
   });
   ```
   The backend extracts authentication strictly from the `Cookie` header (`apps/api/src/auth.ts:25-31`). It **does not** accept `Authorization: Bearer <token>`.  
   *Requirement for Flutter:* The Flutter HTTP client (e.g., `dio` with `dio_cookie_manager` or a custom `http.Client`) must capture the `Set-Cookie` header on sign-in and attach `Cookie: outreach_session=<token>` to all subsequent requests.
2. **Origin Verification (`verifyOrigin`):**  
   In `apps/api/src/auth.ts` lines 35–50, the backend checks request origins for mutating verbs (`POST`, `PATCH`, `DELETE`):
   ```typescript
   // apps/api/src/auth.ts:37-46
   const origin = req.get('Origin');
   const allowed = (config.ALLOWED_ORIGINS || config.PUBLIC_BASE_URL)
     .split(',')
     .map((value) => value.trim());
   if (origin && !allowed.includes(origin))
     throw new DomainError('ORIGIN_REJECTED', 'Request origin is not allowed', 403);
   ```
   *Requirement for Flutter:* Native Flutter HTTP clients on macOS, iOS, and Android do not send a browser `Origin` header by default. Omitting the `Origin` header passes validation. If custom interceptors set an `Origin` header, its value must be registered in the backend's `ALLOWED_ORIGINS` environment variable (`.env.example:5`).
3. **In-Memory Rate Limiting:**  
   In `apps/api/src/main.ts` lines 106–132, the API enforces an in-memory sliding window rate limiter:
   - `/api/v1/auth/*`: Maximum **30 requests per minute** per client IP.
   - `/api/v1/webhooks/*`: Maximum **200 requests per minute** per client IP.
   *Requirement for Flutter:* Authentication retries or rapid automated test loops must respect this 30 req/min budget or throttle sign-in attempts.

---

## 5. Comprehensive Testability Inventory

The CallingAgents backend has a rigorous, multi-tiered test infrastructure. All test boundaries are cleanly defined, and zero paid network or telephony calls occur during any automated test run (`docs/runbooks/verification.md:14-16, 35`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CALLINGAGENTS TEST SUITE                        │
│                                                                        │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────┐  │
│  │      Unit Tests       │ │   Integration Tests   │ │  E2E Tests   │  │
│  │   65 tests / 7 files  │ │   28 tests / 5 files  │ │ 3 tests Play │  │
│  │ (vitest.config.ts)    │ │(vitest.integration)   │ │ (playwright) │  │
│  └───────────────────────┘ └───────────────────────┘ └──────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │           Compose Smoke Acceptance (compose-smoke.ts)            │  │
│  │    Isolated Stack (Ports 3004/3005/5174/5443/6390) + Teardown    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Unit Tests (65 Tests Across 7 Files)

Executed via `npm test` (`vitest run --config vitest.config.ts`). Test execution completes in ~700ms with zero network or database dependencies.

| Test File | Test Count | Module / Scope | Key Invariants Verified |
| :--- | :--- | :--- | :--- |
| [`packages/config/src/config.test.ts`](file:///Users/kuroyami/CallingAgents/packages/config/src/config.test.ts) | 5 | Environment validation | Validates safe local defaults (`VOICE_PROVIDER=mock`, `LIVE_CALLS_ENABLED=false`); verifies port range constraints; rejects `DEV_AUTH=true` in production mode; enforces required live telephony parameters when Sarvam is enabled. |
| [`packages/contracts/src/contracts.test.ts`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/contracts.test.ts) | 18 | Zod schema contracts | Strict E.164 phone formatting; campaign dispatch policy parsing; `NormalizedCallEventSchema` contract; agent persona schema; Sarvam outbound request and webhook payload schemas. |
| [`packages/voice-provider/src/provider.test.ts`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/provider.test.ts) | 11 | Voice provider boundaries | Tests all 4 mock outcomes (`connected`, `no_answer`, `busy`, `failed`) with `globalThis.fetch` mocked to throw (proving zero network transport); verifies Sarvam HTTP request formation; verifies rejection of unallowlisted live destinations; verifies callback normalization and private vendor data redaction. |
| [`apps/api/src/planning.test.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/planning.test.ts) | 5 | Deterministic local planner | Validates that campaign planning computes eligible contact counts and cost estimates without creating any call attempts; verifies currency conversion (rupees to minor units); ensures unconfirmed launches are rejected. |
| [`packages/voice-provider/src/models.test.ts`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.test.ts) | 15 | AI Model SDK & Fallbacks | Tests `CampaignContentPlanner` and `ModelSummaryService`; verifies simulation always stays 100% local/free; exercises official `sarvamai` 1.1.12 SDK with mocked fetch; tests JSON schema adherence, timeout handling, and refusal of prompt injections. |
| [`apps/api/src/openapi.test.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.test.ts) | 2 | OpenAPI 3.1 specification | Verifies that generated OpenAPI specification matches shared Zod contracts, binary and SSE media types, and includes all controllers. |
| [`apps/worker/src/worker.test.ts`](file:///Users/kuroyami/CallingAgents/apps/worker/src/worker.test.ts) | 9 | BullMQ queue contracts | Job payload schema parsing for `imports`, `dispatch`, `reconciliation`, `analysis`, and `reports`; retry limits; unrecoverable error classification. |

### 5.2 Integration Tests (28 Tests Across 5 Files)

Executed via `npm run test:integration` (`vitest run --config vitest.integration.config.ts`). Requires running PostgreSQL and Redis backing services. Runs sequentially (`fileParallelism: false`, `vitest.integration.config.ts:7`) to avoid state collisions.

| Test File | Test Count | Test Focus & Scenarios | Source Evidence |
| :--- | :--- | :--- | :--- |
| [`tests/integration/database.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/database.test.ts) | 1 | Clean Migration & Relational Integrity | Creates a dynamic isolated PostgreSQL database (`outreach_migration_test_<uuid>`), runs all 5 migrations twice to verify idempotency, confirms all 22 tables exist, and verifies foreign key cascading, unique phone constraints (`23505`), and check constraints (`23514`). Drops temporary database on cleanup. |
| [`tests/integration/recovery.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/recovery.test.ts) | 8 | Worker Resiliency & Data Recovery | **1.** Campaign pause/resume/cancel lifecycles.<br>**2.** Worker SIGKILL recovery: verifies that killing a worker mid-flight preserves durable attempt IDs without duplicate dials.<br>**3.** Dual worker concurrency: verifies 2 concurrent worker processes respect database concurrency limits.<br>**4.** Backing service outage: stops Redis and PostgreSQL, verifies API health readiness drops to 503, restarts backing services, and confirms outbox intent replays completely.<br>**5.** Billing pulse calculations for fractional live duration.<br>**6.** Unknown live cost reservation safety.<br>**7.** PII retention expiration: verifies source bytes and contact phones purge after 30 days.<br>**8.** Report artifact expiration and redial-free regeneration. |
| [`tests/integration/api-restart.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/api-restart.test.ts) | 1 | SSE Resiliency Across Restart | Starts an active SSE stream (`GET /api/v1/campaigns/:id/stream?after=0`), triggers Docker Compose API restart (`docker compose restart api`), confirms graceful stream closure (SIGTERM exit 143), and verifies client can reconnect and replay all events using persisted cursors. |
| [`tests/integration/workflow.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/workflow.test.ts) | 9 | Full End-to-End Workflow | Complete lifecycle: demo auth, starter personas, CSV import, plan without dialing, duplicate launch idempotency, all 4 mock outcomes (`connected`, `no_answer`, `busy`, `failed`), SSE event streaming, tenant isolation between workspaces, opt-out suppression, transactional outbox rollback, and XLSX report generation. |
| [`tests/integration/api-security.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/api-security.test.ts) | 9 | API Contracts, RBAC & Security | Validates that every NestJS controller route matches the published OpenAPI 3.1 specification; tests persona version immutability; verifies workspace RBAC (Owner vs Member vs Viewer); tests strict parameter rejection (stripping unknown fields); verifies Sarvam webhook token validation and denial of forged callbacks; verifies audit log immutability. |

### 5.3 Browser End-to-End Tests (3 Tests in Playwright)

Configured in `playwright.config.ts` (lines 1–14) and implemented in `tests/e2e/workflow.spec.ts` (lines 1–549). Executed via `npm run test:e2e`.

1. **Full Composed Workflow (`workflow.spec.ts:26-408`):**  
   Executes sign-in via demo workspace, persona editing (creates version 2), synthetic CSV import, campaign configuration, deterministic plan inspection (asserts 0 attempts before confirmation), simulation execution, SSE event streaming and cursor tracking in session storage, structured call inspection (verifying transcript turns and extracted fields), CSV and XLSX report download verification (validating binary workbook structure via ExcelJS), and unconfigured LIVE review dialog verification without launching live calls.
2. **Mobile Viewport & Keyboard Accessibility (`workflow.spec.ts:410-494`):**  
   Simulates mobile viewport (390×844) with `reducedMotion: reduce`. Tests accessible sheet navigation, focus trapping (`Tab` and `Shift+Tab`), `Escape` key restoration, and verifies zero horizontal scrolling overflow (`scrollWidth <= innerWidth`).
3. **XLSX Column Mapping & Row Validation (`workflow.spec.ts:496-549`):**  
   Generates an in-memory XLSX workbook using ExcelJS, tests custom column mapping (`Full name`, `Phone`, `Permission`, `Result`), uploads the binary spreadsheet, and verifies backend ingestion and phone normalization.

### 5.4 Standalone Acceptance Smoke Script (`scripts/compose-smoke.ts`)

Executed via `npm run test:compose-smoke` (`package.json:34`). This script provides production acceptance verification:
- Spawns a completely isolated Compose project: `outreach-smoke-<uuid>` (`scripts/compose-smoke.ts:8`).
- Uses dedicated, non-colliding host ports:
  - **API:** `3004`
  - **Worker:** `3005`
  - **Web:** `5174`
  - **PostgreSQL:** `5443`
  - **Redis:** `6390`
- Waits for health readiness on all 3 exposed web/API endpoints (`scripts/compose-smoke.ts:46-60`).
- Performs sign-in, verifies 5 seeded personas, imports 4 synthetic contacts, validates that planning generates zero call attempts, executes simulation, verifies all 4 mock attempts complete, generates an XLSX report, and verifies that the downloaded binary exceeds 1000 bytes (`scripts/compose-smoke.ts:61-106`).
- **Clean Teardown:** In its `finally` block (`scripts/compose-smoke.ts:110-119`), stops the temporary Compose project and completely removes only its isolated volumes (`project + '_postgres-data'`, `project + '_redis-data'`), leaving the developer's normal development volumes completely untouched.

---

## 6. Deterministic Fixtures and Mock Voice Provider Behavior

To enable instant, zero-cost, and offline testing of the entire telephony lifecycle, the backend incorporates deterministic mock providers and synthetic dataset fixtures.

### 6.1 Mock Voice Provider Architecture (`MockVoiceProvider`)

Implemented in `packages/voice-provider/src/index.ts` lines 27–71:

```typescript
// packages/voice-provider/src/index.ts:27-70
export class MockVoiceProvider implements VoiceProvider {
  constructor(private readonly latencyMs = 0) {}
  async initiate(request: CallRequest): Promise<InitiationResult> {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const outcomes = ['connected', 'no_answer', 'busy', 'failed'] as const;
    const outcome =
      request.scenario ??
      outcomes[
        createHash('sha256').update(request.localAttemptId).digest()[0]! % 4
      ]!;
    const connected = outcome === 'connected';
    return {
      kind: 'terminal',
      event: NormalizedCallEventSchema.parse({
        provider: 'mock',
        providerAttemptId: `mock-${request.localAttemptId}`,
        localAttemptId: request.localAttemptId,
        outcome,
        durationSeconds: connected ? 42 : null,
        interactionId: connected ? `synthetic-${request.localAttemptId}` : null,
        failureCode: outcome === 'failed' ? 'MOCK_FAILURE' : null,
        extractedFields: connected
          ? {
              interest: 'interested',
              followUpRequested: true,
              preferredTime: null,
            }
          : null,
        transcript: connected
          ? [
              {
                role: 'agent',
                text: 'SIMULATION: This is a synthetic outreach conversation.',
              },
              {
                role: 'user',
                text: 'SIMULATION: I am interested in learning more. Please follow up.',
              },
            ]
          : null,
        simulated: true,
      }),
    };
  }
}
```

#### Deterministic Mechanics:
1. **Explicit Scenario vs. Hash Modulo 4:**  
   If `request.scenario` is provided (`connected`, `no_answer`, `busy`, or `failed`), it is directly used. If omitted, the outcome is deterministically selected by computing the SHA-256 digest of `request.localAttemptId` and taking byte 0 modulo 4. This guarantees identical outcomes across repeated test runs on the same attempt.
2. **Configurable Synthetic Latency:**  
   `latencyMs` defaults to `config.MOCK_LATENCY_MS` (`.env.example:21`, default 150ms), simulating realistic dispatch delays without stalling test execution.
3. **Rich Connected Data:**  
   When `connected`, the provider generates:
   - Fixed call duration: `42` seconds.
   - Deterministic synthetic interaction ID: `synthetic-<localAttemptId>`.
   - Structured extracted entity fields: `{ interest: 'interested', followUpRequested: true, preferredTime: null }`.
   - Realistic 2-turn dialogue transcript labeled with explicit `SIMULATION:` prefixes.
4. **Structured Failure Data:**  
   When `failed`, the provider returns `failureCode: 'MOCK_FAILURE'` with null duration and transcript.
5. **Zero Network Guarantees:**  
   Unit tests (`packages/voice-provider/src/provider.test.ts:26-50`) verify that `MockVoiceProvider` executes entirely within the local process without invoking HTTP fetch or socket transports.

### 6.2 Standard Synthetic Contact Fixture

Defined in `tests/integration/helpers.ts` lines 16–22:

```csv
name,phone,consent,outcome
Alice,+12025550101,true,connected
Benoit,+12025550102,true,no_answer
Carmen,+12025550103,true,busy
Dev,+12025550104,true,failed
```

When imported via `POST /api/v1/imports` with `synthetic: true`:
- The backend parses the custom column `outcome` and stores it in the contact record (`packages/database/src/schema.ts`).
- During campaign simulation dispatch, `processDispatch` in `apps/worker/src/calls.ts` supplies `request.scenario = contact.outcome` to the provider.
- This produces exactly **one connected, one no-answer, one busy, and one failed call attempt**, enabling predictable UI validation across all outcome cards, badges, and filters.

### 6.3 Seeded Starter Personas

Defined in `packages/database/src/personas.ts` lines 4–39 and seeded into every workspace by `packages/database/src/seed.ts`:
1. **Customer Discovery:** Professional, inquisitive persona for market research and qualification.
2. **Appointment Coordinator:** Calendar-focused persona for booking discovery consultations.
3. **Feedback Listener:** Empathetic persona for gathering CSAT scores and user satisfaction feedback.
4. **Event Outreach:** Informative persona for webinar invitations and RSVP confirmations.
5. **Service Follow-up:** Detail-oriented persona for post-ticket support resolution check-ins.

All personas start at `currentVersion: 1`. When edited through the API or Flutter UI, a new immutable record is appended to `agent_versions` while preserving previous version IDs for existing campaign audits.

---

## 7. Execution Readiness for Flutter App Build, Test, and Verification

The environment is in a verified state to support Flutter client development.

### 7.1 Verified Toolchain Readiness

| Tool / Runtime | Installed Version | Location / Path | Verification Status |
| :--- | :--- | :--- | :--- |
| **Flutter SDK** | Flutter 3.44.9 • channel stable (Framework rev `6b182d2c75`, Engine `b9499e4c25`) | `/Users/kuroyami/development/flutter/bin/flutter` | Ready & Verified |
| **Dart SDK** | Dart 3.12.2 (stable) on `macos_arm64` | `/Users/kuroyami/development/flutter/bin/dart` | Ready & Verified |
| **Node.js** | Node 24.13+ compatible | Host system `/usr/local/bin/node` | Ready & Verified |
| **Docker Engine** | Docker 29.5.3 (Desktop context `desktop-linux`) | `/Applications/Docker.app` | Installed; ready to start |
| **Docker Compose** | Compose v5.1.4 supported | `compose.yaml` | Validated |
| **OpenAPI Spec** | OpenAPI 3.1.0 schema generated (735 KB) | `docs/api/openapi.json` | Generated & Verified |

### 7.2 Flutter Architectural Recommendations

1. **Environment-Aware Base URL Configuration:**  
   Configure the Flutter network client with platform-aware base URLs:
   ```dart
   import 'dart:io';
   import 'package:flutter/foundation.dart';

   String get apiBaseUrl {
     if (kIsWeb) return 'http://localhost:3000';
     if (Platform.isAndroid) {
       // Android emulator loops back to host via 10.0.2.2
       return 'http://10.0.2.2:3000';
     }
     // macOS Desktop and iOS Simulator use localhost
     return 'http://127.0.0.1:3000';
   }
   ```
2. **Android Cleartext HTTP Permission:**  
   Because the local backend runs over unencrypted HTTP during development, add `android:usesCleartextTraffic="true"` to `<application>` in `apps/flutter_app/android/app/src/main/AndroidManifest.xml`:
   ```xml
   <application
       android:label="outreach_intern"
       android:name="${applicationName}"
       android:icon="@mipmap/ic_launcher"
       android:usesCleartextTraffic="true">
   ```
3. **Session Cookie Interceptor:**  
   The Flutter HTTP layer must capture the `Set-Cookie` header on `/api/v1/auth/demo` and attach `Cookie: outreach_session=<token>` on every subsequent request.
4. **Server-Sent Events (SSE) Stream Integration:**  
   Campaign progress is streamed over `GET /api/v1/campaigns/:id/stream?after=:cursor` (`apps/api/src/streams.ts`). The Flutter client should implement an SSE consumer that:
   - Emits structured event models (`CampaignEvent`).
   - Automatically reconnects on network disconnects or API container restarts.
   - Passes the highest received `id` as `after` or in the `Last-Event-ID` header to resume event replay without losing state.
5. **Flutter Verification & Test Strategy:**
   - **Unit Tests (`test/`):** Test state management (Bloc/Riverpod/Notifier) using mocked API services.
   - **Widget Tests (`test/widgets/`):** Test individual UI components (e.g., Campaign Status Badge, Persona Card, Call Outcome Inspector).
   - **Integration Tests (`integration_test/`):** Run end-to-end tests against the live local backend (`http://localhost:3000` on macOS or `http://10.0.2.2:3000` on Android emulator) using demo authentication and the synthetic 4-contact fixture to verify campaign planning, simulation dispatch, SSE stream updates, and call inspection.

---

## 8. Verification & Audit Trail

| Verification Step | Command Executed | Result | Reference |
| :--- | :--- | :--- | :--- |
| **Unit Test Suite** | `npm test` | **65 passed** across 7 test files (668ms) | Section 5.1; `vitest.config.ts:1-7` |
| **Typecheck** | `npm run typecheck` | Passed with zero errors | `package.json:17` |
| **Lint** | `npm run lint` | Passed with zero errors | `package.json:18` |
| **OpenAPI Generation** | `npm run docs:api` | Generated `docs/api/openapi.json` | `scripts/generate-openapi.mjs:1-12` |
| **Compose Syntax Check** | `docker compose config` | Validated service definitions, anchors, and healthchecks | `compose.yaml:1-130` |

*End of Audit Report.*
