# Data lifecycle and migrations

PostgreSQL owns 22 relational tables: users, sessions, workspaces, memberships, agents, agent_versions, imports, import_rows, contacts, consent_records, suppressions, campaigns, campaign_contacts, call_attempts, attempt_events, analyses, webhook_inbox, outbox, campaign_events, reports, usage_ledger and audit_log.

Stable Drizzle Kit generates versioned SQL/history under `packages/database/migrations`. One-shot migration uses an advisory lock; repeat application is safe. Composite tenant UNIQUE constraints precede foreign keys, avoiding the selected Kit's index-ordering problem. Timestamps are UTC timestamptz; BIGINT event IDs serialize as strings; money uses integer minor units; call duration preserves fractional seconds.

Phone values become E.164 after explicit international input or known-region validation. Consent has an evidence ledger; suppression has a unique workspace/phone identity independent of imports. Synthetic flags and fictional 555-01xx destinations prevent live dispatch. Workspace joins authorize indirect IDs, with composite foreign keys rejecting cross-tenant edges. One attempt per campaign contact, unique provider attempt IDs, terminal inbox deduplication and report request keys protect local idempotency.

## Bounded private artifacts

Imports are limited to 5 MiB, 10,000 rows, 50 columns and 2,000 characters per cell. XLSX archives have a 50 MiB expanded-size and 1,000-entry ceiling. Finished source bytes and row PII are redacted by the worker after RETENTION_DAYS; expired correction returns 410 and requires a new upload. Normalized inbox conversation content is also redacted after retention while deduplication identity remains.

Transcript/extracted analysis and report artifacts expire after the configured period, default 30 days. Expired sessions are removed. Report downloads reject expiry; regeneration creates a new snapshot without a new call. Outcome/audit/event/consent/suppression metadata remains for operational history. Contacts retain operational identity and consent/suppression records; automatic contact deletion and an operator PII deletion UI are not implemented. This is an explicit scope boundary, not a claim of comprehensive legal retention compliance.

No recordings or raw unredacted provider payloads are stored. Private provider app/version snapshots remain server-side; API JSON withholds provider IDs, upload bytes and report bytes. Downloads require workspace authorization.

## Spreadsheet exports

CSV quotes all cells and tab-prefixes risky formula, control and full-width prefixes. XLSX writes explicit string cells with apostrophe protection. Canonical database strings remain unchanged. These are spreadsheet-view exports: protective prefixes can affect generic machine parsers, and spreadsheet save/reopen behavior is not universally controlled. Reports join actual terminal outcomes and stored analysis in stable order; they are not provider invoices.

Migration0004 adds summary source/model/failure metadata and analysis processing lease fields. SDK summary generation occurs outside a database transaction; claim token, expiry and state checks protect the final write. Only summary text can be generated; the original transcript and extracted answers remain provider facts. Simulation and missing/nonconnected transcripts never use the model SDK. A failed model summary retains a truthful local summary plus safe failure provenance.
