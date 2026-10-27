# Outreach Intern V3 — Sarvam Voice Agents & Telephony API Audit

**Document:** `docs/rebuild/research/sarvam-provider-contract.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent C)  
**Author:** Voice Provider & Telephony Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Official Documentation & Protocol Verification

Official Sarvam documentation verified:
- Sarvam Voice Agents Intro: https://docs.sarvam.ai/voice-agents/introduction
- Instant Outbound Call API: https://docs.sarvam.ai/voice-agents/api/instant-outbound/create
- Webhook Payload Contract: https://docs.sarvam.ai/voice-agents/api/instant-outbound/webhook-payload
- Analytics API: https://docs.sarvam.ai/voice-agents/api/analytics/overview
- Pricing: https://docs.sarvam.ai/voice-agents/pricing

---

## 2. Telephony Request/Response Wire Contract

### 2.1 Outbound Call Creation Endpoint
- **URL**: `https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds`
- **Method**: `POST`
- **Headers**:
  ```http
  X-API-Key: <SARVAM_API_KEY>
  Content-Type: application/json
  ```
- **Request Body Payload**:
  ```json
  {
    "app_config": {
      "app_id": "Hindi-Outre-a99e279a-cd0b",
      "app_version": 1,
      "connection_config": {
        "connection_id": "9db47031-ee-ea361551-090c",
        "agent_phone_number": "+918064269408"
      },
      "app_overrides": {
        "initial_language_name": "Hindi"
      }
    },
    "user_config": {
      "user_phone_number": "+919546730793"
    },
    "webhook_config": {
      "url": "https://callingagents.internal/api/v1/webhooks/sarvam/tmyVaabketV9GjeIZDk3_gmQ71OeRYbomP0I2PO98wo",
      "metadata": {
        "localAttemptId": "d3b07384-d113-460b-980b-8041a774b9b4",
        "campaignId": "f74e6451-2495-46aa-b3e1-7ce2fb7fba26"
      }
    }
  }
  ```
- **HTTP 200 Response Payload**:
  ```json
  {
    "attempt_id": "att_9f8391cb27aa49"
  }
  ```
- **Error Responses**:
  - `HTTP 422 Unprocessable Entity`: Validation failure (invalid phone number format, missing connection ID, invalid app ID).
  - `HTTP 429 Too Many Requests`: Concurrency limit reached on telephony trunk. Worker implements exponential backoff.
  - `HTTP 401 / 403`: Authentication or workspace unauthorized.

---

## 3. Webhook Contract & Ingress Safety

### 3.1 Webhook Payload
Upon call completion or terminal failure, Sarvam issues a POST request to the configured `webhook_config.url`:
```json
{
  "attempt_id": "att_9f8391cb27aa49",
  "status": "completed",
  "duration_seconds": 48.5,
  "interaction_id": "int_7a23b9c812ef",
  "failure_reason": null,
  "transcript": [
    {
      "role": "agent",
      "text": "नमस्ते, क्या मैं राहुल से बात कर रहा हूँ?",
      "en_text": "Hello, am I speaking with Rahul?"
    },
    {
      "role": "user",
      "text": "हाँ, मैं राहुल हूँ।",
      "en_text": "Yes, I am Rahul."
    },
    {
      "role": "agent",
      "text": "आपका एक्मे कॉर्प के साथ साक्षात्कार गुरुवार दोपहर दो बजे निर्धारित है। क्या आप उपस्थित हो सकेंगे?",
      "en_text": "Your interview with Acme Corp is scheduled for Thursday at 2 PM. Will you be able to attend?"
    },
    {
      "role": "user",
      "text": "हाँ, मैं जरूर आऊँगा। धन्यवाद।",
      "en_text": "Yes, I will definitely come. Thank you."
    }
  ],
  "extracted_fields": {
    "attendance_confirmed": true,
    "reschedule_requested": false
  },
  "webhook_config": {
    "metadata": {
      "localAttemptId": "d3b07384-d113-460b-980b-8041a774b9b4"
    }
  }
}
```

### 3.2 Webhook Authentication & Deduplication Strategy
- **Limitation Disclosed:** Official Sarvam Voice Agents documentation does **not** specify an HMAC signature header (such as `X-Sarvam-Signature`).
- **Defensible Security Controls Implemented:**
  1. **Unguessable Secret Route Path:** The webhook URL includes a 32-byte cryptographically random base64url token (`/api/v1/webhooks/sarvam/:token`).
  2. **Constant-Time Verification:** Verified using `crypto.timingSafeEqual` against the server-configured `SARVAM_WEBHOOK_TOKEN`.
  3. **Strict Payload Validation:** Ingress payload validated via Zod `SarvamWebhookSchema`.
  4. **Idempotent Webhook Inbox:** Deduplication on `(provider, provider_attempt_id)`. Duplicate events return `200 OK` with `{ duplicate: true }` without corrupting state.
  5. **Outbox Async Processing:** The webhook route only persists to `webhook_inbox` and enqueues an outbox event, preventing slow database work from timing out the provider.

---

## 4. Provider-to-Domain Schema Mapping

| Sarvam Provider Field | Domain Entity | Domain Field | Transformation / Invariant |
| :--- | :--- | :--- | :--- |
| `attempt_id` | `call_attempts` | `provider_attempt_id` | Immutable provider attempt key |
| `status` (`completed`, `no_answer`, `busy`, `failed`) | `call_attempts` | `outcome` | Mapped directly to legal enum values |
| `duration_seconds` | `call_attempts` | `duration_seconds` | Floating point seconds |
| `transcript[].role` | `analyses` | `transcript[].role` | Normalized to `'agent'` \| `'user'` |
| `transcript[].text` | `analyses` | `transcript[].text` | Verbatim language transcript |
| `transcript[].en_text` | `analyses` | `transcript[].enText` | Explicitly labeled as translated English |
| `extracted_fields` | `analyses` | `extracted_fields` | Stored as structured JSONB |
| `webhook_config.metadata.localAttemptId` | `call_attempts` | `id` | Local UUID correlation |

---

## 5. Local Simulation Mode (`MockVoiceProvider`)

To ensure robust CI and zero-cost local developer environments, `MockVoiceProvider` provides complete telephony fidelity without network calls:
- Simulates realistic call duration (150ms default latency, configurable via `MOCK_LATENCY_MS`).
- Uses SHA-256 hash of `localAttemptId` to deterministically yield representative outcomes (`connected` 50%, `no_answer` 25%, `busy` 15%, `failed` 10%).
- Generates realistic bilingual synthetic transcripts (Agent/User turns) with realistic extracted fields.
- Sets `simulated: true` on all records to guarantee simulation records never mix with live analytics.
- **Contract Tests:** Contract test suite verifies both `MockVoiceProvider` and `SarvamVoiceProvider` against recorded HTTP fixture responses.
