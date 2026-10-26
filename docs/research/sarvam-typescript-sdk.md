# Sarvam TypeScript SDK suitability for Outreach Intern

Accessed 2026-10-24. This report responds to the explicit request to use the official Sarvam TypeScript SDK. Findings are based on current official documentation, official npm publication metadata, and the exact published SDK declaration/runtime files. No credentials, paid calls or remote mutations were used. SDK tarballs were initially inspected in a temporary directory. Subsequent authorized implementation pins `sarvamai`1.1.12 for optional model content/summary functionality; the conversation SDK remains uninstalled and no SDK source was modified.

## Conclusion and implementation boundary

The documented official TypeScript SDKs cover model APIs and browser/in-app real-time conversations. **Neither inspected published SDK exposes the Voice Agents instant outbound PSTN operation used by Outreach Intern.** A REST OpenAPI definition for that operation exists, but an official published TypeScript client exposing it was not verified.

The existing `SarvamVoiceProvider` therefore continues using the verified outbound REST contract. This is explicitly an HTTP adapter, not an official SDK adapter. Switching `baseUrl` on the model SDK would retain an unrelated resource path/body/auth scheme; starting `ConversationAgent` creates a WebSocket conversation, not an outbound phone attempt. Neither is a valid substitution.

A supported future use of `sarvamai` would be an explicitly selected server-side model planner/analysis capability, with a separately configured model API key, strict output validation and no authority to launch calls. That is a distinct integration, not evidence of SDK-backed telephony. A useful browser Voice Agents SDK integration would similarly be a separately scoped microphone sandbox with server-side credential proxying. The authorized optional model planner and summary integration is now implemented as described below; browser microphone SDK integration remains outside scope.

## Source register

| Authoritative URL                                                             | Title / artifact                                          | Version / relevant evidence                                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| https://docs.sarvam.ai/api/getting-started/sdks                               | Libraries & SDKs                                          | Official `sarvamai` Python/JavaScript clients; page explicitly belongs to Model APIs                              |
| https://registry.npmjs.org/sarvamai                                           | Official npm metadata                                     | Stable `latest=1.1.12`, published 2026-10-12T11:46:54.955Z; Node >=18                                             |
| https://registry.npmjs.org/sarvamai/-/sarvamai-1.1.12.tgz                     | Published TypeScript SDK                                  | Complete exported resources, constructor/options, generated HTTP clients, authentication and retry implementation |
| https://docs.sarvam.ai/voice-agents/deploy/sdks/web                           | Web SDK: add an AI voice agent to your website            | Official `sarvam-conv-ai-sdk/browser`, ConversationAgent and microphone/WebSocket sessions                        |
| https://registry.npmjs.org/sarvam-conv-ai-sdk                                 | Official npm metadata linked from Voice Agents docs       | Stable `latest=0.0.42`, published 2026-03-30T11:19:16.625Z                                                        |
| https://registry.npmjs.org/sarvam-conv-ai-sdk/-/sarvam-conv-ai-sdk-0.0.42.tgz | Published conversation SDK                                | Browser/default/react-native exports, InteractionConfig, start/stop, signed URL runtime                           |
| https://docs.sarvam.ai/voice-agents/deploy/deploy-with-code                   | Deploy a voice agent with code: API, WebSocket and SDKs   | Distinguishes REST recipes from typed real-time SDKs                                                              |
| https://docs.sarvam.ai/voice-agents/api/introduction                          | Voice Agents API: manage AI voice agents programmatically | REST service scopes and X-API-Key, including instant outbound                                                     |
| https://docs.sarvam.ai/voice-agents/api/instant-outbound/create               | Create outbound call                                      | Existing verified PSTN POST body/response; generated JavaScript snippet is fetch, not a SDK method                |
| https://docs.sarvam.ai/openapi.json                                           | Available APIs                                            | Returns an HTML API index, rather than one combined JSON schema; links `/openapi/voice-agents.json`               |
| https://docs.sarvam.ai/openapi/voice-agents.json                              | API Reference, OpenAPI3.1.0                               | Schema info version1.0.0, 56 paths, `outboundApi_initiateOutboundApi` operation                                   |
| https://docs.sarvam.ai/asyncapi.json                                          | APIs, AsyncAPI2.6.0                                       | Model streaming APIs; no instant outbound SDK binding                                                             |
| https://api.github.com/orgs/sarvamai/repos?per_page=100                       | Public first-party repository index                       | No publicly listed instant-outbound TypeScript client found in inspected organization repositories                |
| https://raw.githubusercontent.com/sarvamai/sarvam-ai-sdk/master/README.md     | AI SDK - Sarvam Provider                                  | Vercel AI SDK provider for chat/STT/TTS; not the Voice Agents outbound SDK                                        |

All sources accessed 2026-10-24. The npm metadata for `sarvamai` advertises repository `https://github.com/sarvamai/sarvam-javascript-sdk`; both that repository API and its main README returned404. This does not invalidate the documented official npm package, but public upstream source was unavailable at that URL. Current published tarball source was inspected instead. Guessed old SDK documentation paths returned404 and were replaced by the current URLs discovered through official navigation; no unavailable page is claimed as read.

## Model SDK: sarvamai1.1.12

Exact published files inspected:

- `dist/cjs/index.d.ts` and package `exports`.
- `dist/cjs/Client.d.ts`, `BaseClient.d.ts`.
- `dist/cjs/auth/HeaderAuthProvider.d.ts` and `.js`.
- `dist/cjs/environments.d.ts`.
- `dist/cjs/api/resources/text/client/Client.js` and related request declarations.
- `dist/cjs/core/fetcher/Fetcher.js`, `makeRequest.js`, `requestWithRetries.js`.
- `dist/cjs/errors/SarvamAIError.d.ts`, `SarvamAITimeoutError.d.ts`.

Supported initialization:

```ts
import { SarvamAIClient } from 'sarvamai';

const client = new SarvamAIClient({
  apiSubscriptionKey: modelApiKey,
  timeoutInSeconds: 10,
  maxRetries: 0,
  fetch: mockedOrNativeFetch,
});
```

This example describes the published model SDK contract; it is not repository application code. Authentication uses `apiSubscriptionKey`, or `SARVAM_API_KEY` environment fallback, and sends `api-subscription-key`. Default environment model base is `https://api.sarvam.ai`; creative base is `/dubbing` and streaming is `wss://api.sarvam.ai`.

All resource getters declared on `SarvamAIClient`: `dubbing`, `documentTranslation`, `text`, `speechToText`, `textToSpeech`, `voiceCloning`, `pronunciationDictionary`, `chat`, `speechToTextJob`, `speechToTextTranslateJob`, `documentIntelligence`, `docAi`, `responses`, `chatCompletion`, `speechToTextStreaming`, `speechToTextTranslateStreaming`, `speechToTextRealtimeStreaming`, `textToSpeechStreaming`, `voiceCloningStreaming`. There is no outbound, campaign or Voice Agents resource. Searching declaration/runtime resources for `attempt_id`, `connection_config` and `outboundApi_initiateOutboundApi` finds no call-initiation contract. Incidental phrases such as “outbound body” in model request documentation are not telephony support.

A verified model call is `client.text.translate(request, requestOptions)`; the published implementation appends `/translate`, sends a model translation request and returns a Promise-like `HttpResponsePromise` with typed response. Model text/client default timeout is60 seconds; per-request `timeoutInSeconds`, `maxRetries`, `abortSignal`, headers and query parameters override client options. The fetch hook is supported in the constructor.

Default `maxRetries=2`. Exact inspected retry helper retries HTTP408/429/5xx with initial1s exponential backoff,20% jitter and60s cap, honoring Retry-After. Its helper does not wrap a thrown network error with a second retry loop, despite the broad documentation description of transient connection retries; behavior must be checked per version. For any future side-effectful adapter, explicitly set `maxRetries:0` rather than assume the defaults are safe.

Errors use `SarvamAIError` (`statusCode`, `body`, `rawResponse`) and `SarvamAITimeoutError`; endpoint clients map HTTP statuses into typed resource exceptions. Do not log `body`/rawResponse because they may carry personal data. These error semantics are model SDK semantics, not verified outbound attempt semantics.

## Real-time Voice Agents SDK: sarvam-conv-ai-sdk0.0.42

Exact published files inspected:

- package export map, `dist/index.d.ts`, `browser.d.ts`, `conversation.d.ts`.
- `dist/types/config.d.ts`, error declarations and package README.
- `dist/conversation.js`, `modules/socket-manager.js`, `voice-agent.js`, `text-agent.js`.

Official browser import:

```ts
import {
  ConversationAgent,
  BrowserAudioInterface,
  InteractionType,
} from 'sarvam-conv-ai-sdk/browser';
```

Constructor options include `apiKey`, `config`, audio interface/callbacks, session callbacks, state/telemetry callbacks, `baseUrl`, platform and `customHeaders`. `InteractionConfig` includes org/workspace/app IDs, user identifier and type, `interaction_type`, input/output sample rates, optional committed `version`, agent variables and initial language/state/message overrides.

`ConversationAgent.start()` starts a microphone/stream conversation. Published runtime performs:

```http
GET https://apps.sarvam.ai/api/app-runtime/orgs/{org_id}/workspaces/{workspace_id}/apps/{app_id}/url
X-API-Key: <key>
```

It expects `{url,reference_id}`, adds session/user parameters and opens the signed WebSocket. It does not call `/api/outbounds/v1/.../outbounds`, does not accept telephony `connection_config` or `user_phone_number`, and does not return an instant-outbound `attempt_id`. A `user_identifier_type:'phone_number'` is a session identifier, not an instruction to dial that number. `InteractionType.CALL` means a streamed voice interaction here.

Declared methods: start/stop, waitForConnect/disconnect, sendAudio/sendText, mute/unmute, isConnected/isMuted, getInteractionId/getState and agent-type inspection. `waitForConnect(timeout)` measures seconds and returnsfalse on timeout; it is not an HTTP dial timeout. The published signed-URL fetch has no constructor transport override, AbortSignal or automatic retry option. Official docs say reconnection is unsupported and signed URLs are single-use: stop and create a new ConversationAgent after a disconnection.

Signed-URL errors include typed rate/auth/forbidden/not-found/server errors; error messages incorporate server error bodies. Published0.0.42 runtime also logs the signed URL and request path using console.log. Those logs are unsuitable for this repository's default token/PII redaction requirements without a separately reviewed integration. No SDK was hand-modified or globally patched to suppress them.

Official docs expressly require keeping keys server-side: browser `apiKey:''` plus a server proxy through `baseUrl`, with optional app authentication via customHeaders. The docs' direct browser-key example must not override this requirement.

## Official outbound OpenAPI and missing SDK binding

`https://docs.sarvam.ai/openapi/voice-agents.json` is the current first-party definition. It declares:

- OpenAPI3.1.0, info version1.0.0.
- POST `/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds`.
- operationId `outboundApi_initiateOutboundApi`.
- required path org/workspace IDs and header `X-API-Key`.
- JSON `OutboundRequest`,200 `OutboundResponse`,422 `HTTPValidationError`.
- Instant Outbound server `https://apps.sarvam.ai/api/outbounds` among several service servers.

Neither npm package exposes that operationId/resource/schema. The multi-service document's global server list must not cause a generated client to dial the first app-authoring base by accident. A locally generated client from this official definition could be a valid separately documented generated REST client, with a pinned generator and explicit service base, but it would not become an official Sarvam published SDK. No generator/client was created or labeled official in this change.

Precise unblock action: obtain a first-party supported TypeScript SDK/version exposing this outbound operation, or decide explicitly to use a locally generated REST client from the official schema. Continue the already verified outbound HTTP adapter meanwhile. Keep all existing consent, explicit launch, tenant/global rate/concurrency, budget, ambiguous-no-redial and webhook safeguards.

## Reproducibility and verification

Tarball SHA512 integrity was recomputed and matches npm publication metadata for both SDKs:

- `sarvamai1.1.12`: `sha512-+H3rX2qgViN15kgGaJua+IDOphqHVXyz+WnHXIUXmNb5CnDK0bemFw1z3FcBjFZz5ELWUNN/oiq3TLcWzdVDgA==`.
- `sarvam-conv-ai-sdk0.0.42`: `sha512-8JfpHNlnTK7OffzjMkTWaOd5GHigtT5KCVd2WqTXicgSApi/y1bv2ZsofHLvaOx+pGvHqUiByVQaoq3WvD1mag==`.

Research did not execute SDK methods or make provider calls. Existing adapter transport/unit tests are rerun separately; no test is claimed to prove a missing SDK implementation works. The research finding led to a separate supported model integration; outbound dialing remains the verified REST adapter.

## Follow-up: optional official model planner research

This section records the lead-requested read-only follow-up before implementation; the subsequent implementation described below adds the SDK dependency and integration, with no paid model calls performed. Sources accessed2026-10-24:

| URL                                                                                                | Title                                              | Verified detail                                                                                    |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| https://docs.sarvam.ai/api-reference/chat/chat-completions-v1                                      | Chat Completion V1                                 | POST `/v1/chat/completions`, model enum, messages, structured response_format, response and errors |
| https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview                           | Chat Completion                                    | V1/V2 split, JSON Schema strict mode, tool calling and response validation                         |
| https://docs.sarvam.ai/api/getting-started/models/sarvam-105b                                      | Sarvam-105B                                        | V1 model IDs, model context/token limits, hybrid reasoning and deprecated Sarvam-M                 |
| https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/how-to/control-the-response-length | How to control the response length with max_tokens | Explicit token cap and length finish reason                                                        |
| https://docs.sarvam.ai/api/getting-started/errors-troubleshooting                                  | Errors & troubleshooting                           | API error classification and safe retry guidance                                                   |

Exact SDK files additionally inspected: `api/resources/chat/client/Client.d.ts`/`.js`, `requests/ChatCompletionsRequest.d.ts`, `CreateChatCompletionResponse`, `Choice`, `ChatCompletionResponseMessage`, `CompletionUsage`, `SarvamModelIds`, `ResponseFormat`, `JsonSchemaDefinition` and request-message declarations.

### Verified smallest supported model surface

Use `SarvamAIClient.chat.completions(request, requestOptions)` with `stream:false` (or omitted), which invokes `https://api.sarvam.ai/v1/chat/completions`. Supported V1 SDK model IDs are exactly `sarvam-105b` and `sarvam-105b-conversations`. Prefer `sarvam-105b` for plan-content proposal. `sarvam-m` is deprecated/unavailable. V2 has other served models but expands the surface unnecessarily and is not needed for this proposal.

```ts
const response = await client.chat.completions(
  {
    model: 'sarvam-105b',
    messages: [
      { role: 'system', content: fixedContentOnlyInstruction },
      { role: 'user', content: JSON.stringify(boundedObjectiveAndPersona) },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    n: 1,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'outreach_plan_content',
        strict: true,
        schema: contentOnlyJsonSchema,
      },
    },
  },
  { timeoutInSeconds: 15, maxRetries: 0, abortSignal },
);
```

These are verified API/SDK field names. The fixed instruction, input bounds, schema name,15s timeout,2048 token cap and content-only business contract are proposed application choices. No key or request should be logged. Initialize the official client with `apiSubscriptionKey`, `maxRetries:0`, optional injected `fetch`; do not reuse the Voice Agents workspace key by assumption. A separate explicit model key and enabled flag are recommended.

Structured Outputs supports `{type:'json_schema',json_schema:{name,schema,strict:true}}`. JSON mode `{type:'json_object'}` guarantees JSON syntax only; application Zod validation remains required even with strict schema. Set `additionalProperties:false` on each object and require the output keys. Tools are unnecessary; omit `tools`/`tool_choice` and do not expose launch/provider functions to the model.

Non-streaming returns `CreateChatCompletionResponse`: `id`, `choices`, `created`, `model`, `object:'chat.completion'`, optional usage (`prompt_tokens`, `completion_tokens`, `total_tokens`). Reply JSON is in `choices[0].message.content`, not reasoning_content or a top-level parsed object. Enforce nonempty choices/content, assistant role, normal completion (`finish_reason:'stop'`), no refusal/tool calls, bounded text, JSON.parse and strict output schema. `length`, filtered/refused response, missing/empty content, malformed JSON or business-invalid output is an actionable safe planner failure. Never count an accepted request as valid content or silently claim a deterministic fallback was produced by the model.

Low temperature and seed do not guarantee deterministic output. The current docs/types disagree about reasoning: overview says V1 low/medium/high and null disables it; the API page's generated enum and SDK1.1.12 `ReasoningEffort` are low/high/max, with inconsistent medium/low defaults, and SDK request declaration does not type null. Avoid guessing or casting around this mismatch: omit reasoning_effort initially, keep bounded tokens/timeout, and handle empty content/length safely. Reasoning tokens count toward completion cap and billing. Do not include reasoning traces in persisted planner content, logs or UI.

V1 endpoint documents400/403/422/429/500; SDK maps typed errors and generic SarvamAIError/SarvamAITimeoutError. Even though a content proposal has no telephony side effect, `maxRetries:0` avoids surprise duplicate model charges. User-requested regeneration can be a separate deliberate request. Retryable infrastructure/rate errors should be classified without logging provider bodies, keys or prompts.

### Proposed safe interface and integration

```ts
type PlanContentInput = {
  objective: string;
  persona: { prompt: string; questions: string[] };
};
type PlanContent = {
  steps: Array<{ name: string; description: string }>;
  questions: string[];
};
interface ContentPlanner {
  propose(input: PlanContentInput, signal?: AbortSignal): Promise<PlanContent>;
}
```

Only steps/questions are model-proposed. Suggested strict bounds: objective3000 characters, persona prompt10000, questions≤20×300, output steps1–8, step name≤100/description≤500, questions≤20×300, reply≤64KiB. Do not send contact phone numbers, imports, transcript, consent records, workspace IDs or secrets for planning. Objective/persona are untrusted content and remain inert even if prompt injection appears.

Application code recomputes eligibility/exclusions and policy/cost from PostgreSQL, supplies all campaign/persona IDs and mode itself, then merges only validated content into the full CampaignPlanSchema. Do not allow the model to propose authoritative eligibility, cost, schedule, budget, consent, suppression, state, identifiers or launch commands. Server-side configured provider selection is separate from launch authorization. Planner failure leaves campaign unlaunched; deterministic fallback is clearly labeled and only used under a documented explicit selection/failure policy.

Metadata should distinguish `deterministic-local` from `sarvam-sdk`, preserve model/package/schema version and safe token counts when available, and retain no raw provider payload or reasoning. Optional post-call model analysis is a separate privacy decision because it sends actual speech-derived data; a content-only planner is the smaller supported SDK integration.

Required acceptance if implemented: actual official SDK with injected mock fetch asserts exact V1 URL/header/body and maxRetries0; valid structured reply parses; malformed/refused/length/empty/unknown keys reject;429/timeout makes one HTTP attempt; default disabled configuration makes zero model calls; generated content cannot mutate IDs/policy/eligibility/launch state; existing mock voice path is unchanged. No implemented SDK feature is claimed until these checks and the configured API/UI path actually run.

## Implemented SDK integration

`packages/voice-provider/src/models.ts` now uses the actual installed `sarvamai`1.1.12. `CampaignContentPlanner.propose({mode,objective,personaPrompt,questions})` returns validated content/provenance; only explicitly configured LIVE planning uses the SDK. SIMULATION and MODEL_PROVIDER=local return the deterministic local content without creating a networked SDK request, even when a model key is present. API orchestration owns snapshot checks and reconstructs authoritative campaign IDs/policy/eligibility/cost after the model call.

`ModelSummaryService.summarize({mode,outcome,transcript,localSummary})` uses the SDK only for LIVE connected attempts with actual nonempty stored transcript. It returns summary text and `summarySource` local/sarvam-sdk, `summaryModel`, and safe `summaryFailureCode`. It never modifies supplied transcript or extracted fields. SDK failure/refusal/truncation/invalid schema retains the truthful local summary with explicit provenance/error metadata. Inputs exceeding60,000 transcript characters stay local. SDK logging is explicitly `{silent:true}`, verified from the installed LogConfig declaration.

Worker summary generation happens outside database transactions. A short database claim uses a unique processing token and timestamp lease to avoid duplicate active summary requests; after SDK response a conditional write rechecks the same token, independent analysis state and retention expiry. Interrupted work can be retried after timeout plus grace; completed/failed work is not resurrected. Expired in-flight work records a safe analysis failure and no new summary. Telephone calls are never repeated by model summary processing.

The generated additive migration `0004_glorious_iron_monger.sql` adds analysis summary_source/model/failure_code and processing_started_at/token, with a source constraint. These are distinct columns, not fabricated business fields in extractedFields.

Configuration is MODEL_PROVIDER=local by default, SARVAM_MODEL_API_KEY separate from the voice workspace key, SARVAM_MODEL_NAME=sarvam-105b, and MODEL_TIMEOUT_MS=10000. SDK calls use maxRetries0 globally and per request, explicit bounded tokens, strict JSON Schema output and injected fetch for tests. No actual model or voice provider call was performed during implementation.

Targeted verification: model SDK15tests, outbound provider11tests and import/export9tests pass (35total), including actual SDK mocked fetch endpoint/header/body, simulation/local/no-transcript guards, malformed/refused/length/tool output, one-attempt429/500/timeout handling, and truthful summary fallback. Database migration applied successfully. Global typecheck and targeted lint passed at integration handoff.
