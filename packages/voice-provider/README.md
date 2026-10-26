# Voice provider boundary

`MockVoiceProvider` performs no HTTP and returns deterministic `connected`, `no_answer`, `busy`, or `failed` terminal events. Scenario input is for the synthetic sandbox/import; otherwise hashing the immutable local attempt ID selects a stable outcome. Only connected simulation produces explicitly synthetic transcript and extracted fields; missing answers remain null.

`SarvamVoiceProvider` uses the verified instant outbound v1 POST and `X-API-Key`; success returns `accepted` with provider attempt ID, separate from callback completion. Vendor fields/authentication stay here and in external shared schemas. `normalizeSarvamWebhook` strips caller number, callback token/URL and raw failure text, preserving actual nullable provider variables and transcript.

Live requires the complete validated server configuration, an authorized destination allowlist, and synthetic=false. Worker additionally checks consent, suppression, calling window, campaign state, rate/concurrency and reservation. No startup/test/plan uses live calls. Timeout, 5xx or invalid 200 is unknown with no POST retry. Read-only analytics reconciliation and active-call termination are not implemented.

No signature or idempotency contract is documented for instant callbacks/create. Operator must explicitly acknowledge HTTPS high-entropy secret-route fallback. This is bearer-route authentication, not a Sarvam signature. API ingress owns constant-time route validation, bounded parsing, correlation and durable inbox; duplicates are harmless and conflicting terminal callbacks audited.

Authoritative current docs and audited contracts: ../../docs/research/sarvam-contract.md and ../../docs/architecture/voice-provider-contract.md (accessed 2026-10-24). Tests use mocked transport only: `npm test -- packages/voice-provider/src/provider.test.ts`.

Live attempts snapshot server configured app ID/version/connection ID in private `provider_config` (no key/caller/token). Local editable persona versions are simulation configurations; changing their prompt does not change the committed Sarvam agent. Operators must configure and test the matching app/version in Sarvam before enabling live. Duration retains fractional seconds; live estimates round actual seconds up to whole60-second pulses, so60.2seconds costs two agent pulses.

A connected live callback with absent duration retains `estimatedCostMinor=null`; no estimated usage entry is fabricated and the prior reservation ledger remains.

Worker enforces the single configured Sarvam organisation globally across tenants with a shared PostgreSQL advisory lock: one in-flight/unknown attempt and20 starts/minute. Unknown attempts block new live dispatch until a verified terminal callback or deliberate operator reconciliation; other Sarvam organisation traffic remains outside local visibility.

A rejected initiation has no provider attempt identifier. Local failed events keep `providerAttemptId=null`; genuine external callbacks still require the documented nonempty attempt ID.

Official TypeScript SDK research (2026-10-24): `sarvamai`1.1.12 supports model APIs; `sarvam-conv-ai-sdk`0.0.42 supports streamed microphone/WebSocket sessions. Neither published package exposes instant outbound PSTN calls. The verified REST adapter remains explicitly HTTP-based. See [SDK suitability and authoritative evidence](../../docs/research/sarvam-typescript-sdk.md); an official outbound SDK binding requires a supported provider package/version, or an explicitly chosen locally generated REST client from the official Voice Agents OpenAPI. The official `sarvamai`1.1.12 model SDK is installed for content suggestions/summary below; no outbound SDK method is invented.

Optional model integration: `CampaignContentPlanner` and `ModelSummaryService` use official `sarvamai`1.1.12 only with MODEL_PROVIDER=sarvam for LIVE campaign content suggestions or connected LIVE call summary. SIMULATION always stays deterministic/local even if a key is configured. SARVAM_MODEL_API_KEY is separate from Voice Agents credentials. Content is strict steps/questions only; summary cannot change extractedFields/transcript, policy, eligibility or launch. Calls use maxRetries0, bounded timeout/tokens and silent SDK logging. Summary errors preserve local text with summarySource/model/failure provenance. API/worker network calls occur outside short database transactions.
