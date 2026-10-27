# Phase 0: Repository Inventory and Reconnaissance

**Date:** 2026-10-26  
**Auditor:** Lead Engineering Agent  
**Repository Working Directory:** `/Users/kuroyami/CallingAgents`  
**Git Branch:** `main` (clean working tree, no uncommitted changes)  

---

## 1. Environment & SDK Toolchain Verification

| Component | Installed / Active Version | Path | Status |
| :--- | :--- | :--- | :--- |
| **Flutter SDK** | Flutter 3.44.9 • channel stable (Framework rev 6b182d2c75, Engine b9499e4c25) | `/Users/kuroyami/development/flutter/bin/flutter` | Verified Available |
| **Dart SDK** | Dart 3.12.2 (stable) on `macos_arm64` | `/Users/kuroyami/development/flutter/bin/dart` | Verified Available |
| **Node.js** | Node 24.13+ compatible (Node LTS) | Host toolchain | Verified Available |
| **NPM** | npm workspace with package lockfile (`package-lock.json`) | `/Users/kuroyami/CallingAgents/package-lock.json` | Verified Available |
| **Docker Engine** | Docker 29.5.3 (Desktop context `desktop-linux`) | `/Applications/Docker.app` | Installed on host; daemon not currently running |
| **Docker Compose** | Compose v5.1.4 supported via compose.yaml | `/Users/kuroyami/CallingAgents/compose.yaml` | Ready |

---

## 2. Repository Structure & Existing Code Entry Points

The repository is structured as a monorepo with `apps/*` and `packages/*`:

### 2.1 Backend Applications (`apps/`)

1. **`apps/api` (NestJS 11.2.8 + Express 5 + Zod 4)**
   - Entry point: `apps/api/src/main.ts`
   - Controllers: `apps/api/src/controllers.ts` (`AuthController`, `WorkspaceController`, `AgentsController`, `ImportsController`, `CampaignsController`, `PublicController`)
   - Services:
     - `apps/api/src/auth.ts`: Session authentication, demo sign-in (`/auth/demo`), origin verification (`verifyOrigin`), cookie-based session handling (`outreach_session`).
     - `apps/api/src/campaigns.ts`: Campaign CRUD, deterministic local planning (`/campaigns/:id/plan`), simulation dispatch (`/campaigns/:id/simulate`), live launch (`/campaigns/:id/launch`), lifecycle actions (`pause`, `resume`, `cancel`).
     - `apps/api/src/agents.ts`: Personas & versioning (`/agents`, `/agents/:id`, `/agents/:id/versions`, `/agents/:id/sandbox`).
     - `apps/api/src/imports.ts`: File upload and processing (`/imports`, `/imports/:id/rows`, `/imports/:id/validate`, `/contacts`, `/contacts/:id/suppress`).
     - `apps/api/src/operations.ts`: Overview aggregates (`/overview`), integrations status (`/integrations`), settings (`/settings`), audit log (`/audit`), async reports (`/reports`, `/campaigns/:id/reports`, `/reports/:id/download`).
     - `apps/api/src/streams.ts`: Server-Sent Events SSE stream for campaigns (`/campaigns/:id/stream`) with heartbeat and event replay cursors.
     - `apps/api/src/webhooks.ts`: Sarvam inbound webhook receiver (`/webhooks/sarvam/:token`).
     - `apps/api/src/openapi.ts`: OpenAPI 3.1 schema generator and `/openapi.json` endpoint.
   - Tests: `apps/api/src/openapi.test.ts`, `apps/api/src/planning.test.ts`.

2. **`apps/worker` (BullMQ 5.81.5 + Redis + PostgreSQL)**
   - Entry point: `apps/worker/src/main.ts`
   - Queue processors:
     - `apps/worker/src/calls.ts`: Outbound call dispatch, provider invocation, webhook reconciliation, call timeout handling.
     - `apps/worker/src/imports.ts`: CSV/XLSX background ingestion, E.164 phone normalization, validation.
     - `apps/worker/src/reports.ts`: CSV/XLSX export generation and private bytea artifact persistence.
   - Tests: `apps/worker/src/worker.test.ts`.

3. **`apps/web` (Existing React 19 + Vite 8 + Tailwind 4 + Radix UI)**
   - Web frontend currently deployed for browser access at `http://localhost:5173`.
   - Entry point: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`.

### 2.2 Shared Packages (`packages/`)

1. **`packages/contracts` (`@outreach/contracts`)**
   - Source: `packages/contracts/src/index.ts`
   - Exports all Zod schemas: `AgentSchema`, `AgentVersionSchema`, `ImportSchema`, `ContactSchema`, `CampaignSchema`, `CallAttemptSchema`, `AnalysisSchema`, `ReportSchema`, `EventSchema`, `NormalizedCallEventSchema`, `SarvamRequestSchema`, `SarvamResponseSchema`, `SarvamWebhookSchema`, etc.
   - Tests: `packages/contracts/src/contracts.test.ts` (18 unit tests passing).

2. **`packages/database` (`@outreach/database`)**
   - Schema: `packages/database/src/schema.ts` (Drizzle ORM over PostgreSQL)
   - Tables: `users`, `workspaces`, `memberships`, `sessions`, `agents`, `agent_versions`, `imports`, `contacts`, `import_rows`, `consent_records`, `suppressions`, `campaigns`, `campaign_contacts`, `call_attempts`, `analyses`, `webhook_inbox`, `outbox`, `campaign_events`, `attempt_events`, `reports`, `usage_ledger`, `audit_log`.
   - Personas: `packages/database/src/personas.ts` (5 starter personas: Customer Discovery, Appointment Coordinator, Feedback Listener, Event Outreach, Service Follow-up).
   - Migrations: `packages/database/migrations/` (5 SQL migrations: 0000 to 0004).

3. **`packages/voice-provider` (`@outreach/voice-provider`)**
   - Source: `packages/voice-provider/src/index.ts`, `packages/voice-provider/src/models.ts`
   - Providers:
     - `MockVoiceProvider`: Deterministic synthetic call simulator generating terminal outcomes (`connected`, `no_answer`, `busy`, `failed`), synthetic transcript, and extracted fields.
     - `SarvamVoiceProvider`: Calls Sarvam Outbounds v1 REST API (`https://apps.sarvam.ai/api/outbounds/v1/orgs/:org/workspaces/:ws/outbounds`).
     - `CampaignContentPlanner` & `ModelSummaryService`: Uses `sarvamai` 1.1.12 SDK for structured prompt proposals and summaries when `MODEL_PROVIDER=sarvam`.
   - Tests: `provider.test.ts` (11 tests), `models.test.ts` (15 tests).

4. **`packages/config` (`@outreach/config`)**
   - Source: `packages/config/src/index.ts`
   - Validates all environment variables with strict defaults and safety flags (`DEV_AUTH`, `VOICE_PROVIDER=mock`, `LIVE_CALLS_ENABLED=false`).
   - Tests: `packages/config/src/config.test.ts` (5 tests).

---

## 3. Existing Client and Flutter Status

- **Existing Client:** `apps/web` (React/Vite).
- **Flutter Codebase:** None currently exists. Search for `pubspec.yaml` and `*.dart` returned zero files.
- **Target Location:** `apps/flutter_app` with its own `pubspec.yaml`, `lib/`, `test/`, and `integration_test/`.
- **Target Platforms:** macOS Desktop (host development/testing), Android, and iOS.

---

## 4. Verified Working Commands

| Command | Working Output / Verification |
| :--- | :--- |
| `npm test` | **65/65 unit tests passed** in 704ms (`vitest run --config vitest.config.ts`) |
| `flutter --version` | Flutter 3.44.9, Dart 3.12.2 on macOS ARM64 |
| `node scripts/generate-openapi.mjs` | Verified generates `docs/api/openapi.json` (735 KB) |

---

## 5. Potential Blockers & Integration Strategy

1. **Docker Daemon Status:**
   - Docker Desktop is installed at `/Applications/Docker.app` but the background engine is currently stopped.
   - For host-mode testing, `apps/api` and `apps/worker` connect to PostgreSQL at `localhost:5442` and Redis at `localhost:6389` when started.
   - Unit tests run completely in-memory without external services.
   - Flutter tests (`flutter test`) will run directly against mocks, deterministic fixture data, and unit-tested repositories without needing Docker containers.
2. **Session / Auth Strategy for Flutter:**
   - The NestJS API currently issues an HttpOnly cookie (`outreach_session`).
   - For native Flutter clients on mobile/desktop, we must verify cookie jar handling in `dio` / `cookie_jar` or check if header-based token authentication is supported or required.
3. **No Breaking Modifications:**
   - The Flutter client will be placed cleanly inside `apps/flutter_app`.
   - We will preserve all root package scripts, documentation, and existing backend files.
