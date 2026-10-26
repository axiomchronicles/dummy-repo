# Product workflows and domain model

Research owner: Agent A (grouped domain/stack worker). Access date: 2026-10-24. Source: current user implementation prompt and `docs/requirements/requirements-matrix.md`. Reconnaissance found no earlier product blueprint, application, package conventions, or AGENTS.md. No claim about a provider capability is derived from the product prompt. This report defines proposed contracts for the lead synthesis gate; implementation documents must record any narrower first-slice behavior.

## Complete journey and permission boundary

Development onboarding establishes a visibly demo-only identity and membership of a workspace. Production configuration must reject the bypass. An authenticated member can view that workspace's agents, contacts, campaigns, activity, calls, reports, settings, and audit history. Every read/write/download/event replay includes workspace ownership in its database query. Owning a UUID is never authorization. A workspace owner/operator can launch, pause, resume, cancel, edit personas, change consent/suppression, or request exports; read-only members can inspect authorized records. The first local slice may have a single seeded operator, but authorization cannot be omitted.

Five starter personas are editable database records with immutable version snapshots. Selecting a persona captures its version in a campaign plan and each attempt so subsequent edits cannot silently change active calls. A sandbox uses synthetic content and the mock provider only.

Contact import follows upload or synthetic sample selection → CSV/XLSX parsing → column mapping → row validation → correction/revalidation → accepted contacts. Preserve source row indices and actionable reasons. Unknown source region makes non-E.164 phone input invalid rather than inferring a country. Duplicate handling considers normalized number within an import and existing workspace contacts. Consent and durable suppression are separate from uploaded rows; imports cannot restore eligibility after opt-out. Reject untrusted formulas, excessive files/rows/columns, missing mappings, and malformed workbook data. Limits are server enforced and documented.

Campaign creation saves an objective, agent version, imported/selected contacts, schedule/timezone, concurrency, spend cap, and intended execution mode. Planning is a pure telephony-free operation and returns a strict schema containing steps, selected persona, eligible/excluded counts and reasons, cost assumptions, and deterministic local/manual planner provenance when no LLM key exists. Natural-language text, imported data, contact speech, and model output never authorize a call or modify policy.

Plan review and launch are different operations. Launch displays the mode, eligible/excluded counts, timezone/window, concurrency, configured cap, and known/unknown price assumptions. The server requires deliberate launch confirmation, an idempotency key, workspace permission, current policy, and live-provider prerequisites for a live launch. Saving, planning, navigation, or Enter in another form creates no attempts. Simulation also requires an explicit action and is persistently identified as `simulation` on campaigns, attempts, events, reports, and usage. Never mix simulation into live usage/counts.

Dispatch writes/claims a durable local attempt before initiating telephony, then rechecks campaign state, consent, suppression, window, workspace/campaign concurrency, rate limits, and budget reservation. Pause prevents new attempts; it does not assert active calls ended. Cancel invalidates pending dispatch; termination of active calls is requested only when supported by verified provider docs. Accepted provider initiation means only accepted: the provider attempt identifier is persisted and terminal webhook/reconciliation results establish the actual outcome. An uncertain request becomes `unknown` and is never automatically redialed.

A validated webhook is persisted in a durable deduplicating inbox before asynchronous application. Terminal call completion may enqueue analysis; unknown/missing extraction stays null/unknown and synthetic analysis is labeled. Analysis/report retries never dispatch another call. Reports are asynchronous, immutable snapshots with export formats and persisted status/artifacts. CSV and XLSX must escape formulas without mutating stored business data. Downloads require workspace permission. Report regeneration creates a new job/snapshot or explicitly retries a failed existing job, not an implicit call retry.

Persisted campaign events drive live activity and call timelines. An SSE cursor replays missed database events, using stable event ordering; browser reconnect state is shown and the server stream includes only the authorized workspace/campaign. Refresh reconstructs state from PostgreSQL, never from synthetic frontend timers.

## Recommended independent state machines

The precise enum vocabulary is a synthesis decision. These tables provide minimal valid transitions; other transitions are rejected with a consistent domain error. Terminal events arriving twice are idempotent and cannot regress state. Lifecycle and outcome are separate properties.

| Entity           | From                                            | Allowed next state                                         | Guard/effect                                                                     |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Campaign         | `draft`                                         | `planned`, `cancelled`                                     | Plan stores strict validated snapshot; no dial                                   |
| Campaign         | `planned`                                       | `draft`, `running`, `cancelled`                            | Editing invalidates stale plan; confirmed launch only                            |
| Campaign         | `running`                                       | `paused`, `completed`, `cancelled`, `failed`               | Completion only when eligible contacts terminal and no active attempts           |
| Campaign         | `paused`                                        | `running`, `cancelled`, `completed`                        | Resume rechecks policy; active calls may finish while paused                     |
| Campaign         | `completed`, `cancelled`, `failed`              | none                                                       | New execution requires a new campaign; administrative recovery is explicit       |
| Campaign contact | `pending`                                       | `queued`, `excluded`, `cancelled`                          | Review/launch freezes selection; excluded reason persisted                       |
| Campaign contact | `queued`                                        | `calling`, `excluded`, `cancelled`                         | Worker rechecks eligibility; pause leaves queued work pending                    |
| Campaign contact | `calling`                                       | `completed`, `unknown`, `cancelled`                        | Completion reflects call outcome; cancellation requires actual provider evidence |
| Campaign contact | `excluded`, `completed`, `unknown`, `cancelled` | none                                                       | Unknown requires reconciliation/admin review, never automatic redial             |
| Call attempt     | `created`                                       | `dispatching`, `cancelled`, `failed`                       | Unique dispatch claim before network; failed pre-dial policy is safe             |
| Call attempt     | `dispatching`                                   | `accepted`, `completed`, `failed`, `unknown`               | Persist provider ID when present; webhook may race initiation response           |
| Call attempt     | `accepted`                                      | `connected`, `completed`, `failed`, `unknown`, `cancelled` | Accepted is not a successful connection                                          |
| Call attempt     | `connected`                                     | `completed`, `failed`, `unknown`, `cancelled`              | Never claim cancelled unless termination verified                                |
| Call attempt     | `unknown`                                       | `completed`, `failed`, `cancelled`                         | Verified reconciliation only; no transition back to dispatch                     |
| Call attempt     | `completed`, `failed`, `cancelled`              | none                                                       | Immutable terminal result; enrich absent metadata without state regression       |
| Import job       | `uploaded`                                      | `validating`, `cancelled`                                  | Enqueue through outbox                                                           |
| Import job       | `validating`                                    | `ready`, `needs_correction`, `failed`, `cancelled`         | `ready` permits some excluded rows; each rejected row retains reasons            |
| Import job       | `needs_correction`                              | `validating`, `cancelled`                                  | Explicit corrected data revision                                                 |
| Import job       | `failed`                                        | `validating`, `cancelled`                                  | Explicit retry only for recoverable infrastructure faults                        |
| Import job       | `ready`, `cancelled`                            | none                                                       | A fresh corrected upload creates a new revision/job                              |
| Analysis job     | `pending`                                       | `processing`, `cancelled`                                  | Only independently from completed call                                           |
| Analysis job     | `processing`                                    | `completed`, `failed`, `pending`                           | Bounded safe infrastructure retry may return pending                             |
| Analysis job     | `failed`                                        | `pending`, `cancelled`                                     | Explicit retry; never call again                                                 |
| Analysis job     | `completed`, `cancelled`                        | none                                                       | Transcript absence produces unknown fields, not invented values                  |
| Report job       | `pending`                                       | `processing`, `cancelled`                                  | Snapshot scope/mode and idempotency key persisted                                |
| Report job       | `processing`                                    | `completed`, `failed`, `pending`                           | Artifacts committed before completed; safe bounded retry                         |
| Report job       | `failed`                                        | `pending`, `cancelled`                                     | Explicit retry/regeneration, no telephony effect                                 |
| Report job       | `completed`, `cancelled`                        | none                                                       | Authorized download does not regenerate                                          |

Normalized attempt outcome is separately `connected`, `no_answer`, `busy`, `failed`, `unknown`, or `cancelled`; duration, summary, extracted fields, transcript and costs are nullable. A completed attempt with `no_answer` is not a campaign application failure. Campaign failure indicates irrecoverable application execution failure, not an unsuccessful individual connection. An analysis status does not overwrite call status. Financial amounts use explicit currency and integer minor units; unavailable provider price/cost is unknown, never silently zero for live execution. Simulation zero cost is explicitly explained.

## Durable events and concurrency contracts

Recommended event envelope: event ID/cursor, workspace ID, campaign ID, entity kind/ID, event type, occurrence UTC time, `simulation`/`live` mode, schema version, and a safe redacted payload. Event types include campaign planned/launched/paused/resumed/cancelled/completed/failed, import validated, contact excluded/queued, attempt dispatching/accepted/terminal/unknown, analysis completed/failed, report requested/completed/failed, suppression changed, and integration changed. Audit records identify actor and action without storing raw secrets or transcript text.

State change + domain event + outbound job/outbox row commit in one PostgreSQL transaction. Worker claims use row locking/conditional updates and a uniqueness constraint on campaign-contact attempt identity, not merely BullMQ job IDs. Outbox publication is at least once; processing is idempotent. Inbox deduplication uses verified provider identity; do not invent event IDs. Out-of-order callbacks cannot regress terminal state. Concurrent launch idempotency returns one launch result. Provider timeout ambiguity reserves the attempt/budget and enters reconciliation without a second dial.

Campaign timezone governs calling windows, evaluated at dispatch with DST-aware timezone data. UTC persistence avoids machine-local assumptions. Pending window-ineligible work is deferred to the next eligible window, not marked a successful call. Budget checks reserve spend atomically across workers; if no verified maximum price exists, live launch is blocked or uses an explicitly documented conservative reservation policy. Active attempt termination is a provider capability, not an assumed cancellation API.

## Acceptance criteria

- Complete demo from development identity → editable persona → CSV/XLSX validation/correction → local schema-validated plan → explicit simulation → persisted attempt outcomes/SSE replay → authorized accurate CSV/XLSX download.
- Every forbidden transition is tested; duplicate launch/webhook and out-of-order terminal events are idempotent.
- Planning/saving/default startup/tests make zero external voice calls; ambiguous timeout cannot be redialed by retry/restart.
- Two workspaces cannot read, mutate, stream, or download one another's campaigns/contacts/transcripts/reports.
- Pause/cancel races block fresh dispatch, preserve active outcomes, and show accurate termination support.
- Opt-out persists through re-import and is checked again immediately before dispatch.
- Worker/API/Redis/PostgreSQL restarts recover durable work without lost terminal outcomes or duplicate telephony.
- Mock connected/no-answer/busy/failed outcomes are deterministic; absent information remains unknown; exported rows match database snapshots and formulas cannot execute.
- Loading/empty/validation/retryable/terminal error and stream reconnect states are visible and accessible.

## Scope decisions requiring implementation transparency

Original/V2 blueprint files are missing, so do not promise an inferred five-persona business taxonomy, billing model, hosted auth, email notifications, or telephony termination capability. A deterministic planner, one development operator, bounded database-backed artifacts, and local mock outcomes are reversible first-slice choices permitted by the user prompt. A real missing required screen/API must be reported as incomplete, not documented as implemented.

## Final implementation reconciliation

Central graphs live in packages/contracts/src/index.ts. A verified late callback may complete an unknown campaign contact; it never sends that contact back to the queue. Imports can return to uploaded for explicit correction before campaign selection freezes the source. Reports remain completed when artifact bytes expire, with a separate expiry reason. Campaign DELETE retains history through cancellation rather than permanent removal. These choices preserve durable operational history and are tested against actual public interfaces.
