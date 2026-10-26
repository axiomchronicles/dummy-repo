# API implementation contract

Base `/api/v1`. JSON command schemas live in shared contracts; OpenAPI3.1 served at `/api/v1/openapi.json`, with JSON Schema generated from Zod. Read outputs use ISO UTC strings and string event cursors. List responses `{items,nextCursor}` with capped `limit` and stable ordering. Errors `{error:{code,message,details?}}`; no raw vendor/secret/PII errors. Foreign tenant IDs return404.

Development auth: `POST /auth/demo` creates/resumes development-only identity and isolated workspace, sets HttpOnly SameSite cookie; `POST /auth/logout` revokes token; `GET /me` reads identity/workspace. Mutation origin checking and explicit same-origin proxy are required. Production does not permit demo mode. Server resolves tenant from session/membership, never arbitrary body workspace.

| Method           | Route                              | Behavior                                                                |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| GET              | /overview                          | Real workspace aggregates, mode separated                               |
| GET/POST         | /agents                            | List/create personas                                                    |
| GET/PATCH        | /agents/:id                        | Read/edit with immutable version creation                               |
| GET              | /agents/:id/versions               | Version history                                                         |
| POST             | /agents/:id/sandbox                | Synthetic provider test only                                            |
| GET/POST         | /imports                           | List/upload bounded CSV/XLSX as JSON base64 + mapping/region            |
| GET              | /imports/:id                       | Persisted import job summary                                            |
| GET              | /imports/:id/rows                  | Paginated row validation/source/errors                                  |
| POST             | /imports/:id/validate              | Explicit mapping/correction revalidation                                |
| GET              | /contacts                          | Paginated persisted contacts                                            |
| POST             | /contacts/:id/suppress             | Durable opt-out and audit                                               |
| GET/POST         | /campaigns                         | List/filter/create draft; no calls                                      |
| GET/PATCH/DELETE | /campaigns/:id                     | Read/edit draft; DELETE retains history through cancellation            |
| POST             | /campaigns/:id/plan                | Strict deterministic local plan; no provider                            |
| POST             | /campaigns/:id/simulate            | Explicit confirmed simulation and Idempotency-Key                       |
| POST             | /campaigns/:id/launch              | Explicit confirmed live; server prerequisites/allowlist/consent/policy  |
| POST             | /campaigns/:id/pause,resume,cancel | Actual server lifecycle; active calls may finish                        |
| GET              | /campaigns/:id/contacts            | Persisted contact/attempt read model                                    |
| GET              | /campaigns/:id/attempts            | Paginated attempts                                                      |
| GET              | /calls/:id                         | Authorized attempt timeline/analysis/transcript                         |
| GET              | /campaigns/:id/events              | JSON replay with after cursor; SSE when selected stream route           |
| GET              | /campaigns/:id/stream              | SSE persisted event IDs and bounded replay                              |
| GET              | /events                            | Workspace activity replay                                               |
| GET              | /reports                           | Report jobs/status                                                      |
| POST             | /campaigns/:id/reports             | Asynchronous csv/xlsx snapshot, Idempotency-Key                         |
| GET              | /reports/:id/download              | Private authorized binary download                                      |
| GET              | /integrations                      | Sanitized readiness/capabilities, no IDs/keys                           |
| GET/PATCH        | /settings                          | Workspace policy/settings and audit                                     |
| GET              | /audit                             | Paginated audit history                                                 |
| POST             | /webhooks/sarvam/:token            | Verified provider payload → durable inbox/outbox; secret route fallback |

Unprefixed `/health/live` and `/health/ready` check process and actual DB/Redis/schema. Worker separate status port3001. All routes in this table are implemented. The generated docs/api/openapi.json is the exact operation catalog with shared Zod input/output schemas, security, status codes and binary/SSE media types. Regenerate with npm run docs:api. API JSON responses are validated against shared schemas at runtime.

Campaign inputs include name/objective/import/persona selection, mode and validated policy (IANA timezone, start/end local calling window, bounded concurrency, integer-minor budget, conservative live cost assumptions). Plan stores eligible/excluded counts/reasons, immutable persona/version, steps/questions, provenance and cost assumptions. Missing answers remain null. Planning cannot authorize a call. Simulation and launch commands require explicit confirmed true and stable request keys; server guards recheck latest eligibility at dispatch.
