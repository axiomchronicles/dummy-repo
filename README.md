# Outreach Intern (V3 Rebuild)

A production-minded, observable AI voice outreach platform engineered with a strict trust boundary:
- **Primary Client:** **Flutter Mobile App (`apps/mobile`)** built with Flutter 3, Riverpod 2.6, Sliver widgets, and HugeIcons.
- **Operator Interface:** **Minimal Vite Admin Console (`apps/admin`)** built with React 19, TypeScript, and Tailwind CSS. (No customer-facing web app).
- **Agent Harness:** **Mastra Runtime (`packages/agent-runtime`)** powered by `@mastra/core@1.79.0`, `@mastra/pg@1.32.0`, and `@ai-sdk/openai-compatible@3.0.79` with a zero-cost `DeterministicLocalPlanner` offline default.
- **Telephony & Voice Provider:** Sarvam Voice Agents REST API with a local `MockVoiceProvider` simulation default. Zero paid calls without explicit operator authorization and verified credentials.
- **Durable Infrastructure:** PostgreSQL 17 + Drizzle ORM, Redis 7.4 + BullMQ 5 operational queues, and NestJS 11 API.

---

## 1. Architecture & Security Boundaries

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│  Flutter Mobile App (`apps/mobile`)  │     │   Vite Admin Console (`apps/admin`)  │
│  - Conversational Composer (ChatGPT) │     │   - User Provisioning & MFA Reset    │
│  - Confirmation Bottom Sheet Gate    │     │   - Global Telephony Kill-Switch     │
│  - Call History & Translated Audio   │     │   - BullMQ Queue & Worker Health     │
└──────────────────┬───────────────────┘     └──────────────────┬───────────────────┘
                   │                                            │
                   ▼                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           NestJS 11 API (`apps/api`)                              │
│    - AdminGuard & SessionGuard (RFC 6238 TOTP MFA, Scrypt Passwords, Tokens)      │
│    - ChatService & Conversational Planner Orchestration                           │
│    - OpenAPI 3.1 Contract & SSE Event Replay                                      │
└─────────────┬───────────────────────────┬───────────────────────────┬─────────────┘
              ▼                           ▼                           ▼
┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐
│ PostgreSQL 17 + Drizzle  │ │ Redis 7.4 + BullMQ Queues│ │  Mastra Agent Runtime     │
│ - 28 Relational Tables   │ │ - dispatch, analysis     │ │ - Outreach Planner Agent   │
│ - Transactional Outbox   │ │ - reconciliation, import │ │ - Campaign Supervisor      │
│ - Idempotent Audit Log   │ │ - reports dead-letter    │ │ - Post-Call Analyst Agent  │
└──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘
```

### Trust & Confirmation Boundary
- **Model Proposes; Application Policy Authorizes:** AI agents generate campaign drafts and call plans, but never launch real calls.
- **Mandatory User Confirmation:** Dispatches require explicit operator confirmation via the confirmation drawer displaying recipients, masked numbers, call objectives, language/agent selection, and verified cost bounds.
- **Emergency Telephony Kill-Switch:** Accessible from the Admin Console (`POST /api/v1/admin/kill-switch`). When engaged, all outbound dispatching across all workspaces is halted at the worker barrier with an auditable reason.
- **Admin-Only Account Provisioning:** Self-sign-up is disabled across all mobile and API interfaces. Accounts are provisioned and managed strictly through the Admin Console. Mandatory RFC 6238 TOTP MFA and hashed recovery codes protect every identity.

---

## 2. Quickstart & Local Docker Compose

Prerequisites: Docker Engine/Desktop with Compose v2.24+; Flutter 3.27+; Node.js v24+ or v26+.

### 1. Boot Local Infrastructure
```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

All 7 containers will build and start healthy:
- `outreach-intern-postgres-1` (Port 5442)
- `outreach-intern-redis-1` (Port 6389)
- `outreach-intern-migrate-1` (One-shot migration & seed)
- `outreach-intern-api-1` (Port 3000)
- `outreach-intern-worker-1` (Port 3001)
- `outreach-intern-admin-1` (Port 5173)

### 2. Access Admin Console
Open `http://localhost:5173` in your browser.
Bootstrap master administrator:
```bash
npm run db:setup
node --env-file-if-exists=.env --import tsx scripts/bootstrap-admin.ts
```
Login using the bootstrapped administrator email and password, followed by your TOTP code or generated single-use recovery code.

### 3. Run Flutter Mobile App
```bash
cd apps/mobile
flutter pub get
flutter run -d macos # or -d ios / -d android
```

### 4. Run Development Stack Concurrently on Host
```bash
npm run dev:all
```
Spawns the NestJS API (`apps/api`), BullMQ Worker (`apps/worker`), and Vite Admin Console (`apps/admin`) concurrently with unified process termination and prefixed logging (`[api]`, `[worker]`, `[admin]`). Requires running PostgreSQL and Redis (e.g. via `docker compose up -d postgres redis`).

---

## 3. Verified Test Suite Execution

All test suites execute hermetically against local simulation defaults:

### Unit Tests (Vitest)
```bash
npm test
```
*Output: 9 test files passed, 72/72 tests passed.*

### Integration Tests (Vitest against Compose Services)
```bash
npm run test:integration
```
*Output: 6 test files passed, 30/30 tests passed (`workflow.test.ts`, `recovery.test.ts`, `api-security.test.ts`, `api-restart.test.ts`, `database.test.ts`, `auth-admin.test.ts`).*

### Flutter Mobile Tests
```bash
cd apps/mobile
flutter analyze
flutter test
```
*Output: Flutter analyze clean (0 issues), all widget tests passed.*

### Production Build Verification
```bash
npm run typecheck
npm run build
```
*Output: TypeScript zero errors, ESBuild bundled microservices, Vite compiled admin console in ~100ms.*

---

## 4. Repository Structure

```
├── apps/
│   ├── admin/                # Private Vite + React 19 + TypeScript operator console
│   ├── api/                  # NestJS 11 REST API, Auth, OpenAPI, Admin & Chat services
│   ├── mobile/               # Flutter mobile application (Riverpod, HugeIcons, Theme)
│   └── worker/               # BullMQ distributed queue workers, telephony dispatcher & kill-switch
├── packages/
│   ├── agent-runtime/        # Mastra 1.79 harness, specialized agents, tools, skills, models
│   ├── config/               # Zod-validated environment config & provider gates
│   ├── contracts/            # Canonical schemas, validation rules, state machines
│   ├── database/             # PostgreSQL 17 schema, Drizzle ORM, migration 0005
│   └── voice-provider/       # Telephony abstraction, MockVoiceProvider & Sarvam REST adapter
├── docs/rebuild/             # Comprehensive research reports, ADRs, and V3 architecture pack
└── compose.yaml              # Multi-container local orchestration
```
