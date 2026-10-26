# Outreach Intern V2 requirements inventory

Source priority: current user prompt (2026-10-24), repository instructions, provided specifications, verified official contracts, documented design decisions. Reconnaissance found an empty folder, no Git metadata, lockfiles, code, tests, or applicable AGENTS.md. Neither `Pasted text(20261023-194558).txt` nor `outreach-intern-v2-blueprint.md` was found in the workspace, Desktop, Documents, or Downloads; neither has been read. No original architecture is assumed.

| Requirement                                                                   | Source         | Priority | Module                | Acceptance                                   | Status                                                                    |
| ----------------------------------------------------------------------------- | -------------- | -------- | --------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| React/Vite, Nest API, separate BullMQ worker, PostgreSQL/Drizzle, shared Zod  | Current prompt | P0       | All                   | Typecheck/build and Compose healthy          | Pending                                                                   |
| Free mock-first end-to-end workflow; no paid credentials/no calls             | Current prompt | P0       | All                   | Demo through CSV/XLSX report download        | Pending                                                                   |
| Development-only identity, workspace ownership in every operation             | Current prompt | P0       | API/config/database   | Tenant and production bypass tests           | Pending                                                                   |
| Five editable starter personas/version snapshots                              | Current prompt | P0       | Database/API/web      | Seed, edit, select                           | Pending                                                                   |
| CSV/XLSX mapping, normalization, row errors/correction, duplicate/suppression | Current prompt | P0       | Imports               | Invalid/formula/duplicate/limits tests       | Pending                                                                   |
| Strict deterministic local plan; separate policy review/confirmed launch      | Current prompt | P0       | Contracts/API/web     | Planning creates zero attempts; blocked live | Pending                                                                   |
| Separate campaign/contact/attempt/import/analysis/report transitions          | Current prompt | P0       | Contracts/domain      | Transition unit tests                        | Pending                                                                   |
| Transactional outbox, durable inbox, persisted replayable SSE                 | Current prompt | P0       | Database/API/worker   | Replay/dedup/restart integration             | Pending                                                                   |
| Dispatch checks consent/suppression/window/budget/rate/concurrency            | Current prompt | P0       | Worker                | Policy and cancellation race tests           | Pending                                                                   |
| Conservative ambiguous dialing; no automatic redial                           | Current prompt | P0       | Provider/worker       | Timeout transport/recovery tests             | Pending                                                                   |
| Verified Sarvam adapter behind disabled live configuration                    | Current prompt | P0       | Provider              | Official schema transport tests              | Pending                                                                   |
| Async analysis and safe CSV/XLSX reports with persisted status                | Current prompt | P0       | Worker/API            | Accurate downloaded files/formula safety     | Pending                                                                   |
| Polished persisted operations UI, accessible responsive states                | Current prompt | P0       | Web                   | Playwright complete slice                    | Pending                                                                   |
| Pause/resume/cancel/opt-out/audit                                             | Current prompt | P0       | Domain/API/worker/web | Lifecycle and suppression tests              | Pending                                                                   |
| Versioned migrations/seed, healthchecks/restart/clean shutdown                | Current prompt | P0       | Infra/database        | Clean Compose migration and recovery         | Pending                                                                   |
| OpenAPI, safe env/secrets/logging, pagination/retention                       | Current prompt | P0       | All                   | Security review and docs crosscheck          | Pending                                                                   |
| Official audited docs, actual agents, synchronized runbooks/tests             | Current prompt | P0       | Docs                  | Source register and verification evidence    | Implemented with audited reports and native research/implementation waves |
| No FastAPI/Flutter/microservices/Kubernetes/vector/GPU                        | Current prompt | P0       | Architecture          | Dependency/tree review                       | Accepted                                                                  |
| No commit/push/deploy/remote modification                                     | Current prompt | P0       | Delivery              | Local changes only                           | Accepted                                                                  |

## Reconciliation

- Empty folder: create a new npm TypeScript workspace; preserve any files subsequently supplied. Do not create commits.
- Native concurrency permits three research workers alongside the lead, so seven topics run in three grouped streams. Orca was discovered but `run-create` failed with `no_active_sender_terminal`; explicit user fan-out instruction authorizes native agents instead.
- Provider capabilities are determined by current official contracts. Unverified capabilities stay disabled at their boundary and are documented rather than invented.
- Initial architecture below is provisional until every research report is read. Status is updated only with implementation/test evidence.

## Acceptance evidence and explicit remaining boundaries

The initial composed workflow passed9/9 and API security passed9/9. Unit contracts/config/provider/import/export/OpenAPI suite passed44/44; lint/typecheck/build and healthy Compose were run successfully. The final combined integration suite passed28/28 and browser suite passed3/3; the clean isolated Compose smoke passed. Exact commands and outcomes are recorded in docs/runbooks/verification.md. No paid API or phone call was performed.

| Detailed acceptance                            | Implementation                                                             | Evidence / boundary                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Demo identity and five editable personas       | Hashed sessions, isolated workspace, immutable versions                    | API security tests; production demo startup rejected               |
| CSV/XLSX mapping, normalization and correction | Bounded worker parsing, row indexes/reasons, persisted corrections         | Import unit tests plus browser acceptance                          |
| Duplicate/ineligible/suppressed rows           | Existing contacts linked; duplicate rows excluded; opt-out survives        | Composed workflow and suppression tests                            |
| Telephony-free plan/review                     | Strict deterministic-local plan with immutable selection/cost assumptions  | Zero attempts before explicit confirmation                         |
| Real queued simulation                         | Outbox→BullMQ→DB attempts, four deterministic outcomes                     | Workflow tests and killed-worker recovery                          |
| SSE replay and actual call inspection          | Persisted event IDs, periodic session authorization, transcript nullable   | HTTP stream/replay tests and browser refresh                       |
| Safe asynchronous reports                      | Private bytea CSV/XLSX, idempotent requests, formula text protection       | Download accuracy tests; expiry preserves completed job            |
| Restart/retry/concurrent worker recovery       | Database claims, outbox replay, mock same-attempt recovery                 | Recovery suite uses two workers, SIGKILL, Redis/PostgreSQL restart |
| Tenant and permission isolation                | Query ownership + composite FKs + viewer guards                            | API security checks reads/actions/downloads and invalid edges      |
| Safe live opt-in                               | Verified Sarvam adapter, config+allowlist+confirmation+global caps         | Mocked transport/no-retry tests; no manual live execution          |
| Fractional/unknown usage                       | Fractional duration before billing-pulse estimate; unknown cost stays null | No-dial terminal fixture tests                                     |
| Retention and domain terminality               | Source/inbox/transcript/report content expiry, expired sessions removed    | Expiry/revalidation/report-regeneration tests                      |

Production identity-provider integration, automatic Sarvam Analytics polling, active-call termination, recordings, email/notifications and automatic contact PII deletion are not implemented. These do not block the required development demo; production use requires a verified identity integration and the documented provider setup. Speech opt-out needs operator suppression unless a verified configured extraction convention is added; no arbitrary provider variable is treated as canonical consent.

Live personas use the configured committed Sarvam app/version; changing local prompt data alone does not redeploy the provider. Reservation caps and derived pricing are estimates, not guaranteed invoices because the verified endpoint supplies no maximum duration or billed cost. Unknown live attempts retain the shared in-flight slot and never automatically redial. These provider limitations are explicit in ADR004 and the voice contract.

List pagination currently uses validated offsets with deterministic ordering; event replay uses strict BIGINT cursors. Artifacts are bounded in PostgreSQL rather than object storage. The missing original/V2 documents cannot be assessed for undisclosed requirements or departures. No FastAPI/Flutter, microservices, Kubernetes, vector/GPU infrastructure, cloud dependency, commit, push or deployment was introduced.

Final delivery gate:75 automated cases pass, clean Compose smoke passes, five services healthy, OpenAPI generated, formatting/lint/typecheck/build/audit/diff checks passed. Free simulation path complete; deliberate production/provider boundaries above remain explicit.

## Current user update: TypeScript SDK and premium monochrome shadcn

Current request overrides the earlier native CSS implementation choice. Actual frontend now uses Tailwind4.3.3 and official new-york-v4 shadcn components, neutral black/white theme tokens, open table/list sections, horizontal personas and accessible Dialog/Sheet. Public shadcn/Geist/Linear references were read and audited; source component URLs/hashes are in frontend provenance. All existing persisted operations remain implemented.

The official sarvamai1.1.12 model SDK is integrated for opt-in LIVE planning content and post-call summaries, with a separate model key, strict output schemas, bounded requests and no SDK retries. SIMULATION never invokes the SDK even when credentials are configured. IDs, consent, eligibility, policy, budget, state and launch remain server-owned; provider transcripts/extracted answers remain unchanged. The official published SDKs lack outbound PSTN dialing, so the verified direct REST adapter remains at that narrow boundary; no SDK endpoint/method is invented. SDK capability audit is in docs/research/sarvam-typescript-sdk.md.

Verification for this update:65 unit tests pass, including real SDK calls through mocked fetch, refusal/malformed/no-retry/no-simulation-network and planning-authority/snapshot checks;28 composed integration tests pass. Final browser/theme results are added to the verification runbook after execution. Five versioned migrations now include summary provenance and processing leases. No real model or telephone call was made.

Current user update gate passed: 65unit+28integration+3browser=96 cases. Actual Tailwind/shadcn rendered screenshots reviewed, row-cache regression fixed, all simulation still local with SDK credentials, optional supported SDK model functions implemented and documented. No guessed outbound SDK method, real model request or real phone call.
