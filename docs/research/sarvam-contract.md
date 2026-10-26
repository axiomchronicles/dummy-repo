# Sarvam Voice Agents: verified adapter contract

Accessed 2026-10-24. This is HTTP API research; no Sarvam SDK is needed. Endpoint API version is `v1`; `app_version` is a separately selected committed agent version, not an API version. Sources below were retrieved as current official HTML and the create-page embedded API type definitions were inspected. Page-level `.md` requests in this research process returned HTTP 403; HTML succeeded. No credentials or phone calls were used.

## Authoritative sources

| URL                                                                      | Page title                                                | Inspected contract                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| https://docs.sarvam.ai/voice-agents/introduction                         | Introduction to Sarvam Voice Agents                       | Product documentation entry point                                                                            |
| https://docs.sarvam.ai/voice-agents/api/instant-outbound/create          | Create outbound call                                      | POST path, workspace-key header, complete embedded request types, 200 and 422                                |
| https://docs.sarvam.ai/voice-agents/api/instant-outbound/webhook-payload | Instant outbound call webhook payload                     | Terminal callback schema and connected/unanswered/provider-failure examples                                  |
| https://docs.sarvam.ai/voice-agents/deploy/telephony                     | Phone numbers for AI calling agents: connect or rent      | Connection → number, bring-your-own or rented telephony setup                                                |
| https://docs.sarvam.ai/voice-agents/build/agent/versioning               | Voice agent versioning: test, deploy and roll back        | Draft, committed, deployed configuration versions                                                            |
| https://docs.sarvam.ai/voice-agents/settings/api-key                     | Voice Agents API key: create, rotate and revoke           | Server-side key management                                                                                   |
| https://docs.sarvam.ai/voice-agents/deploy/deploy-with-code              | Deploy a voice agent with code: API, WebSocket and SDKs   | API recipes; production keys stay server-side                                                                |
| https://docs.sarvam.ai/voice-agents/api/analytics/overview               | Voice agent Analytics API: attempts, calls and recordings | Attempts versus interactions, API-key authentication, PII, rate/retry rules                                  |
| https://docs.sarvam.ai/voice-agents/api/analytics/attempts               | List attempts                                             | Read-only lookup exists, but automated ambiguous-call reconciliation requires further adapter implementation |
| https://docs.sarvam.ai/voice-agents/pricing                              | Voice Agents pricing: per-minute rates in INR             | Pulse billing, separate telephony, organisation limits                                                       |

All rows share access date 2026-10-24. These unversioned pages may change; installed implementation must preserve its contract fixtures and recheck before live use.

## Smallest verified live surface

Use individual instant outbound attempts. Local PostgreSQL owns campaign policy, scheduling, dispatch, pause/cancel and progress. Sarvam's separate campaign API would duplicate these controls and is unnecessary for the first slice. The create endpoint accepts a dial and returns an identifier; it does not indicate connection or completion. Local mock simulation must not use Sarvam's paid simulated-test API.

```http
POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds
X-API-Key: <workspace-api-key>
Content-Type: application/json
```

Required path parameters are strings `org_id`, `workspace_id`; encode each path component. `X-API-Key`, not Bearer or `api-subscription-key`, is the documented header for this product.

### Request schema

```ts
{
  app_config: {
    app_id: string,
    app_version: integer >= 1,
    connection_config: {
      connection_id: string,
      agent_phone_number: string
    },
    agent_variables?: Record<string, unknown> | null,
    app_type?: string, // provider default "agent"
    app_overrides?: {
      initial_bot_message?: string | null,
      initial_state_name?: string | null,
      initial_language_name?: LanguageName | null
    } | null
  },
  user_config: { user_phone_number: string },
  webhook_config?: {
    url: string,
    metadata?: Record<string, unknown> | null
  } | null
}
```

`LanguageName` in the embedded API schema: `Bengali`, `Gujarati`, `Kannada`, `Malayalam`, `Tamil`, `Telugu`, `Punjabi`, `Sanskrit`, `Odia`, `Marathi`, `Hindi`, `English`, `Assamese`. The pricing FAQ advertises 11 Indian languages plus English and omits Sanskrit. This disagreement is recorded; the first adapter should omit language overrides and use the verified committed agent configuration rather than claim new language support.

The provider types specify strings for telephone inputs. The application adds E.164 validation, consent, live destination allowlisting and confirmation as its own safeguards. Only server-configured IDs, callback URL and caller number enter `app_config`. Never accept arbitrary vendor configuration or callback URLs from a browser. Send metadata containing local attempt ID for correlation, not personal data or secrets. Optional overrides are not necessary for the first working call.

### Responses and errors

HTTP 200: `{ "attempt_id": "string" }`, required identifier. Persist it with provider `sarvam`, immutable local attempt ID and configuration snapshot. Success means request accepted, awaiting callback.

HTTP 422 documented body: `{ detail?: Array<{loc: Array<string | integer>, msg: string, type: string}> }`. The embedded generated invalid-request example contains `app_version: 0`; this is an error example, not a valid request. No create-page contract defines an idempotency key, retry-safe timeout semantics, start/connected streaming events, or cancellation endpoint. Generic non-200 errors must map to safe status codes without logging vendor body/phone/key. Do not assert every possible vendor error is 422.

### Terminal callback

Sarvam POSTs to the `webhook_config.url` after the attempt completes, including attempts that did not connect.

| Field                    | Verified type / meaning                                      |
| ------------------------ | ------------------------------------------------------------ |
| `attempt_id`             | required string matching create response                     |
| `status`                 | required `connected` / `no_answer` / `busy` / `failed`       |
| `channel_info`           | required object described below                              |
| `duration`               | number or null, seconds; null for unconnected                |
| `interaction_id`         | string or null, linked conversation ID                       |
| `failure_reason`         | string or null; can contain provider text and sensitive data |
| `final_agent_variables`  | object or null, extracted/final variables                    |
| `webhook_config`         | object or null, echoed callback config                       |
| `interaction_transcript` | array or null, actual conversation turns                     |

`channel_info` has required `channel_type: "v2v" | "whatsapp"`, `channel_provider: string`, `agent_phone_number: string`. `webhook_config` has required `url: string` and nullable `metadata: object`. Transcript turns have required `role: "agent" | "user"`, `en_text: string`; text is English, translated if conversation used another language. The prose explicitly labels attempt/status/channel required; other fields are nullable but does not uniformly label requiredness. Parse these other fields as nullable/optional and normalize absent values to null; contract examples include all of them. Bound keys/text/array/body sizes as application ingress policy, distinct from provider requirements.

`connected` is a terminal connection outcome, not proof of objective success. Missing extracted answers remain unknown. Call recording bytes/URLs, summary, original-language transcript, webhook event ID/timestamp and billed cost are not in this callback contract. Analytics can separately return recording audio and transcripts using `interaction_id`; the first adapter need not fetch or promise recording support. Never map arbitrary `failure_reason` into a user-visible/logged failure string; use a safe generic code and retain only an authorized minimum.

## Security and recovery boundary

The inspected create and instant-callback docs do **not** document signature headers, HMAC scheme, webhook authentication headers, source IP ranges, delivery retries or timestamp replay verification. Do not invent a Sarvam signature verifier. A deliberate deployment prerequisite is an HTTPS callback containing a random per-environment secret route token (at least 32 bytes entropy), explicit operator acknowledgement of this security fallback, proxy access-log token redaction, strict bounded schema validation and rate limits. Keep live disabled unless these and the provider/telephony configuration are present. This is application bearer-route protection, not proof of cryptographic provider identity.

Correlate callback provider attempt ID and server-owned local attempt metadata; verify existing pending/unknown local attempt, workspace and configuration before applying. Unknown attempts are quarantined/rejected, not created from callbacks. Store a durable validated inbox before acknowledgement; unique `(provider, provider_attempt_id)` for the documented terminal-only callback makes duplicates harmless. Contradictory terminal repeats must be recorded for review, never overwrite a completed result silently. Outbox queues business processing separately. Redact caller number and callback token before persisted normalized payload; no raw provider payload in general logs.

Outbound POST executes once per local attempt with a bounded HTTP timeout. A timeout, network reset, invalid 200 body, or possible provider 5xx after a request may have been accepted is `unknown`, requiring reconciliation/manual review; it must not automatically dial again. Even without a returned provider ID, metadata may correlate a later callback. Analytics supports read-only attempt listing/filtering; its exact match/reconciliation policy is a follow-up boundary unless fully verified and implemented. Pause/cancel stops pending local dispatch. No verified instant-outbound termination contract exists, so active attempts may finish after cancellation and UI must state this.

## Cost and configuration constraints

Pricing page on access date: pay-as-you-go ₹3.50 per conversation minute, no monthly minimum; each call rounds up to 60-second pulses. Pro/Growth/Business rates ₹3.25/₹3.15/₹3.00 and minimum subscriptions ₹9,999/₹49,999/₹1,99,999. Excludes GST. Telephony is separate: bring-your-own provider bills directly; Sarvam Vobiz ₹0.20 per 30-second pulse; PSTN forwarding ₹0.40, SIP forwarding ₹0.35 per 30-second pulse; rental ₹59 per number/30 days. Unconnected/no-answer/busy/failed calls have no agent/telephony charge; voicemail is connected and billed. A duration-derived estimate is not an invoice and must be labeled an estimate. Reserve conservative estimated cost before dispatch, because the initiation response provides neither duration cap nor billed usage.

Organisation-wide concurrency/start-per-minute limits: PAYG 4/20, Pro 10/50, Growth 30/150, Business 200/800, Enterprise custom. Limits count inbound, campaign and instant attempts together; local application cannot know other organisation traffic. Use configurable conservative local limits, default one live in flight, and do not claim these limits are a free tier. Sarvam simulated tests cost ₹2/run and are unrelated to the free deterministic local mock.

Human setup: create/commit/test an agent in Sarvam, copy app/org/workspace IDs, obtain workspace key, connect or rent an authorized caller number and connection, configure HTTPS ingress and fallback acknowledgement, specify an allowlist of authorized test destinations, enable live server switch, review explicit launch. No documentation establishes test destination ownership or permission for this repository.

## Acceptance criteria

1. Mock adapter has no fetch/network reference and produces deterministic connected/no_answer/busy/failed outcomes and clearly synthetic data.
2. Mocked transport asserts exact URL, X-API-Key and request schema; provider ID remains server-side.
3. Valid connected/unanswered/failed callback examples parse; wrong states/malformed nested fields reject; null transcript/variables remain null.
4. 200 returns accepted, terminal callback alone completes it; duplicate callback does not repeat processing.
5. Timeout and invalid acceptance response become unknown with zero retry POSTs.
6. Default environment, seeds, tests and plan endpoint make zero Sarvam calls. Live rejects incomplete config and unconfirmed/non-allowlisted destinations.
7. Callback token, keys, full phone numbers, transcripts and vendor failure bodies do not appear in normal logs.
