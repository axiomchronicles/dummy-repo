# Outreach Intern V2 architecture

Research gate closed 2026-10-24 after the lead read all seven reports. Current prompt is authoritative; missing original/V2 documents are recorded in the requirements matrix.

## Boundaries

- `apps/web`: React19/Vite8 operations workspace; Query for remote state, RHF/Zod for forms, Tailwind4/shadcn neutral components and semantic controls. Same-origin `/api` proxy keeps cookies and SSE coherent. No frontend telephony credentials.
- `apps/api`: Nest11 modular HTTP application; authentication/workspace authorization, imports, personas/versions, campaigns/plans/policy actions, read models, webhook ingress, reports/downloads, persisted SSE and health.
- `apps/worker`: separately runnable BullMQ5 process sharing the same domain/contracts/database codebase. Import validation, dispatch, provider reconciliation, analysis, report generation, outbox publication and recovery. No microservice product split.
- `packages/contracts`: Zod4 wire/domain schemas, inferred types, lifecycle transitions and policy utilities. Security-sensitive commands are strict. External provider schemas are distinct from normalized call events.
- `packages/config`: validated server environment. Development-only auth impossible with production configuration; mock is default; live requires explicit complete server configuration and acknowledgement.
- `packages/database`: stable Drizzle0.45/node-postgres, versioned generated migrations, idempotent seed, tenant relational tables, transaction/outbox/audit/event helpers.
- `packages/voice-provider`: network-free deterministic mock, verified Sarvam instant outbound HTTP adapter, normalized accepted/terminal/unknown results.

## Data flow

Browser → session-authenticated tenant API → PostgreSQL transaction (domain state + audit/event + outbox) → outbox publisher → BullMQ → worker claim/recheck → mock or explicitly enabled Sarvam → durable result/inbox transaction → independent analysis/report jobs → persisted events → cursor-replay SSE → API read models/download.

PostgreSQL is authoritative. Redis persists locally with AOF/noeviction but can be rebuilt from database intent. Uncertain live POST is never redialed. Unique campaign-contact attempt and row locks protect local execution; external exactly-once is not claimed. Attempts are separate from outcomes/analysis. Active attempts may finish after campaign pause/cancel because verified Sarvam cancellation support is absent.

## First-slice scope

Development sessions use hashed opaque cookies and workspace membership. New demo identities get isolated workspaces and five editable persona versions; production refuses demo bypass. Imports max5MiB/10,000rows/50columns with explicit region/mapping and row feedback; consent and suppression are durable. Campaigns pin persona versions. Plans use deterministic local rules, no LLM claim. Plan/save are telephony-free. Confirmed simulation runs actual BullMQ jobs and persists synthetic connected/no-answer/busy/failed results.

Bounded import/export bytes are private PostgreSQL artifacts, accessed only through tenant-authorized API routes; no S3/mail/cloud/analytics needed. CSV/XLSX generation is asynchronous and uses canonical joined database state. Retention expiry/deletion behavior must match actual implemented worker tasks, not this design intent.

Compose has PostgreSQL17, Redis7.4, one-shot migrate+seed, API, worker and web. Node24.13.0 Debian slim supports amd64/arm64. Serving processes wait for schema readiness and recover connection loss. API and worker expose independent live/ready health. Apps run nonroot and close resources on SIGTERM.

## Significant reconciliations

Stable Nest11/TS5.9 chosen over blindly latest Nest12/TS7 due documented integration peer drift. Shared Zod native JSON Schema generates explicit OpenAPI3.1; no decorator-only guess. Drizzle stable versions used instead of current RC examples. Node24 replaces research's conservative Node22 recommendation after verified LTS/image/peer evidence. Current user steering replaces the earlier nativeCSS choice with actual Tailwind/shadcn neutral components and open monochrome layouts; the persisted timeline remains instead of an unnecessary workflow canvas. No previous architecture is retained because the folder was empty.

See ADRs, API contracts, queue/recovery contract and provider contract for exact policies. Requirements/test evidence is maintained independently from design intent.

## Verified implementation

The repository now contains the modules/processes above,22 relational tables and five generated migrations.96 current automated cases and a separate fresh-Compose smoke exercise the actual system. Source/inbox conversation/analysis/report retention is implemented; automatic contact identity deletion remains an explicit boundary. StreamsService closes SSE in BeforeApplicationShutdown; normal API restart with active streams preserves persisted replay. Rejected initiation has no vendor attempt identifier; unknown live cost is nullable. See verification and data lifecycle runbooks for exact evidence and retained data.

The optional official sarvamai TypeScript SDK now proposes LIVE campaign content and summarizes connected LIVE transcripts under explicit MODEL_PROVIDER configuration. All simulation remains local regardless of model credentials. Phone calls continue using the verified REST adapter because the published SDKs expose no outbound phone method. Model content cannot supply IDs/eligibility/policy/cost/launch; planning snapshots and short transactions enforce this boundary. Analysis provenance and processing leases are persisted separately from provider transcript/extracted facts. See ADR005 and the SDK research report.
