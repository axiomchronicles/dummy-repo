# Outreach Intern V3 — Repository and Product Reconnaissance Audit

**Document:** `docs/rebuild/00-repository-audit.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 0 Reconnaissance Gate)  
**Author:** Lead Engineering Agent  

---

## 1. Executive Summary & Inventory

An exhaustive static and runtime inspection of the `CallingAgents` repository was conducted to baseline the existing implementation against the V3 Product Rebuild specifications.

### Key Inventory Findings
1. **Monorepo Structure**:
   - `apps/web`: Contains a React 19 / Vite 8 customer-facing web application with pages for `Workspace`, `CampaignWizard`, `CampaignDetail`, `Contacts`, `Agents`, and `Operations`.
     - *V3 Verdict:* **Non-compliant with Product Definition**. V3 strictly requires: **Flutter mobile app (`apps/mobile`)** as the primary user experience + **Vite admin console (`apps/admin`)** as a private operator tool. No general-purpose customer web app is permitted. `apps/web` must be retired and replaced with `apps/admin`.
   - `apps/api`: NestJS v11 modular HTTP application. Currently handles demo auth, campaigns, imports, personas, operations, webhooks, and SSE.
     - *V3 Gaps:* Uses `DEV_AUTH` with automated user provisioning via `ON CONFLICT DO UPDATE`. Missing password hashing, TOTP MFA, admin invitation workflows, Google OAuth with pre-provisioned identity checks, and Mastra runtime integration.
   - `apps/worker`: BullMQ v5 worker with 5 queues (`imports`, `dispatch`, `reconciliation`, `analysis`, `reports`).
     - *V3 Gaps:* Needs reconciliation with Mastra workflows/schedules and scheduling window enforcement for future-dated campaigns.
   - `packages/contracts`: Zod schemas for V2 API contracts and Sarvam payloads.
     - *V3 Gaps:* Missing MFA schemas, admin schemas, chat thread/message schemas, prompt registry schemas, Mastra tool/workflow schemas.
   - `packages/database`: Drizzle ORM v0.45 with 22 PostgreSQL tables and 5 migration files.
     - *V3 Gaps:* Missing user authentication credentials (passwords, MFA secrets, recovery codes), user status, chat threads, chat messages, prompt versions, schedule definitions, and system settings.
   - `packages/voice-provider`: Contains `MockVoiceProvider` and Sarvam REST outbound logic, plus `sarvamai` SDK for model content proposal/summarization.
     - *V3 Gaps:* Needs a unified provider-neutral abstraction isolating Sarvam specifics and supporting contract-tested verification.
   - `packages/agent-runtime`: **Completely missing**. Needs implementation using Mastra.
   - `apps/mobile`: **Completely missing**. Needs implementation in Flutter with Riverpod, Sliver widgets, and HugeIcons.
   - `apps/admin`: **Completely missing**. Needs implementation in Vite + React + TypeScript matching the mobile design tokens.

---

## 2. Existing Subsystems & Code Evidence

### 2.1 API & Authentication (`apps/api`)
- **Current State:** Located in `apps/api/src/auth.ts` and `apps/api/src/controllers.ts`. Uses `DemoSignInSchema` (`POST /api/v1/auth/demo`) which executes:
  ```sql
  INSERT INTO users(email, name) VALUES($1, $2) ON CONFLICT(email) DO UPDATE SET name=users.name RETURNING *
  ```
  Creates an owner membership and auto-seeds agent personas.
- **V3 Requirement:**
  - Admin-only provisioning/invitation.
  - Zero public registration.
  - Email/password with argon2/scrypt/bcrypt hashing.
  - Google OAuth linking only to pre-provisioned active accounts.
  - Mandatory TOTP MFA + hashed one-time recovery codes.
  - Role-based permissions (`superadmin`, `admin`, `operator`, `viewer`).

### 2.2 Telephony & Voice Provider (`packages/voice-provider` & `scripts`)
- **Current State:**
  - `packages/voice-provider/src/index.ts` provides `MockVoiceProvider` and `normalizeSarvamWebhook`.
  - Scripts `scripts/sarvam-setup.mjs` and `scripts/sarvam-test-call.mjs` document the actual verified Sarvam REST contract:
    - Outbound URL: `https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds`
    - Method: `POST` with `X-API-Key` and `Content-Type: application/json`
    - Request Body:
      ```json
      {
        "app_config": {
          "app_id": "<app_id>",
          "app_version": 1,
          "connection_config": {
            "connection_id": "<connection_id>",
            "agent_phone_number": "<agent_phone_number>"
          },
          "app_overrides": {
            "initial_language_name": "Hindi"
          }
        },
        "user_config": {
          "user_phone_number": "<user_phone_number>"
        },
        "webhook_config": {
          "url": "<webhook_url>",
          "metadata": { "localAttemptId": "<uuid>" }
        }
      }
      ```
    - Response: `{ "attempt_id": "<provider_attempt_id>" }`
    - Webhook endpoint: `POST /api/v1/webhooks/sarvam/:token` validates bearer token against `SARVAM_WEBHOOK_TOKEN` via `timingSafeEqual`.
  - **Live Configuration:** `.env` contains live credentials for testing. Default execution remains `simulation` (`VOICE_PROVIDER=mock`, `LIVE_CALLS_ENABLED=false`).

### 2.3 Agent Harness & LLM Integration
- **Current State:**
  - `packages/voice-provider/src/models.ts` calls `sarvamai` SDK (`SarvamAIClient.chat.completions`) for `CampaignContentPlanner`.
  - Mastra is **not installed**; no agents, tools, skills, or workflows exist.
- **V3 Requirement:**
  - Modular harness in `packages/agent-runtime` using Mastra.
  - Configurable OpenAI-compatible LLM endpoint (base URL, API key, model ID) with deterministic fallback.
  - 5 specific agent roles / workflows (Planner, Contact Validator, Supervisor, Post-call Analyst, Report QA).
  - Explicit typed tools with Zod validation.
  - First-class runtime skills.

### 2.4 Data Model & Database (`packages/database`)
- **Current Tables (22 tables):**
  `users`, `workspaces`, `memberships`, `sessions`, `agents`, `agent_versions`, `imports`, `contacts`, `import_rows`, `consent_records`, `suppressions`, `campaigns`, `campaign_contacts`, `call_attempts`, `analyses`, `webhook_inbox`, `outbox`, `campaign_events`, `attempt_events`, `reports`, `usage_ledger`, `audit_log`.
- **Gaps for V3:**
  - `users`: needs password hash, status (`active`, `invited`, `disabled`, `locked`), mfa_secret, mfa_enabled, mfa_recovery_codes.
  - `user_invitations`: new table for admin-issued invitations.
  - `chat_threads` and `chat_messages`: new tables for the mobile conversation composer.
  - `prompt_versions`: new table for versioned prompts and configuration snapshots.
  - `system_settings`: new table for global kill switch, egress rules, provider configs.

### 2.5 Operational Queues & Workers (`apps/worker`)
- **Current State:**
  - 5 BullMQ queues: `imports`, `dispatch`, `reconciliation`, `analysis`, `reports`.
  - Transactional outbox pattern implemented (`enqueueOutbox` in Postgres transaction).
  - Health checks `/health/live` and `/health/ready` exposed on port 3001.

### 2.6 Docker Compose & Environment
- **Current State:**
  - `compose.yaml`: PostgreSQL 17 (port 5442), Redis 7.4 (port 6389), `migrate` one-shot service, `api` (port 3000), `worker` (port 3001), `web` (port 5173).
  - Container healthchecks configured with `pg_isready` and `redis-cli ping`.
- **V3 Changes Needed:**
  - Replace `web` service with `admin` (Vite admin console).
  - Add configuration for host/emulator mobile networking (`host.docker.internal` / `10.0.2.2`).

---

## 3. Gap Analysis Matrix

| Requirement | Current Evidence / Path | State | Risk | Target Design | Acceptance Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **No User-Facing Web App** | `apps/web` exists with full client UI | Non-compliant | High (violates product boundary) | Retire `apps/web`; replace with private `apps/admin` | Repository inspection confirms no customer web dashboard |
| **Flutter Mobile App** | Missing | Missing | High (core surface) | Implement `apps/mobile` with Riverpod, Sliver widgets, HugeIcons | Flutter analyze, unit/widget tests, runs on simulator |
| **Vite Admin Console** | Missing (only `apps/web` exists) | Missing | High (operator surface) | Implement `apps/admin` for user provisioning, MFA reset, kill switch | Admin login, user invitation, audit log Playwright tests |
| **Admin-Only Account Provisioning** | `apps/api/src/auth.ts` has self-provisioning `signIn` | Partial / Insecure | Critical (security violation) | Strict invite/provisioning API; remove demo auto-create | Direct API POST fails to register new account |
| **Mandatory MFA (TOTP + Recovery)** | No MFA tables or endpoints | Missing | Critical (auth security) | TOTP challenge, verification, secret storage, hashed recovery codes | Login requires MFA; invalid/used codes rejected |
| **Google Sign-in Linkage** | None | Missing | Medium | Google ID token verification matching active provisioned email | Unprovisioned Google user rejected |
| **Mastra Agent Harness** | No `@mastra/core`; custom Sarvam SDK calls only | Missing | High (AI architecture) | `packages/agent-runtime` with Mastra agents, tools, skills, workflows | Planner generates campaign draft without executing calls |
| **OpenAI-Compatible LLM Config** | Hardcoded `SARVAM_MODEL_NAME` | Missing | Medium | Base URL, API key, model ID config with local simulation fallback | Works with mock planner and configured custom endpoint |
| **Chat Composer & History** | Direct campaign wizard form in web app | Missing | High (core UX) | Conversational composer with persisted chat threads/messages | User inputs natural prompt + file, sees streamed plan |
| **Confirmation Drawer / Sheet** | Basic modal in `apps/web` | Partial | High (trust principle) | Bottom sheet with recipients, masked numbers, script, voice, cost | Explicit confirm starts simulation; edit/cancel preserves safety |
| **Multi-format Contact Imports** | CSV/XLSX parsed in `apps/api/src/imports.ts` | Partial | Medium | Add TSV, plain text, vCard parsers with phone normalization | Validates all supported formats; excludes invalid rows |
| **Sarvam Telephony Integration** | Documented in scripts; basic REST in provider | Partial | Medium | Robust provider adapter with webhook deduplication and analytics | Contract test passes with fixture payloads |
| **Docker Compose Dev Env** | `compose.yaml` runs DB, Redis, API, Worker, Web | Partial | Low | Update Compose to run DB, Redis, API, Worker, Admin | `docker compose up --build` starts full backend in simulation |

---

## 4. Phase 0 Conclusions & Next Steps

1. The repository has a solid backend foundation (`apps/api`, `apps/worker`, `packages/database`, BullMQ, Drizzle) but has an incorrect frontend surface (`apps/web` instead of `apps/mobile` + `apps/admin`).
2. Authentication must be overhauled from demo bypass to secure admin provisioning + MFA.
3. The AI planning layer must be rebuilt from raw SDK calls into a robust Mastra agent harness in `packages/agent-runtime`.
4. Phase 1 research fan-out will now proceed across Agents A through H to produce detailed research specifications under `docs/rebuild/research/`.
