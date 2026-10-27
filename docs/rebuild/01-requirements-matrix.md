# Outreach Intern V3 — Requirements & Traceability Matrix

**Document:** `docs/rebuild/01-requirements-matrix.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal Systems Architect  

This matrix maps every functional, security, product, and reliability requirement from the V3 Specification to its design specification, target codebase location, and verification acceptance test.

| Req ID | Requirement Summary | Source / Section | Target Code Location | Verification & Acceptance Test | State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-SURF-01** | Primary user experience is a Flutter mobile app (`apps/mobile`) | Section 0, 3.1 | `apps/mobile/**` | `flutter analyze`, widget tests, simulator test run | Missing -> Planned |
| **REQ-SURF-02** | Operator interface is a private Vite admin console (`apps/admin`) | Section 0, 3.1 | `apps/admin/**` | Vite build, React tests, Playwright operator specs | Missing -> Planned |
| **REQ-SURF-03** | No user-facing customer web app | Section 0 | Retire `apps/web` | Audit confirms no public web app in repository | Verified in Phase 0 |
| **REQ-AUTH-01** | Admin-only account provisioning; no public registration | Section 0, 3.1, Phase 8 | `apps/api/src/auth/**`, `packages/database` | `POST /auth/register` does not exist; uninvited login fails | Partial -> Hardened |
| **REQ-AUTH-02** | Mandatory MFA (TOTP RFC 6238 + hashed recovery codes) | Section 0, Phase 8 | `apps/api/src/auth/mfa.ts` | Login without MFA produces challenge only; bad code rejected | Missing -> Planned |
| **REQ-AUTH-03** | Google OAuth authentication only for provisioned users | Section 0, Phase 8 | `apps/api/src/auth/google.ts` | Valid Google token for uninvited email returns HTTP 403 | Missing -> Planned |
| **REQ-AUTH-04** | Secure first-admin bootstrap without default credentials | Phase 4, Phase 8 | `scripts/bootstrap-admin.ts` | Script creates admin with random password; rejects duplicates | Missing -> Planned |
| **REQ-AGENT-01** | Mastra agent harness with 5 specialized agent roles | Section 3.2 | `packages/agent-runtime/**` | Unit tests execute each agent with bounded inputs | Missing -> Planned |
| **REQ-AGENT-02** | Typed tools with Zod input/output schemas | Section 3.2 | `packages/agent-runtime/src/tools/**`| Schema validation tests; tools reject unauthorized context | Missing -> Planned |
| **REQ-AGENT-03** | Mastra runtime skills for domain methods | Section 3.2 | `packages/agent-runtime/src/skills/**`| Skill loading and execution tests | Missing -> Planned |
| **REQ-AGENT-04** | Configurable OpenAI-compatible provider + deterministic local fallback | Section 3.2 | `packages/agent-runtime/src/models/**`| Mock planner runs with zero keys; custom endpoint verified | Missing -> Planned |
| **REQ-COMP-01** | Conversational prompt composer with multi-format contact upload | Section 0, Phase 6 | `apps/mobile/lib/features/chat/**` | Upload CSV, XLSX, TSV, TXT, vCard; valid rows previewed | Missing -> Planned |
| **REQ-COMP-02** | Phone normalization to E.164; country code never guessed | Phase 6, Phase 8 | `apps/api/src/imports.ts` | Malformed/ambiguous numbers flagged as excluded | Partial -> Hardened |
| **REQ-DRAW-01** | Detailed confirmation drawer before any dispatch | Section 0, Phase 6 | `apps/mobile/lib/features/confirmation`| Shows recipients, masked numbers, script, voice, cost | Missing -> Planned |
| **REQ-DRAW-02** | Confirmation is an explicit, separate action; LLM cannot dial | Section 0, Phase 6 | `apps/api/src/campaigns.ts` | Natural-language prompt creates draft only; zero calls | Partial -> Hardened |
| **REQ-DRAW-03** | Stale plan detection via cryptographic snapshot hash | Phase 6 | `apps/api/src/planning.ts` | Modified campaign returns HTTP 409 `PLAN_STALE` | Verified |
| **REQ-EXEC-01** | BullMQ operational queues for imports, dispatch, reconciliation | Section 3.1, Phase 4 | `apps/worker/**` | Queue processing tests; Redis restart recovery | Verified |
| **REQ-EXEC-02** | Transactional outbox pattern for PostgreSQL-to-BullMQ consistency | Phase 4, Phase 8 | `packages/database`, `apps/worker` | Jobs recovered from DB outbox if Redis drops | Verified |
| **REQ-EXEC-03** | Calling window and emergency kill-switch enforcement | Phase 6, Phase 8 | `apps/worker/src/calls.ts` | Out-of-window contacts delayed; kill switch halts dispatch | Partial -> Hardened |
| **REQ-TELE-01** | Verified Sarvam Voice Agents outbound REST integration | Section 0, Phase 4 | `packages/voice-provider` | POST to `/outbounds` creates call; records attempt ID | Partial -> Hardened |
| **REQ-TELE-02** | Webhook deduplication and inbox processing | Phase 4, Phase 7 | `apps/api/src/webhooks.ts` | Duplicate/reordered webhooks do not corrupt state | Verified |
| **REQ-TELE-03** | MockVoiceProvider for zero-cost, zero-network local simulation | Phase 4, Phase 9 | `packages/voice-provider` | Full campaign simulation runs end-to-end locally | Verified |
| **REQ-HIST-01** | Call history with transcript turns, speakers, translations, analysis | Section 0, Phase 7 | `apps/mobile/lib/features/history/**`| Chronological speech bubbles; en_text labeled as translated | Missing -> Planned |
| **REQ-HIST-02** | Post-call analysis with structured disposition and confidence | Phase 7 | `apps/worker/src/calls.ts` | Analyzes transcript without re-dialing phone | Verified |
| **REQ-REP-01** | Asynchronous CSV/XLSX report generation with formula-injection guard | Phase 4, Phase 8 | `apps/worker/src/reports.ts` | Exported cells prepended with apostrophe `'` | Verified |
| **REQ-DEV-01** | Docker Compose runs Postgres, Redis, API, Worker, Admin | Phase 9 | `compose.yaml` | `docker compose up --build` boots all services healthy | Partial -> Hardened |
| **REQ-DEV-02** | Documented mobile setup with host/emulator routing | Phase 9 | `README.md`, `docs/runbooks/**` | Mobile connects to host API without hardcoded IPs | Missing -> Planned |
