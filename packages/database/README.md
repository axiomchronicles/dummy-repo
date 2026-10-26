# Database package

PostgreSQL is authoritative; Drizzle 0.45.4 and node-postgres provide schema/typed access, with explicit checked-out client transactions for race-sensitive worker/API commands. `src/schema.ts` exports 22 relational tables with tenant composite foreign keys, uniqueness and state checks. No raw phone numbers are seeded. `seedAgentPersonas(client, workspaceId)` initializes five editable, versioned personas for a demo workspace.

Run `npm run db:generate` after schema edits, inspect SQL, then `npm run db:migrate` and `npm run db:seed`. Migration uses a PostgreSQL advisory lock and readiness retries. Serving processes never use schema push. SQL/history are in `migrations/`; migration is repeatable and seed idempotent. Root Compose invokes migration/seed once before apps become ready.

Exports: `db`, `pool`, named tables/`schema`, `transaction`, `enqueueOutbox`, `appendCampaignEvent`, `appendAudit`, `waitForDatabase` and persona seeder. `transaction` keeps all queries on one PoolClient; PostgreSQL statements are bounded15s, lock waits5s and driver queries20s (verified https://node-postgres.com/apis/client, accessed2026-10-24); caller writes state/audit/persisted event/outbox in that transaction. Money is integer minor units, cursor IDs are BIGINT serialized as strings, timestamps UTC.

Imports ≤5 MiB /10,000 rows/50 columns and report bytes ≤20 MiB reside privately in PostgreSQL. API authorization controls reads/downloads. Plans and bounded analyses use validated JSON. No recordings are stored. Worker expires report bytes/transcripts/analysis at configured `RETENTION_DAYS` and removes expired sessions; finished source import bytes/row cells and completed inbox conversation data expire at the same age; contact identity deletion is operator-managed. Expired source correction is unavailable. Suppression remains independent of contacts and import revisions and cannot be cleared by reimport.

Composite UNIQUE constraints are deliberately table constraints, rather than unique indexes created after foreign keys: the selected stable Drizzle Kit generates foreign keys before CREATE INDEX, so index-only tenant uniqueness would fail clean migration. See research/data-model.md for official documentation and stable-package compatibility.

Live attempts snapshot server configured app ID/version/connection ID in private `provider_config` (no key/caller/token). Local editable persona versions are simulation configurations; changing their prompt does not change the committed Sarvam agent. Operators must configure and test the matching app/version in Sarvam before enabling live. Duration retains fractional seconds; live estimates round actual seconds up to whole60-second pulses, so60.2seconds costs two agent pulses.

A connected live callback with absent duration retains `estimatedCostMinor=null`; no estimated usage entry is fabricated and the prior reservation ledger remains.

Analysis SDK summary provenance is stored in summary_source/model/failure_code columns; timestamp/token leases protect concurrent processing and post-request writes recheck retention. Migration0004 is additive. Model output never overwrites authoritative extractedFields/transcript or calling eligibility.
