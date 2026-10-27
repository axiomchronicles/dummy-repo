# Outreach Intern V3 — System Architecture Specification

**Document:** `docs/rebuild/02-system-architecture.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal Systems Architect  

---

## 1. High-Level System Architecture & Service Topography

Outreach Intern V3 is architected as a modular, high-reliability TypeScript monorepo with clean boundary enforcement across mobile, admin, API, worker, database, and agent runtime services.

```
┌──────────────────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│           Flutter Mobile Client              │    │          Private Vite Admin Console          │
│          (`apps/mobile` - iOS/Android)       │    │          (`apps/admin` - Operator Web)       │
└──────────────────────┬───────────────────────┘    └──────────────────────┬───────────────────────┘
                       │ Bearer Token / HTTPS                              │ Session Cookie / CSRF
                       │ SSE Stream                                        │
                       ▼                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   NestJS HTTP API Gateway                                        │
│                                        (`apps/api`)                                              │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┬────────────────────┐  │
│  │   Auth & MFA Module   │  Chat & Import Module │  Campaigns & Confirm  │  Webhooks & Health │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┴────────────────────┘  │
└──────────────┬───────────────────────────────┬───────────────────────────────┬───────────────────┘
               │ Query / Mutation              │ Delegate Planning / Analysis  │ Enqueue Outbox
               ▼                               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────────┐
│     PostgreSQL Database      ││     Mastra Agent Harness     ││     BullMQ Worker Process        │
│   (Authoritative Relational) ││  (`packages/agent-runtime`)  ││         (`apps/worker`)          │
│ • Users, Sessions, MFA       ││ • Outreach Planner Agent     ││ • imports worker                 │
│ • Chat Threads & Messages    ││ • Contact Resolution Tool    ││ • dispatch worker (window/kill)  │
│ • Imports & Contacts Roster  ││ • Post-Call Analysis Agent   ││ • reconciliation worker          │
│ • Campaigns & Call Attempts  ││ • Runtime Skills Registry    ││ • analysis worker                │
│ • Webhook Inbox & Outbox     ││ • OpenAI-Compatible Config   ││ • reports worker                 │
└──────────────────────────────┘└──────────────────────────────┘└─────────────────┬────────────────┘
                                                                                  │ Controlled Telephony
                                                                                  ▼
                                                                ┌──────────────────────────────────┐
                                                                │       Voice Provider Layer       │
                                                                │   (`packages/voice-provider`)    │
                                                                │  • MockVoiceProvider (Simulation)│
                                                                │  • SarvamVoiceProvider (Live)    │
                                                                └──────────────────────────────────┘
```

---

## 2. Process & Ownership Boundaries

### 2.1 The Two Client Surfaces
1. **`apps/mobile` (Flutter Mobile App):**
   - The primary end-user experience.
   - Built with Flutter 3.44.9, Riverpod for reactive state management, Sliver primitives for performant list rendering, and HugeIcons.
   - Communicates with `apps/api` via REST and Server-Sent Events (SSE).
   - Never communicates directly with Sarvam or the LLM. Contains zero API keys or infrastructure secrets.
2. **`apps/admin` (Vite Admin Console):**
   - A private, operator-only React 19 application.
   - Shares the same visual design language, tokens, and dark/light monochrome aesthetics as the mobile app.
   - Dedicated strictly to user provisioning, MFA recovery, queue observability, emergency kill-switch toggling, and audit log inspection.
   - Not a customer dashboard; cannot launch campaigns or place calls.

### 2.2 Backend & Worker Processes
1. **`apps/api` (NestJS Gateway):**
   - Manages identity, session issuance, MFA challenge verification, file uploads, campaign planning requests, explicit confirmation validation, and webhook ingress.
   - Commits state changes to PostgreSQL and immediately enqueues outbox records in the same transaction.
2. **`apps/worker` (BullMQ Worker Process):**
   - Asynchronous execution engine running five distinct queue processors (`imports`, `dispatch`, `reconciliation`, `analysis`, `reports`).
   - The outbox publisher polls pending outbox entries and publishes to BullMQ.
   - Before any call attempt is initiated, the worker validates the calling window, suppression records, active concurrency slots, and the global emergency kill-switch.
3. **`packages/agent-runtime` (Mastra Harness):**
   - Encapsulates Mastra agents, typed tools, runtime skills, prompt versioning, and LLM provider interfaces.
   - Operates statelessly with respect to auth; receives server-injected execution context.
   - Provides deterministic local fallback planning when running in simulation mode without external keys.
4. **`packages/voice-provider` (Telephony Abstraction):**
   - Implements `VoiceProvider` interface.
   - `MockVoiceProvider`: Generates deterministic synthetic call progressions, bilingual transcripts, and extracted variables for simulation.
   - `SarvamVoiceProvider`: Handles actual HTTP REST calls to `https://apps.sarvam.ai/api/outbounds/v1/...` and normalizes terminal webhooks.
5. **`packages/database` (Data Layer):**
   - Drizzle ORM schema, migrations, connection pool, and transaction helpers.
   - Authoritative source of truth for all domain entities.

---

## 3. Communication & Data Protocols

| Flow | Protocol | Security & Invariants |
| :--- | :--- | :--- |
| Mobile to API | HTTPS REST + Bearer JWT | Tokens stored in OS Keychain/Keystore; 15m access TTL, rotating refresh token |
| Mobile Live Updates | HTTPS Server-Sent Events (SSE) | Cursor-based replay; authenticated by session; heartbeat every 15s |
| Admin Console to API | HTTPS REST + HTTP-Only Cookies | `SameSite=Strict`, `Secure`; Double-submit `X-CSRF-Token` header verification |
| API to Mastra Harness | Direct In-Process TypeScript Call | Server-side execution; context-bound permissions |
| Worker to Sarvam API | HTTPS REST POST | Server-side `X-API-Key`; 20s timeout; uncertain timeouts enqueued to reconciliation |
| Sarvam to Webhook API | HTTPS POST | Unguessable route token; constant-time string equality; idempotent inbox |
| Worker to PostgreSQL | TCP (Node-Postgres Pool) | Transactional consistency; row locking (`FOR UPDATE`) on attempts |
| Worker to Redis | TCP (IORedis) | AOF persistence; `noeviction` policy |

---

## 4. Failure Modes & Recovery Guarantees

1. **Redis Crash / Restart:**
   - BullMQ state in Redis is treated as ephemeral operational cache.
   - The PostgreSQL `outbox` table maintains the durable queue intent. When Redis reconnects, the `OutboxPublisherService` identifies unpublished or uncompleted outbox entries and republishes them.
2. **Outbound Call Timeout:**
   - If an HTTP POST to Sarvam times out after 20 seconds, the worker does NOT immediately redial (which could cause double-calling a recipient).
   - The attempt is set to `status: 'unknown'` and routed to the `reconciliation` queue, which polls the Sarvam analytics API or awaits delayed webhook arrival.
3. **Post-Call Analysis Failure:**
   - If the LLM analysis agent fails or hits rate limits after a call finishes, the call attempt outcome and raw transcript remain safely persisted in the database.
   - Only the `analysis` job retries with exponential backoff. The call is never re-dialed.
