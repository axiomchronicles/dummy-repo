# Security, privacy, reliability and verification strategy

Access date 2026-10-24. This threat model is a design/test inventory and does not claim tests have passed. No paid observability integration is needed: structured redacted process logs, persisted audit/events, health and worker status are sufficient first-slice diagnostics.

## Trust boundaries and policy

Browser, contact uploads and speech/transcripts are untrusted. API authorizes the workspace in every repository action, including indirect identifiers such as import, persona version, call, report, SSE cursor and suppression. Workspace membership comes from the session, never a request-body workspace alone. Use opaque HttpOnly SameSite cookies, validated sessions with expiry, explicit origins, request size limits and mutation CSRF/origin defenses. A development demo bypass is rejected by production configuration and not merely hidden in UI. Logout clears browser caches. Return consistent 401/403/404 without leaking cross-tenant metadata.

Live mode is server-side opt-in with configured Sarvam transport and webhook safeguards, authorized test destination allowlist, deliberate launch confirmation, consent, eligibility, timezone window and budget/concurrency/rate checks. Never let a planner, transcript or uploaded instruction authorize calling. Agent prompt/config changes produce versions and audit events. Mock has no HTTP transport and synthetic contacts are invalid live destinations. Do not claim exactly-once telephony: DB idempotency and Redis job IDs protect local scheduling, but an uncertain external initiation may have succeeded.

Protect phone numbers and transcript PII. Normalize E.164 only with verified source region; mask phone numbers in general lists/logs, authorize full values where needed. Log local IDs/status/safe error codes only; redact keys, cookies, raw HTTP payloads and complete phones. Report downloads are authenticated tenant-scoped routes; no public storage. If object storage is added later, use private random keys and authorized short-lived links. Retention includes uploaded originals, invalid row contents, transcript, exports and raw provider payloads; a deletion job must respect audit/consent/suppression requirements and be documented. Durable suppression retains normalized number identity independently of imports; reimport never clears opt-out.

## Input/output risks

Bound upload bytes, XLSX decompression/uncompressed size where library supports it, rows, columns and cell lengths. Validate extension plus actual parse; refuse formulas as uploaded instructions/data where appropriate. Row index/source map and reason codes preserve actionable corrections. Never fetch URLs supplied by contact fields; never execute spreadsheet expressions or render imported HTML with dangerous innerHTML. CSV parsing must respect quoted delimiters/newlines and reject malformed structure. Batch row inserts and database uniqueness enforce dedup, rather than unbounded Promise.all or quadratic duplicate searches.

CSV formula injection can begin with =,+,-,@, tab, CR/LF, and locale full-width variants. Current OWASP recommends a tab prefix inside the quoted field for Excel-resistant mitigation of =,+,-,@; this changes the exported text and is intended for spreadsheet viewing. Extend conservative detection to control/whitespace and full-width variants, quote all CSV cells and double embedded quotes; quoting alone does not prevent formulas. Apostrophe prefix is a weaker alternative that may fail after Excel save/reopen. Preserve canonical business data in PostgreSQL; sanitization is export-only and documented. XLSX writes strings as explicit string cells with no formula property. Protect E.164 values beginning + as text. A malicious quote/separator must not break out into a fresh formula cell. Source guidance notes spreadsheet save/reopen behavior can defeat some mitigations; document export intent and test actual bytes/types. Unknown answers remain null, not inferred success.

Webhook ingress cannot invent a vendor signature. Agent C owns the verified contract; if no official signature exists, live mode requires a configured high-entropy secret route/header only if compatible, strict schema/size validation, constant-time comparison, rate limit and durable inbox dedup. Authentication is separate from dedup: a unique forged event is still forged. Reconcile terminal events by verified provider attempt identity scoped to an existing local attempt; do not trust provider payload tenant IDs. Avoid storing unredacted raw vendor payloads. Event timestamp is not a substitute for authentication. Replay and late/duplicate conflicting outcomes must be safe and audited.

## Durable execution invariants

State change and outbox record commit in one PostgreSQL transaction. Publisher may enqueue twice after a crash; DB dispatch claim/unique attempt constraints prevent duplicate local attempts. Queue job ID is a convenience, not sole correctness mechanism. Webhook inbox is committed before async processing and has an indexed unique provider/event identity per verified contract. Processing both domain state and inbox processed marker is transactional. Persisted SSE events carry monotonic cursor IDs and tenant-scoped replay; bounded polling/SSE batches avoid unbounded memory.

Claim work under transaction/locking, recheck campaign and contact state, latest consent/suppression/window/budget immediately before side effect, and record dispatch intent. Pause blocks new dispatch; cancel invalidates queued work and records whether termination is supported. Active calls may finish after pause/cancel; terminal events remain recorded. Concurrency and cumulative budgets must be enforced atomically, including multiple workers. Simulated usage and live usage are distinct. Ambiguous outbound timeout becomes uncertain/reconcile_required and is never automatically redialed unless a documented provider idempotency/reconciliation guarantee proves safety. Missing completion should not become connected or success. Analysis/report jobs retry without re-running call initiation.

Redis loss/restart recovers unpublished and stale published work from PostgreSQL; terminal state is retained. Use bounded exponential retry with jitter for retryable DB/network/report errors and permanent terminal status for bad input/auth. A worker process alive but disconnected/not processing must fail readiness. Graceful stop closes BullMQ workers before DB/Redis; interrupted work leaves a durable recoverable state. Dead jobs need a visible safe reason and retry eligibility, not silent completion. Exactly one final business outcome per attempt is enforced centrally; audit conflicting late events.

## Test matrix

| Layer / scenario    | Meaningful assertion                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts           | Strict security input rejects unknown fields; plan/provider fixture schema matches docs; missing extracted values remain null                                      |
| State machines      | All allowed edges work; invalid terminal regressions rejected; campaign/contact/attempt/import/analysis/report independent                                         |
| Auth/tenant         | Anonymous denied; workspace B cannot read/mutate IDs from A including calls/import rows/reports/events/downloads; production demo config rejected                  |
| Planning/live guard | Planning and saving create zero call attempts; default mock makes zero external HTTP; unconfirmed/unconfigured/non-allowlisted live rejected                       |
| Import              | Malformed CSV/XLSX, invalid region/phone, consent absent, duplicate rows/reimports, suppression, formulas, byte/row/column limits and row correction               |
| Database            | Clean versioned migration, uniqueness/FKs, transaction rollback removes state+outbox; indexed dedup/cursor query; simultaneous migrator policy                     |
| Outbox              | Crash after enqueue before published marker leads to safe replay and one DB attempt; Redis empty recovery restores queued intent                                   |
| Inbox               | Repeated webhook persisted once; concurrent duplicate processing produces one transition/analysis job; foreign attempt and conflicting late event rejected/audited |
| Dispatch races      | Duplicate launch idempotency, simultaneous workers, budget cap/concurrency, pause/cancel and suppression added immediately before dispatch                         |
| Queue               | Bounded retry/backoff for transient failures, permanent errors not retried, expired/stalled job recovery, report/analysis retries never redial                     |
| Ambiguous provider  | Timeout after remote acceptance marks uncertain; restart/retry does not initiate second call; later verified terminal event reconciles safely                      |
| Mock outcomes       | Connected/no-answer/busy/failed deterministic; transcript synthetic; transport spy fails on any network request                                                    |
| Sarvam adapter      | Mocked transport asserts actual verified URL/auth/request/version; response ID persisted; docs webhook accepted; malformed rejected; secret redaction              |
| Reports             | Async status progression, duplicate generation keys, data matches attempts, CSV quoting/formula defenses, XLSX string cell types, cross-tenant download denied     |
| SSE                 | Disconnect, missed-event replay from cursor, refresh and duplicate IDs; tenant isolation; bounded event ordering                                                   |
| Restart             | Worker restart mid-simulation; API restart during SSE; Redis/Postgres restart; recover health and terminal outcomes without duplicate attempts                     |
| Browser flow        | Demo → persona → upload/map/validate → plan/review → simulate → persisted progress → inspector → CSV/XLSX download                                                 |
| Accessibility       | Keyboard navigation/dialog trap/restore/Escape, visible labels/focus, mobile table overflow, reduced motion, state text and error announcement                     |
| Retention/security  | Authenticated deletion/retention path, durable opt-out survives, no secrets/PII in logs or bundle, explicit CORS/origin/cookie settings                            |

Use Vitest 5.0.5 for domain/provider/contract tests (official guide requires Node>=22.12 and Vite>=6.4; selected Node24/Vite8 satisfy). Use Playwright1.64.1 for actual browser/API integration with Chromium installed by npx playwright install --with-deps chromium. Official docs recommend user-facing role/label locators, isolated tests and web-first assertions rather than fixed sleeps. Node24 and Debian12/arm64 are officially supported. A real composed database/Redis integration suite verifies correctness beyond mocks. Record passing counts and exact commands; do not add implementation-mirroring snapshots or broad tests merely to pad coverage.

## Official sources

All accessed 2026-10-24:

- Vitest, Getting Started: https://vitest.dev/guide/ — page5.0.5; Node22.12+/Vite6.4+ and vitest run.
- Vitest official metadata: https://registry.npmjs.org/vitest —5.0.5 engines Node^22.12/^24/>=26 and Vite^6.4/^7/^8.
- Playwright, Installation: https://playwright.dev/docs/intro — supported Node22/24/26, macOS14+, Debian12/13 and arm64; browser/dependency install.
- Playwright, Best Practices: https://playwright.dev/docs/best-practices — user behavior, isolation, locators and web-first assertions.
- Playwright official metadata: https://registry.npmjs.org/@playwright%2ftest —1.64.1 (package minimum Node20; official supported runtime guide is stricter).
- OWASP, CSV Injection: https://owasp.org/www-community/attacks/CSV_Injection — site403 in this environment; official source fallback https://raw.githubusercontent.com/OWASP/www-community/master/pages/attacks/CSV_Injection.md .
- OWASP, Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html — site403; official source fallback https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Authorization_Cheat_Sheet.md .
- W3C WAI APG, Dialog (Modal) Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — keyboard/focus invariants.

Sarvam authentication and event identity remain subject to provider-contract research, not an assumed signature/event ID. Storage retention defaults and calling-window semantics are lead decisions that must be finalized in ADRs and configuration. Any unimplemented matrix item remains an explicit gap in completion evidence.
