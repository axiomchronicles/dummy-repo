# ADR-004: Telephony Architecture — Sarvam Telephony Contract & Webhook Safety Boundary

**Status:** Accepted  
**Date:** 2026-10-27  
**Context:**  
Sarvam Voice Agents provides outbound telephony via an HTTP REST endpoint (`https://apps.sarvam.ai/api/outbounds/v1/...`). Official documentation does not specify an HMAC signature header on webhook callbacks. Additionally, network timeouts during outbound POST can leave attempt states ambiguous.

**Decision:**
1. Isolate all Sarvam telephony interactions behind a provider-neutral interface (`VoiceProvider`) with two implementations: `MockVoiceProvider` (default for simulation) and `SarvamVoiceProvider` (for live).
2. Protect webhook ingress through:
   - Cryptographically random 32-byte secret route token (`/api/v1/webhooks/sarvam/:token`) compared in constant time.
   - Strict Zod schema validation of ingress JSON payloads.
   - Idempotent inbox table (`webhook_inbox`) with unique constraint on `(provider, provider_attempt_id)`.
3. Safe Timeout Handling: If an outbound POST to Sarvam times out after 20 seconds, the worker marks the attempt as `'unknown'` and routes to the `reconciliation` queue. It will NEVER blindly redial.
4. Local simulation mode remains the system default (`VOICE_PROVIDER=mock`, `LIVE_CALLS_ENABLED=false`). Zero real calls are made during automated tests, Docker Compose startup, or local user simulation.

**Consequences:**
- Defensible, secure webhook processing despite the lack of vendor HMAC signatures.
- Total protection against duplicate dialing during network glitches.
- 100% reproducible local development without paid vendor consumption.
