# Environment reference

`.env.example` contains safe local values and commented live placeholders. Server configuration is validated with Zod. Validation errors name variables without revealing their values. API commands reject unknown security-sensitive fields.

| Variable                                      | Default or purpose                                               |
| --------------------------------------------- | ---------------------------------------------------------------- |
| NODE_ENV                                      | development locally; production forbids demo auth                |
| DEV_AUTH                                      | true locally; production true causes startup failure             |
| DATABASE_URL                                  | Host template uses port 5442; Compose overrides to postgres:5432 |
| REDIS_URL                                     | Host template uses port 6389; Compose overrides to redis:6379    |
| API_PORT, WORKER_PORT, WEB_PORT               | 3000, 3001, 5173; host mappings configurable                     |
| POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB | outreach, local only                                             |
| POSTGRES_PORT, REDIS_PORT                     | 5442 and 6389                                                    |
| PUBLIC_BASE_URL                               | http://localhost:5173                                            |
| ALLOWED_ORIGINS                               | Comma-separated mutation origins; fallback PUBLIC_BASE_URL       |
| VOICE_PROVIDER                                | mock; sarvam requires explicit selection                         |
| LIVE_CALLS_ENABLED                            | false; complete live configuration required when true            |
| MOCK_LATENCY_MS                               | 150; accepted range 0–10000                                      |
| PROVIDER_TIMEOUT_MS                           | 10000; accepted range 1000–60000                                 |
| RETENTION_DAYS                                | 30; accepted range 1–365                                         |
| SESSION_TTL_HOURS                             | 24; accepted range 1–168                                         |
| API_PROXY_TARGET                              | Optional Vite proxy; http://localhost:3000                       |
| API_INTERNAL_URL                              | Static web proxy; Compose sets http://api:3000                   |
| API_URL, WEB_URL                              | Test addresses; localhost:3000 and localhost:5173                |

## Live configuration

Set both VOICE_PROVIDER=sarvam and LIVE_CALLS_ENABLED=true after configuring:

- SARVAM_API_KEY: workspace API key.
- SARVAM_ORG_ID and SARVAM_WORKSPACE_ID: authorized provider identifiers.
- SARVAM_APP_ID and SARVAM_APP_VERSION: the committed provider app/version.
- SARVAM_CONNECTION_ID and SARVAM_AGENT_PHONE_NUMBER: authorized telephony connection and E.164 caller.
- SARVAM_WEBHOOK_BASE_URL: publicly reachable authorized HTTPS ingress.
- SARVAM_WEBHOOK_TOKEN: at least 32 random bytes encoded as base64url.
- SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED=true: explicit acceptance of bearer-route protection because no provider signature is documented.
- LIVE_DESTINATION_ALLOWLIST: comma-separated authorized E.164 test destinations.

Generate a token locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`; keep its value out of source and logs. Optional values stay commented until valid configuration is available. Blank phone/version variables fail validation even if live is disabled.

API and worker must receive the same configuration; recreate both after changes. Recheck official contracts, telephony setup and security assumptions before an authorized manual test. No real call is authorized by normal development or the implementation task. Every live launch additionally requires deliberate confirmation, current consent, nonsynthetic allowlisted destinations and policy checks. No VITE secret variable is used.

## Optional Sarvam model SDK

MODEL_PROVIDER defaults local. Set it to sarvam only with SARVAM_MODEL_API_KEY (model API key, distinct from the Voice Agents workspace key). SARVAM_MODEL_NAME defaults sarvam-105b; the verified alternative is sarvam-105b-conversations. MODEL_TIMEOUT_MS defaults10000, bounded1000–60000. Requests use the official sarvamai1.1.12 TypeScript SDK, strict JSON output and zero retries. Only LIVE plans and connected LIVE summaries can use the configured model; all simulation remains local/free even with a key. Model usage can incur separate charges and is not part of the voice reservation estimate. No paid request was made during implementation or tests.
