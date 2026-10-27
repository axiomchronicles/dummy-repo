# Sarvam Voice Agents & Voice Capability Backend Audit

**Audit Date:** 2026-10-26  
**Auditor:** Agent C (Sarvam Agent/Voice Capability and Official-Doc Researcher)  
**Subject:** Exhaustive, read-only audit of Sarvam Voice Agents capabilities, official documentation, and backend integration within the CallingAgents repository.  
**Audited Artifacts:**
- `packages/voice-provider/src/index.ts`
- `packages/voice-provider/src/models.ts`
- `packages/contracts/src/index.ts`
- `packages/config/src/index.ts`
- `apps/api/src/webhooks.ts`
- `apps/api/src/agents.ts`
- `apps/api/src/operations.ts`
- `apps/worker/src/calls.ts`
- `docs/research/sarvam-contract.md`
- `docs/research/sarvam-typescript-sdk.md`
- `docs/architecture/voice-provider-contract.md`
- `docs/architecture/api-contracts.md`
- Official Sarvam Documentation (`https://docs.sarvam.ai`)

---

## 1. Executive Summary & Audit Matrix

This audit evaluates the reality of Sarvam Voice Agents capabilities, their integration in the backend, and the boundaries required for the client application (Flutter UI).

### Key Architectural Findings:
1. **Telephony Call Initiation is Pure REST HTTP**: The backend initiates instant outbound PSTN calls using a direct HTTP `POST` to Sarvam's Outbounds v1 API (`https://apps.sarvam.ai/api/outbounds/v1/...`). It is **not** an official TypeScript SDK method because no official Sarvam TypeScript SDK exposes outbound PSTN calling.
2. **SDK Usage is Strictly Limited to Model Chat Completions**: The official `sarvamai` (v1.1.12) TypeScript SDK is installed and integrated solely for server-side LLM Chat Completions (`client.chat.completions`) using structured JSON Schema outputs for campaign planning proposals and post-call summaries. It has zero telephony capabilities.
3. **No Voice Catalog or Audio Preview API**: Neither Sarvam's Voice Agents public REST API nor our backend provides an endpoint to list agent voices or stream/preview voice audio. Voice selection is baked into the committed agent on the Sarvam dashboard.
4. **No Cryptographic Webhook Signatures**: Sarvam provides no HMAC signature, shared secret header, or replay timestamp on inbound webhooks. Authentication relies strictly on a high-entropy secret path token (`/api/v1/webhooks/sarvam/:token`) with constant-time equality checks and mandatory operational acknowledgment.
5. **Strict Client Isolation**: Sarvam API keys, organization IDs, workspace IDs, and telephony connection IDs are held strictly server-side. The client application receives only sanitized readiness booleans and capability flags via `GET /api/v1/integrations`.

### Capability & Integration Audit Matrix

| Feature / Domain | Official Sarvam Support | Backend Integration Status | Backend Source Citation | Status Label | Flutter UI Mandate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Instant Outbound Dialing** | Supported via REST API (`POST /outbounds`) | Integrated via `SarvamVoiceProvider` | `packages/voice-provider/src/index.ts#L113-L175` | `verified` | Triggered only via backend `/campaigns/:id/launch`. |
| **Outbound PSTN TypeScript SDK** | **None** (neither `sarvamai` nor `sarvam-conv-ai-sdk` supports it) | N/A (Direct HTTP adapter used) | `docs/research/sarvam-typescript-sdk.md#L7-L11` | `missing` | Client must not assume SDK telephony exists. |
| **Model Chat Completions** | Supported via `sarvamai` SDK (v1.1.12) | Integrated via `StructuredModelClient` | `packages/voice-provider/src/models.ts#L51-L132` | `verified` | Optional campaign planning & call summaries. |
| **Real-time Web Audio SDK** | Supported via `sarvam-conv-ai-sdk` (v0.0.42) | **Not integrated** (outside scope) | `docs/research/sarvam-typescript-sdk.md#L69-L103` | `missing` | No in-app mic calling in current backend. |
| **Voice / Speaker Listing API** | **None** in Voice Agents public API | **None** in backend | `apps/api/src/openapi.ts` | `missing` | **No fake voice selector dropdown in UI.** |
| **Voice Audio Preview API** | **None** in Voice Agents public API | **None** in backend | `apps/api/src/openapi.ts` | `missing` | **No fake audio preview player in UI.** |
| **Agent Sandbox** | Paid simulated test in Sarvam (₹2/run) | Local deterministic mock simulation | `apps/api/src/agents.ts#L121-L131` | `verified` | Explicitly label sandbox as synthetic text mock. |
| **Inbound Webhook Signatures** | **None** (no HMAC or signature headers) | Route-bearer secret token verification | `apps/api/src/webhooks.ts#L10-L17` | `verified` | Internal server boundary; transparent to UI. |
| **Active Call Cancellation** | **None** in instant outbound API | `capabilities.termination: false` | `apps/api/src/operations.ts#L266` | `verified` | Warn user that active calls finish even if paused/cancelled. |
| **Call Recording Audio URL** | Analytics API only (not in webhook) | `capabilities.recordings: false` | `apps/api/src/operations.ts#L266` | `verified` | Do not render broken recording playback links. |

---

## 2. Exact Sarvam API Endpoints and SDK Methods Integrated in the Backend

The CallingAgents backend integrates with Sarvam across two completely separate interfaces:
1. Direct REST HTTP requests for telephony (Voice Agents API).
2. The official `sarvamai` TypeScript SDK for structured LLM completions (Model APIs).

### 2.1 REST Outbounds v1 API (`SarvamVoiceProvider`)

- **Endpoint URL:**
  ```http
  POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds
  ```
- **Code Reference:** [`packages/voice-provider/src/index.ts#L142-L153`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L142-L153)
- **Headers:**
  - `X-API-Key: {c.SARVAM_API_KEY}` (inspected Voice Agents workspace key, not Bearer or subscription key)
  - `Content-Type: application/json`
- **Request Body Contract:** Defined by `SarvamRequestSchema` in [`packages/contracts/src/index.ts#L247-L264`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L247-L264):
  ```json
  {
    "app_config": {
      "app_id": "string",
      "app_version": 1,
      "connection_config": {
        "connection_id": "string",
        "agent_phone_number": "+918064269408"
      }
    },
    "user_config": {
      "user_phone_number": "+919546730793"
    },
    "webhook_config": {
      "url": "https://callback.domain/api/v1/webhooks/sarvam/{secret_token}",
      "metadata": {
        "localAttemptId": "10000000-0000-4000-8000-000000000001"
      }
    }
  }
  ```
- **Response Handling:**
  - **HTTP 200 OK:** Parsed by `SarvamResponseSchema` ([`packages/contracts/src/index.ts#L265-L267`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L265-L267)), returns `{ "attempt_id": "string" }`. The provider returns `{ kind: 'accepted', providerAttemptId: parsed.data.attempt_id }` ([`packages/voice-provider/src/index.ts#L167-L170`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L167-L170)).  
    *Critical Rule:* Acceptance is **not** completion. It merely acknowledges that the provider queued the call attempt.
  - **HTTP 422 Unprocessable Entity:** Validation failure (e.g., malformed phone number, invalid app/connection ID). Mapped to `{ kind: 'rejected', failureCode: 'PROVIDER_REJECTED' }` ([`packages/voice-provider/src/index.ts#L154-L161`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L154-L161)). Raw error bodies are never logged to prevent PII leakage.
  - **HTTP 429 Rate Limited:** Mapped to `{ kind: 'rejected', failureCode: 'PROVIDER_RATE_LIMITED' }` ([`packages/voice-provider/src/index.ts#L158-L160`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L158-L160)).
  - **Ambiguous Outcomes (Timeout / 5xx / Network Reset):** If an HTTP request times out or returns non-200/4xx, the provider returns `{ kind: 'unknown', failureCode: 'PROVIDER_ACCEPTANCE_UNCERTAIN' | 'PROVIDER_REQUEST_UNCERTAIN' }` ([`packages/voice-provider/src/index.ts#L163-L173`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L163-L173)).  
    *Critical Safeguard:* **Zero automated redials.** Because the provider might have actually placed the call before disconnecting, the system marks the attempt `unknown` and awaits reconciliation or manual operator review.

---

### 2.2 Official Model SDK (`sarvamai` v1.1.12) Chat Completions

- **Package:** `sarvamai@1.1.12` installed as dependency in `packages/voice-provider/package.json`.
- **SDK Import:** [`packages/voice-provider/src/models.ts#L3`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L3):
  ```ts
  import { SarvamAIClient, SarvamAIError, SarvamAITimeoutError } from 'sarvamai';
  ```
- **Initialization:** [`packages/voice-provider/src/models.ts#L65-L71`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L65-L71):
  ```ts
  const client = new SarvamAIClient({
    apiSubscriptionKey: this.config.SARVAM_MODEL_API_KEY,
    fetch: this.transport,
    maxRetries: 0,
    timeoutInSeconds: this.config.MODEL_TIMEOUT_MS / 1000,
    logging: { silent: true },
  });
  ```
- **SDK Method Called:** `client.chat.completions(params, options)` ([`packages/voice-provider/src/models.ts#L73-L94`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L73-L94)):
  - Target URL: `POST https://api.sarvam.ai/v1/chat/completions`
  - Model: `sarvam-105b` (or `sarvam-105b-conversations`)
  - Parameters: `temperature: 0.2`, `max_tokens: 2048`, `n: 1`, `stream: false`
  - Response Format: `{ type: 'json_schema', json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } }`
- **Integrated Capabilities:**
  1. **Campaign Content Planner (`CampaignContentPlanner.propose`)** ([`packages/voice-provider/src/models.ts#L133-L189`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L133-L189)):
     - Proposes conversation steps and questions during campaign planning (`POST /api/v1/campaigns/:id/plan`).
     - **Simulation & Local Provider Guard:** When `mode === 'simulation'` or `MODEL_PROVIDER === 'local'`, the SDK is completely bypassed and deterministic local steps/questions are returned ([`packages/voice-provider/src/models.ts#L144-L171`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L144-L171)).
     - Untrusted input sanitization: Objective and persona prompts are bounded; contact lists, phone numbers, and secrets are never sent to the model.
  2. **Post-Call Model Summary Service (`ModelSummaryService.summarize`)** ([`packages/voice-provider/src/models.ts#L190-L246`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.ts#L190-L246)):
     - Runs asynchronously in worker queue for connected live calls with non-empty transcripts.
     - Generates structured summary text with provenance: `summarySource: 'sarvam-sdk'` vs `'local'`, `summaryModel: 'sarvam-105b'`, and `summaryFailureCode`.
     - Transcript inputs exceeding 60,000 characters stay local.

---

### 2.3 Conversational Web SDK (`sarvam-conv-ai-sdk`) Status

- **Status:** **Not installed, not integrated.**
- **Investigation Finding:** Published package `sarvam-conv-ai-sdk` (v0.0.42) provides `ConversationAgent` for browser/in-app WebSockets with microphone audio ([`docs/research/sarvam-typescript-sdk.md#L69-L103`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-typescript-sdk.md#L69-L103)). It calls `GET https://apps.sarvam.ai/api/app-runtime/orgs/{org_id}/workspaces/{workspace_id}/apps/{app_id}/url` to get a signed WebSocket URL.
- **Why It Is Not Used for Telephony:** It establishes an in-browser audio session; it **cannot** dial phone numbers or connect to PSTN networks. It is completely inapplicable to the backend's automated phone outreach mission.

---

## 3. Conceptual Disambiguation: Persona vs Agent ID vs Version vs Voice vs Telephony vs Campaign

A critical source of UI and architectural confusion is conflating local CRM/persona concepts with Sarvam platform constructs. The table and sections below establish rigorous boundaries.

| Concept | System Layer | Identifiers / Schema | Mutability | Role & Lifecycle |
| :--- | :--- | :--- | :--- | :--- |
| **App Persona** | Local PostgreSQL (`agents`, `agent_versions`) | `id: UUID`, `name: string`, `current_version: int` | User-editable in UI | Defines business instructions, questions to collect, and persona metadata. Pinned to campaigns. |
| **Sarvam Agent ID (`app_id`)** | Sarvam Platform (`indus.sarvam.ai`) | String UUID / App Slug (`SARVAM_APP_ID`) | Configured once in `.env` | The underlying AI agent deployed on Sarvam. Contains the prompt, model, tools, and voice baked into Sarvam. |
| **Local Agent Version** | Local PostgreSQL (`agent_versions`) | `version: 1, 2, 3...` | Immutable once created | Snapshotted when editing an App Persona. Pinned into `campaigns.agent_version_id` so live campaigns cannot change mid-flight. |
| **Sarvam Agent Version** | Sarvam Platform (`indus.sarvam.ai`) | `app_version: 1, 2...` (`SARVAM_APP_VERSION`) | Committed in Sarvam dashboard | The committed release of the Sarvam Agent. Pinned via server environment variable. |
| **Voice / Speaker** | Sarvam Platform Agent Config | Internal Sarvam Model Name (e.g., Bulbul, Meera) | Baked into committed Sarvam Agent | **Not configurable via outbound API.** The outbound API cannot change or select the speaker dynamically. |
| **Language Override** | Sarvam Outbound Request Body | `app_overrides.initial_language_name` | Optional in Sarvam API; **omitted in backend** | Sarvam allows overriding the starting language. Backend deliberately omits this to rely on the committed Sarvam agent. |
| **Telephony Connection** | Sarvam Telephony Platform | `connection_id: string`, `agent_phone_number: E.164` | Configured once in `.env` | The rented or BYOT SIP trunk and caller ID registered in Sarvam Samvaad. |
| **Campaign** | Local PostgreSQL (`campaigns`, `campaign_contacts`) | `id: UUID`, `mode: 'simulation' \| 'live'` | Managed locally in database | Orchestrates contacts, calling windows, budget caps, concurrency, and dispatch. Does not use Sarvam Campaign API. |

### Deep-Dive Analysis of Distinctions:

#### 1. App Persona vs Sarvam Agent ID (`app_id`)
- An **App Persona** is an application-level entity (`AgentSchema` in [`packages/contracts/src/index.ts#L430-L441`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L430-L441)). A workspace can have dozens of personas (e.g., "Customer Discovery", "Appointment Coordinator").
- A **Sarvam Agent ID** (`SARVAM_APP_ID` in [`packages/config/src/index.ts#L38`](file:///Users/kuroyami/CallingAgents/packages/config/src/index.ts#L38)) is a single vendor agent configured at the server level.
- **Architectural Fact:** Creating or editing a Persona in the UI does **not** create a new agent on Sarvam! The backend uses the statically configured `SARVAM_APP_ID` for all live calls ([`packages/voice-provider/src/index.ts#L128`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L128), [`apps/worker/src/calls.ts#L304`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L304)).

#### 2. Local Version vs Sarvam Agent Version (`app_version`)
- When an operator edits a persona via `PATCH /api/v1/agents/:id` ([`apps/api/src/agents.ts#L62-L120`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L62-L120)), the backend writes a new row to `agent_versions` with an incremented integer version.
- This local version governs local prompt planning and simulation.
- As documented in [`docs/architecture/voice-provider-contract.md#L16-L17`](file:///Users/kuroyami/CallingAgents/docs/architecture/voice-provider-contract.md#L16-L17):  
  *"The outbound endpoint selects a committed Sarvam app/version; it does not expose a general prompt override. Local editable persona versions organize campaign planning and simulation. A matching Sarvam deployment must be configured before those edits govern real conversation behavior."*

#### 3. Voice / Speaker Selection Reality
- On Sarvam's platform, voice and speaker are chosen in the visual agent canvas when authoring the agent.
- The instant outbound REST API ([`docs/research/sarvam-contract.md#L36-L58`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-contract.md#L36-L58)) provides **no field** for voice ID, speaker gender, or voice model.
- Therefore, the voice cannot be modified per-campaign or per-call via API.

#### 4. Language Override Reality
- Sarvam's API supports an optional `app_overrides.initial_language_name` ([`docs/research/sarvam-contract.md#L47-L51`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-contract.md#L47-L51)).
- However, our production backend `SarvamVoiceProvider` deliberately passes `app_overrides: undefined` ([`packages/voice-provider/src/index.ts#L126-L140`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L126-L140)) to ensure live execution strictly adheres to the tested, committed configuration in Sarvam without runtime language divergence.

#### 5. Local Campaign vs Sarvam Campaign API
- Sarvam offers a proprietary "Campaign API" in its dashboard. Our backend **does not use it** ([`docs/research/sarvam-contract.md#L24`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-contract.md#L24)).
- Local PostgreSQL and BullMQ worker own contact suppression, calling windows, consent verification, concurrency limiting, and pacing. Sarvam is invoked strictly per-call as a dumb outbound dialer.

---

## 4. Official Sarvam Voice Agents Documentation Audit

Audit of official Sarvam documentation (`https://docs.sarvam.ai`) across three delivery tiers:

### 4.1 Public REST API (`https://docs.sarvam.ai/openapi/voice-agents.json`)
- **Version:** OpenAPI 3.1.0, info version 1.0.0.
- **Telephony Operation:** `POST /v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds` (`outboundApi_initiateOutboundApi`).
- **Telemetry & Analytics:** `GET /v1/orgs/{org_id}/workspaces/{workspace_id}/attempts` and `GET .../interactions`. Allows listing historical attempts.
- **Omissions in Public API:**
  - No instant outbound call termination endpoint.
  - No call recording binary/stream download in callback (analytics interaction ID must be queried separately).
  - No voice catalog query endpoint.
  - No webhook signature verification scheme.

### 4.2 Sarvam Dashboard (`indus.sarvam.ai` / Samvaad)
- **Role:** Interactive web UI for human operators.
- **Capabilities:**
  - Visual conversation flow editor, state machine configuration, system prompts, knowledge base ingestion.
  - Speaker selection: Allows choosing voice models (e.g., Bulbul v1/v2, Meera, Arvind) across 11 Indian languages + English.
  - Telephony management: Rented DID numbers (₹59/month) or SIP trunking setup.
  - Agent versioning: Committing draft changes into immutable `v1`, `v2`, etc.

### 4.3 TypeScript SDKs (`sarvamai` and `sarvam-conv-ai-sdk`)
- **`sarvamai` (Model APIs SDK):**
  - Includes clients for: `chat`, `dubbing`, `speechToText`, `textToSpeech`, `translation`.
  - Exposes zero telephony methods. Searching package exports for `outbound`, `connection_id`, or `attempt_id` yields zero matches ([`docs/research/sarvam-typescript-sdk.md#L61-L62`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-typescript-sdk.md#L61-L62)).
- **`sarvam-conv-ai-sdk` (Conversational AI SDK):**
  - Focuses entirely on real-time browser microphone streaming (`ConversationAgent`).
  - Lacks PSTN phone dialing capabilities.

---

## 5. Voice Catalog & Audio Preview Reality: Audit & Status Labels

A critical question for client UI design is whether users can browse voices or listen to audio previews.

### Status Evaluations:

1. **Official Voice Agents Public Voice Catalog API:** **`missing`**  
   - Sarvam's Voice Agents OpenAPI specification has no endpoint to list voices, fetch speaker metadata, or query available timbres for calling agents.
2. **Official Model API TTS Voices:** **`unverified`**  
   - Sarvam's Model APIs documentation (`POST https://api.sarvam.ai/text-to-speech`) accepts speaker names (e.g., `meera`, `pavithra`, `arvind`, `amartya`), but these are standalone TTS models. Whether these exact voices correspond 1:1 with Voice Agents agents is unverified and not exposed by the Voice Agents API.
3. **Backend Voice Catalog Endpoint:** **`missing`**  
   - The backend exposes **no** `/voices`, `/agents/voices`, or `/integrations/voices` endpoint.
4. **Backend Audio Preview Endpoint:** **`missing`**  
   - The backend exposes **no** `/voices/:id/preview`, `/audio/preview`, or TTS streaming endpoint.
5. **Backend Agent Sandbox Reality:** **`verified` (Synthetic Text Only)**  
   - Calling `POST /api/v1/agents/:id/sandbox` ([`apps/api/src/agents.ts#L121-L131`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L121-L131)) runs `new MockVoiceProvider().initiate(...)`.
   - It returns a mock outcome (`connected`), duration (42s), and synthetic text turns:
     - Agent: `"SIMULATION: This is a synthetic outreach conversation."`
     - User: `"SIMULATION: I am interested in learning more. Please follow up."`
   - It produces **zero audio data**.

### Direct UI Mandate:
> [!IMPORTANT]
> **No Fake Voice Selectors or Audio Players:**  
> The Flutter client **must not** render a voice dropdown selector (e.g., "Choose Voice: Bulbul, Meera, Arvind") or an audio playback button on the Agent Persona screen. Since the backend cannot list voices, change voices, or preview voice audio, implementing such UI controls would be faking capabilities and misleading the user.

---

## 6. Inbound Webhook Structure, Signature/Auth Verification Facts

### 6.1 Webhook Delivery & Authentication Facts
- **Endpoint Route:** `POST /api/v1/webhooks/sarvam/:token` ([`apps/api/src/controllers.ts#L384-L389`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L384-L389), [`apps/api/src/webhooks.ts#L10-L102`](file:///Users/kuroyami/CallingAgents/apps/api/src/webhooks.ts#L10-L102)).
- **Cryptographic Signature Reality:** Sarvam provides **no** webhook signature headers (no HMAC-SHA256, no asymmetric signatures, no delivery timestamps) ([`docs/research/sarvam-contract.md#L91-L94`](file:///Users/kuroyami/CallingAgents/docs/research/sarvam-contract.md#L91-L94)).
- **Security Fallback (Route-Bearer Authentication):**
  - When initiating a call, the backend provides a unique webhook URL containing a high-entropy secret token: `${c.SARVAM_WEBHOOK_BASE_URL}/api/v1/webhooks/sarvam/${c.SARVAM_WEBHOOK_TOKEN}` ([`packages/voice-provider/src/index.ts#L137`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L137)).
  - The token must contain at least 32 bytes of entropy (`packages/config/src/index.ts#L98-L101`).
  - Inbound requests are verified using constant-time string comparison:  
    `timingSafeEqual(Buffer.from(token), Buffer.from(expected))` ([`apps/api/src/webhooks.ts#L15`](file:///Users/kuroyami/CallingAgents/apps/api/src/webhooks.ts#L15)). Mismatches immediately return HTTP 404.
  - Live execution is strictly blocked unless the operator acknowledges this lack of vendor signatures via `SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED=true` ([`packages/config/src/index.ts#L102-L103`](file:///Users/kuroyami/CallingAgents/packages/config/src/index.ts#L102-L103)).

### 6.2 Webhook Payload Schema
The webhook payload is parsed by `SarvamWebhookSchema` in [`packages/contracts/src/index.ts#L268-L300`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L268-L300):

```ts
export const SarvamWebhookSchema = z.object({
  attempt_id: z.string().min(1).max(200),
  status: z.enum(['connected', 'no_answer', 'busy', 'failed']),
  channel_info: z.object({
    channel_type: z.enum(['v2v', 'whatsapp']),
    channel_provider: z.string().max(200),
    agent_phone_number: z.string().max(30),
  }),
  duration: z.number().nonnegative().nullable().optional(),
  interaction_id: z.string().max(200).nullable().optional(),
  failure_reason: z.string().max(2000).nullable().optional(),
  final_agent_variables: z.record(z.string(), z.unknown()).nullable().optional(),
  webhook_config: z.object({
    url: z.string().max(2000),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  }).nullable().optional(),
  interaction_transcript: z.array(z.object({
    role: z.enum(['agent', 'user']),
    en_text: z.string().max(20000),
  })).max(1000).nullable().optional(),
});
```

### 6.3 Normalization & Storage Safeguards
- **Normalization:** `normalizeSarvamWebhook` in [`packages/voice-provider/src/index.ts#L89-L112`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L89-L112) converts the vendor payload to `NormalizedCallEvent`:
  - `status` maps directly to `outcome` (`connected`, `no_answer`, `busy`, `failed`).
  - `channel_info` and phone numbers are stripped to minimize PII.
  - `failure_reason` is discarded; vendor failure text is normalized to generic safe code `PROVIDER_FAILED` ([`packages/voice-provider/src/index.ts#L103`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/index.ts#L103)).
  - `interaction_transcript` extracts only `{ role, text: turn.en_text }`. (Notice: Sarvam provides English-translated transcripts, not vernacular audio/text).
- **Deduplication:** The payload is stored in `webhook_inbox` with unique index `(provider, provider_attempt_id)`.
  - Duplicate callbacks return `{ accepted: true, duplicate: true }` without updating records ([`apps/api/src/webhooks.ts#L68-L82`](file:///Users/kuroyami/CallingAgents/apps/api/src/webhooks.ts#L68-L82)).
  - If a duplicate callback arrives with a *conflicting* outcome, the conflict is recorded in `audit_log` (`webhook.contradictory_terminal`) and the original terminal outcome is preserved.
- **Asynchronous Reconciliation:** Webhook ingestion only writes to `webhook_inbox` and enqueues an outbox task. Actual database updates occur asynchronously in BullMQ worker `processReconciliation` ([`apps/worker/src/calls.ts#L419-L436`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L419-L436)).

---

## 7. Boundaries, Security, and Truth-Telling UI Representation

### 7.1 Security & Credential Isolation Boundary
- **Zero Vendor Keys on Client:** Neither `SARVAM_API_KEY` nor `SARVAM_MODEL_API_KEY` is ever transmitted to the Flutter client.
- **Session Authentication:** The Flutter client communicates exclusively with the backend API using HttpOnly session cookies (`outreach_session`) or Bearer tokens.
- **Sanitized Integrations Readout:** The client queries `GET /api/v1/integrations` ([`apps/api/src/operations.ts#L259-L282`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L259-L282)) to determine provider status:
  ```json
  {
    "provider": "mock",
    "simulationReady": true,
    "liveReady": false,
    "liveEnabled": false,
    "missingConfiguration": [
      "SARVAM_API_KEY",
      "SARVAM_ORG_ID",
      "SARVAM_WORKSPACE_ID",
      "SARVAM_APP_ID",
      "SARVAM_APP_VERSION",
      "SARVAM_CONNECTION_ID",
      "SARVAM_AGENT_PHONE_NUMBER",
      "SARVAM_WEBHOOK_BASE_URL_HTTPS",
      "SARVAM_WEBHOOK_TOKEN_32_BYTES_ENTROPY",
      "SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED",
      "LIVE_DESTINATION_ALLOWLIST"
    ],
    "capabilities": {
      "termination": false,
      "recordings": false
    },
    "webhookSecurity": "Acknowledged high-entropy HTTPS bearer route; no provider signature documented",
    "costNote": "Live spend is a configured estimate; provider invoice may differ",
    "planner": {
      "provider": "local",
      "configurationReady": true,
      "model": null,
      "simulationProvider": "local",
      "requiresLiveCampaign": true
    }
  }
  ```

---

### 7.2 Truthful UI Representation Rules for Flutter Client

To maintain documentation integrity and avoid misleading the user, the Flutter UI must adhere strictly to these principles:

#### 1. Truthful Agent / Persona Management
- **What UI Should Display:**
  - Persona Name, Description, System Prompt/Instructions, and Target Questions to answer.
  - Version indicator (e.g., `v1`, `v2`, `v3`) with link to local version history (`GET /api/v1/agents/:id/versions`).
  - Clear notice: *"Personas govern local campaign planning and synthetic simulations. Live voice agents are linked to the server-configured Sarvam deployment."*
- **What UI Must NOT Display:**
  - **No Voice Dropdown / Pitch / Tone Sliders:** Do not show dropdowns for "Bulbul", "Meera", "Arvind" or voice speed sliders. Voice is immutable and fixed in the Sarvam dashboard.
  - **No Live Audio Preview Button:** Do not show an audio preview player.

#### 2. Truthful Sandbox Testing
- The Persona sandbox button executes `POST /api/v1/agents/:id/sandbox` ([`apps/api/src/agents.ts#L121-L131`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L121-L131)).
- The UI must display the result as a **Synthetic Text Simulation** (mock outcome and text transcript turns).
- It must clearly indicate that sandbox tests **never make phone calls** and **do not produce audio**.

#### 3. Truthful Active Call Termination Handling
- Sarvam does not provide an instant outbound call termination API (`capabilities.termination: false`).
- If an operator pauses or cancels a running campaign via `POST /api/v1/campaigns/:id/pause` or `/cancel`, the UI must state:  
  **"Active calls may continue until completion."**  
  The backend contracts explicitly expose `activeCallsMayContinue: true` on `CampaignSchema` ([`packages/contracts/src/index.ts#L496`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L496)) for this reason.

#### 4. Truthful Call Outcome & Recording Representation
- In call attempt inspection (`GET /api/v1/calls/:id`):
  - Display transcript turns (`agent` and `user` speech text).
  - Display extracted agent variables / answers.
  - **Do NOT render a broken audio player:** The webhook does not deliver call audio recordings (`capabilities.recordings: false`). The UI must not display an audio waveform or "Play Recording" button.

#### 5. Truthful Cost Display
- Backend estimates call costs at ₹3.50 per 60-second pulse for connected live calls ([`apps/worker/src/calls.ts#L96`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L96)).
- The UI must label all monetary values as **"Estimated Cost"** and include the disclaimer:  
  *"Live spend is a configured estimate; provider invoice may differ."*

#### 6. Truthful Integrations Status
- On the Settings / Integrations screen:
  - Render the active voice provider (`Mock` vs `Sarvam Voice Agents`).
  - If `liveReady: false`, display the list of missing environment configurations directly from `missingConfiguration` so the operator knows exactly what server variables are missing.
  - State clearly that live mode requires complete server-side configuration, destination allowlists, and operator confirmation.

---

## 8. Verification Evidence & Test Artifacts

The contracts and behaviors documented in this report are verified by active automated test suites:

1. **Voice Provider Test Suite** ([`packages/voice-provider/src/provider.test.ts`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/provider.test.ts)):
   - Verifies `MockVoiceProvider` produces `connected`, `no_answer`, `busy`, `failed` without network access (Lines 26-51).
   - Verifies `SarvamVoiceProvider` sends exact URL, `X-API-Key`, and schema, and that acceptance is not completion (Lines 52-83).
   - Verifies ambiguous timeouts, invalid 200 responses, and 500 errors produce `unknown` status with **zero redials** (Lines 84-105).
   - Verifies webhook normalization drops private provider failure strings and phone numbers (Lines 127-148).
2. **Model SDK Test Suite** ([`packages/voice-provider/src/models.test.ts`](file:///Users/kuroyami/CallingAgents/packages/voice-provider/src/models.test.ts)):
   - Verifies `sarvamai` SDK calls `https://api.sarvam.ai/v1/chat/completions` with `api-subscription-key` and strict JSON Schema output (Lines 59-100).
   - Verifies simulation and local provider modes bypass network transport (Lines 102-120).
   - Verifies invalid outputs or timeouts fall back cleanly to truthful local summaries.
3. **Security Integration Test Suite** ([`tests/integration/api-security.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/api-security.test.ts)):
   - Verifies unauthorized or forged webhook tokens return HTTP 404 (Lines 230-260).
4. **Recovery Integration Test Suite** ([`tests/integration/recovery.test.ts`](file:///Users/kuroyami/CallingAgents/tests/integration/recovery.test.ts)):
   - Verifies webhook reconciliation, duplicate webhook idempotency, and contradictory terminal status audit logging.
