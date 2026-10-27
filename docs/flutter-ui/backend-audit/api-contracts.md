# Backend API Routes and Contract Inventory Audit

**Audit Date:** 2026-10-26  
**Auditor:** Agent A (API Routes and Contract Inventory)  
**Target Repository:** `/Users/kuroyami/CallingAgents`  
**Git Branch:** `main`  
**Primary Source Artifacts:**
- `apps/api/src/main.ts`
- `apps/api/src/controllers.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/common.ts`
- `apps/api/src/response-contracts.ts`
- `apps/api/src/streams.ts`
- `apps/api/src/agents.ts`
- `apps/api/src/imports.ts`
- `apps/api/src/campaigns.ts`
- `apps/api/src/operations.ts`
- `apps/api/src/webhooks.ts`
- `apps/api/src/planning.ts`
- `apps/api/src/openapi.ts`
- `packages/contracts/src/index.ts`
- `docs/api/openapi.json`

---

## 1. Executive Summary & Verification Matrix

This audit provides an exhaustive inventory of all 45 API routes, HTTP methods, controller handlers, data transfer objects (DTOs), Zod schemas, guards, error shapes, and OpenAPI 3.1.0 specifications within the Outreach Intern platform.

### 1.1 Summary Matrix

| Metric | Count | Details |
| :--- | :--- | :--- |
| **Total Registered Routes** | **45** | 45 concrete NestJS route handlers across 7 controllers |
| **Routes in `docs/api/openapi.json`** | **45** | 38 distinct URL paths representing 45 HTTP operations |
| **Available Routes** | **45** | Fully implemented, backed by database or mock provider |
| **Partial Routes** | **0** | No routes with stubbed or broken handlers |
| **Missing Routes** | **0** | All controller endpoints exist in OpenAPI and contracts |
| **Unverified Routes** | **0** | All routes audited against actual source code |
| **Guarded Routes (`SessionGuard`)** | **39** | Requires valid `outreach_session` cookie session |
| **Write-Restricted Routes (`requireWrite`)** | **17** | Requires `owner` or `operator` role (blocks `viewer`) |
| **Idempotency-Required Routes** | **3** | Requires `Idempotency-Key` header (`simulate`, `launch`, `reports`) |
| **Public Routes** | **6** | `/health/live`, `/health/ready`, `/auth/demo`, `/auth/logout`, `/openapi.json`, `/webhooks/sarvam/:token` |

### 1.2 Status Breakdown by Controller

| Controller | Source File | Base Route | Operation Count | Status |
| :--- | :--- | :--- | :--- | :--- |
| `HealthController` | [`apps/api/src/main.ts#L38-L58`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L38-L58) | `/health` | 2 | `available` |
| `AuthController` | [`apps/api/src/controllers.ts#L27-L45`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L27-L45) | `/api/v1/auth` | 2 | `available` (dev-mode gated) |
| `WorkspaceController` | [`apps/api/src/controllers.ts#L46-L176`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L46-L176) | `/api/v1` | 12 | `available` |
| `AgentsController` | [`apps/api/src/controllers.ts#L177-L215`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L177-L215) | `/api/v1/agents` | 6 | `available` |
| `ImportsController` | [`apps/api/src/controllers.ts#L216-L267`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L216-L267) | `/api/v1` | 7 | `available` |
| `CampaignsController` | [`apps/api/src/controllers.ts#L268-L375`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L268-L375) | `/api/v1` | 14 | `available` |
| `PublicController` | [`apps/api/src/controllers.ts#L376-L390`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L376-L390) | `/api/v1` | 2 | `available` |

---

## 2. Global Architecture, Security & Interceptor Stack

Understanding the middleware pipeline is critical before writing the Flutter HTTP client. The NestJS application applies global middleware, guards, interceptors, and filters configured in [`apps/api/src/main.ts#L93-L137`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L93-L137).

### 2.1 Request Lifecycle Pipeline

```mermaid
flowchart TD
    Req[Incoming HTTP Request] --> SecHeaders[Global Security Headers Middleware\nX-Content-Type-Options, Referrer-Policy, Cache-Control]
    SecHeaders --> RateLimit{Rate Limiter Middleware\n/api/v1/auth: 30/min\n/api/v1/webhooks: 200/min}
    RateLimit -- Exceeded --> E429[429 RATE_LIMITED]
    RateLimit -- Allowed --> BodyParse[Express JSON Parser\nlimit: 7mb, strict: true]
    BodyParse --> GuardCheck{SessionGuard / verifyOrigin}
    GuardCheck -- Invalid Origin / Content-Type --> EOrigin[403 ORIGIN_REJECTED / 415 CONTENT_TYPE_REQUIRED]
    GuardCheck -- No/Expired outreach_session --> E401[401 UNAUTHENTICATED]
    GuardCheck -- Success --> RoleCheck{requireWrite Check}
    RoleCheck -- Role == viewer on mutating route --> E403[403 FORBIDDEN]
    RoleCheck -- Passed --> Controller[NestJS Controller Handler]
    Controller --> Service[Domain Service Execution]
    Service --> ResponseInterceptor[ResponseContractInterceptor\nValidates response with Zod schema]
    ResponseInterceptor -- Schema Valid --> Res[HTTP Response]
    ResponseInterceptor -- Schema Invalid --> E500[500 RESPONSE_CONTRACT_ERROR]
    Controller -- Throws DomainError --> ExceptionFilter[SafeExceptionFilter\nStandardized JSON Error Shape]
```

### 2.2 Global Security Headers & Body Parser
Configured in [`apps/api/src/main.ts#L99-L105`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L99-L105):
- `app.use(json({ limit: '7mb', strict: true }))`: Body limit is 7 MiB; JSON parser is strict (requires valid JSON tokens; raw strings or invalid numbers rejected).
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Cache-Control: no-store`

### 2.3 Sliding Window Rate Limiter
Configured in [`apps/api/src/main.ts#L106-L132`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L106-L132):
- Evaluated on `req.path.startsWith('/api/v1/auth')` and `req.path.startsWith('/api/v1/webhooks')`.
- Window: 60 seconds (1 minute).
- Bucket limit for Auth: **30 requests per minute** per client IP.
- Bucket limit for Webhooks: **200 requests per minute** per client IP.
- Returns status `429` with error body:
  ```json
  { "error": { "code": "RATE_LIMITED", "message": "Retry after the current minute" } }
  ```

### 2.4 Origin & Content-Type Enforcement (`verifyOrigin`)
Defined in [`apps/api/src/auth.ts#L35-L55`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L35-L55):
- Bypassed for safe methods: `GET`, `HEAD`, `OPTIONS`.
- For mutating methods (`POST`, `PATCH`, `DELETE`):
  1. Checks `req.get('Origin')`. If present, must match `config.ALLOWED_ORIGINS` or `config.PUBLIC_BASE_URL` (comma-separated). Otherwise throws `403 ORIGIN_REJECTED`.
  2. If `Origin` is missing, checks `Sec-Fetch-Site`. If equal to `cross-site`, throws `403 ORIGIN_REJECTED`.
  3. If `Content-Type` is supplied, `req.is('application/json')` must be true. Otherwise throws `415 CONTENT_TYPE_REQUIRED`.

> [!IMPORTANT]
> **Flutter Client Requirement:** When building the Flutter desktop/mobile application, requests do not originate from a browser origin unless run as Flutter Web. In native Dart, omit the `Origin` header or ensure it matches the server's configured URL. For all mutation calls with bodies, explicitly set `Content-Type: application/json`.

### 2.5 Session Authentication (`SessionGuard` & Cookie Jar)
Defined in [`apps/api/src/auth.ts#L25-L31`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L25-L31) and [`apps/api/src/auth.ts#L171-L180`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L171-L180):
- **Cookie Name:** `outreach_session`
- **Format:** 43-character base64url string (`randomBytes(32).toString('base64url')`), validated with regex `^[A-Za-z0-9_-]{43}$`.
- **Database Verification:** Looks up SHA-256 digest in `sessions` table joined with `memberships` and `users`. Verifies `expires_at > now()`.
- **Identity Context Injected:** Populates `req.identity`:
  - `userId`: UUID
  - `workspaceId`: UUID
  - `role`: `'owner' | 'operator' | 'viewer'`
  - `email`: string
  - `name`: string

> [!IMPORTANT]
> **No Bearer Header Support:** The backend does **not** inspect `Authorization: Bearer <token>`. It strictly inspects `req.headers.cookie` for `outreach_session=<token>`. The Flutter client must use a cookie jar (`cookie_jar` / `dio_cookie_manager`) or explicitly attach the `Cookie: outreach_session=<token>` header on all requests.

### 2.6 Role-Based Access Control (`requireWrite`)
Defined in [`apps/api/src/common.ts#L51-L54`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L51-L54):
- Called at the entry of every mutating endpoint.
- If `identity.role === 'viewer'`, throws `403 FORBIDDEN` with message `"Operator permission is required"`.
- Permitted write roles: `'owner'` and `'operator'`.

### 2.7 Idempotency Enforcement (`idempotencyKey`)
Defined in [`apps/api/src/common.ts#L189-L197`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L189-L197):
- Evaluates `req.get('Idempotency-Key')`.
- Validation regex: `^[A-Za-z0-9_-]{8,128}$` (8 to 128 characters).
- Required on:
  - `POST /api/v1/campaigns/:id/simulate`
  - `POST /api/v1/campaigns/:id/launch`
  - `POST /api/v1/campaigns/:id/reports`
- If omitted or invalid, throws `400 IDEMPOTENCY_KEY_REQUIRED`.

### 2.8 Standard Error Envelope (`SafeExceptionFilter`)
Defined in [`apps/api/src/common.ts#L13-L22`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L13-L22) and [`apps/api/src/common.ts#L198-L222`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L198-L222):
All errors returned by the API conform to `ErrorSchema` ([`packages/contracts/src/index.ts#L320-L326`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L320-L326)):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted input fields",
    "details": [
      {
        "path": "name",
        "message": "Too small: expected at least 1 characters"
      }
    ]
  }
}
```

Standard Error Codes:
- `VALIDATION_ERROR` (400)
- `IDEMPOTENCY_KEY_REQUIRED` (400)
- `LIVE_CONCURRENCY_LIMIT` (400)
- `BUDGET_EXCEEDED` (400)
- `FILE_SIZE_LIMIT` (400)
- `INVALID_CORRECTION` (400)
- `INVALID_CURSOR` (400)
- `UNAUTHENTICATED` (401)
- `FORBIDDEN` (403)
- `ORIGIN_REJECTED` (403)
- `DEMO_DISABLED` (403)
- `LIVE_DISABLED` (403)
- `DESTINATION_NOT_AUTHORIZED` (403)
- `NOT_FOUND` (404)
- `UNKNOWN_ATTEMPT` (404)
- `CAMPAIGN_IMMUTABLE` (409)
- `IMPORT_NOT_READY` (409)
- `IMPORT_BUSY` (409)
- `IMPORT_IN_USE` (409)
- `INVALID_TRANSITION` (409)
- `PLANNING_BLOCKED` (409)
- `PLAN_STALE` (409)
- `LAUNCH_BLOCKED` (409)
- `MODE_MISMATCH` (409)
- `NO_ELIGIBLE_CONTACTS` (409)
- `IDEMPOTENCY_CONFLICT` (409)
- `REPORT_NOT_READY` (409)
- `IMPORT_SOURCE_EXPIRED` (410)
- `REPORT_EXPIRED` (410)
- `CONTENT_TYPE_REQUIRED` (415)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)
- `RESPONSE_CONTRACT_ERROR` (500)
- `NOT_READY` (503)
- `MODEL_UNAVAILABLE` (503)
- `MODEL_PROVENANCE_INVALID` (503)
- `SHUTTING_DOWN` (503)

### 2.9 Strict Runtime Response Interceptor (`ResponseContractInterceptor`)
Defined in [`apps/api/src/response-contracts.ts#L18-L45`](file:///Users/kuroyami/CallingAgents/apps/api/src/response-contracts.ts#L18-L45):
- Intercepts all responses matching `/api/v1/*` routes (except streaming or binary).
- Runs `operation.output.safeParse(value)` using the contract registered in [`apps/api/src/openapi.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts).
- If validation fails, throws `500 RESPONSE_CONTRACT_ERROR`.
- Guarantees 100% fidelity between documented OpenAPI types and runtime wire JSON.

---

## 3. Exhaustive Route Inventory (All 45 Routes)

Every route in the platform is cataloged below with exact paths, citations, inputs, outputs, error conditions, and availability status.

```
Status Key:
- available:   Fully implemented, tested, and actively functional.
- partial:     Implemented with noted restrictions or missing sub-features.
- missing:     Documented in contracts/OpenAPI but not implemented in controllers.
- unverified:  Cannot confirm runtime readiness without external telemetry.
```

---

### 3.1 System Health & Diagnostics (2 Routes)

#### Route 1: Liveness Probe
- **Method:** `GET`
- **Path:** `/health/live` (Root server URL `/`)
- **Controller:** `HealthController.live` ([`apps/api/src/main.ts#L40-L42`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L40-L42))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L412-L436`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L412-L436) / `docs/api/openapi.json` (`/health/live`)
- **Guards / Auth:** None (Public)
- **Request Body:** None
- **Query Params:** None
- **Response Status:** `200 OK`
- **Response Schema:** `{ status: "alive" }`
- **Error Codes:** None
- **Status:** `available`

#### Route 2: Readiness Probe
- **Method:** `GET`
- **Path:** `/health/ready` (Root server URL `/`)
- **Controller:** `HealthController.ready` ([`apps/api/src/main.ts#L43-L57`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L43-L57))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L412-L450`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L412-L450) / `docs/api/openapi.json` (`/health/ready`)
- **Guards / Auth:** None (Public)
- **Dependencies Checked:** PostgreSQL `SELECT 1 FROM campaigns LIMIT 1` & Redis `redis.ping()`
- **Request Body:** None
- **Query Params:** None
- **Response Status:** `200 OK`
- **Response Schema:** `{ status: "ready", database: true, redis: true }`
- **Error Codes:** `503 NOT_READY`
- **Status:** `available`

---

### 3.2 Authentication & Session Management (2 Routes)

#### Route 3: Demo Development Sign-In
- **Method:** `POST`
- **Path:** `/api/v1/auth/demo`
- **Controller:** `AuthController.demo` ([`apps/api/src/controllers.ts#L30-L37`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L30-L37))
- **Service Implementation:** `AuthService.signIn` ([`apps/api/src/auth.ts#L58-L137`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L58-L137))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L21-L28`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L21-L28) / `docs/api/openapi.json` (`/auth/demo`)
- **Guards / Auth:** Public endpoint; restricted by `verifyOrigin(req)` ([`apps/api/src/auth.ts#L35`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L35)) and rate limiter (30/min). Disabled when `DEV_AUTH=false` or `NODE_ENV=production`.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:** `DemoSignInSchema` ([`packages/contracts/src/index.ts#L90-L93`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L90-L93))
  ```ts
  { email: string (max 200), name?: string (1-80 chars) }
  ```
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Headers:** `Set-Cookie: outreach_session=<base64url>; Path=/; HttpOnly; SameSite=Strict; Max-Age=...`
- **Response Schema:** `IdentitySchema` ([`packages/contracts/src/index.ts#L579-L588`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L579-L588))
- **Side Effects:** Upserts user, bootstraps workspace if absent, seeds 5 starter personas (`Customer Discovery`, `Appointment Coordinator`, `Feedback Listener`, `Event Outreach`, `Service Follow-up`), creates active session, records audit event `auth.demo_signin`.
- **Error Codes:** `400 VALIDATION_ERROR`, `403 DEMO_DISABLED`, `403 ORIGIN_REJECTED`, `415 CONTENT_TYPE_REQUIRED`, `429 RATE_LIMITED`
- **Status:** `available`

#### Route 4: Session Logout
- **Method:** `POST`
- **Path:** `/api/v1/auth/logout`
- **Controller:** `AuthController.logout` ([`apps/api/src/controllers.ts#L38-L44`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L38-L44))
- **Service Implementation:** `AuthService.logout` ([`apps/api/src/auth.ts#L161-L169`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L161-L169))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L29-L35`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L29-L35) / `docs/api/openapi.json` (`/auth/logout`)
- **Guards / Auth:** Public endpoint; runs `verifyOrigin(req)`.
- **Request Headers:** `Cookie: outreach_session=...` (optional)
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Headers:** `Set-Cookie: outreach_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
- **Response Schema:** `{ signedOut: true }`
- **Error Codes:** `403 ORIGIN_REJECTED`, `429 RATE_LIMITED`
- **Status:** `available`

---

### 3.3 Workspace, Settings & System Operations (6 Routes)

#### Route 5: Current Authenticated Identity
- **Method:** `GET`
- **Path:** `/api/v1/me`
- **Controller:** `WorkspaceController.me` ([`apps/api/src/controllers.ts#L54-L56`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L54-L56))
- **Service Implementation:** `OperationsService.me` ([`apps/api/src/operations.ts#L26-L38`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L26-L38))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L36-L41`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L36-L41) / `docs/api/openapi.json` (`/me`)
- **Guards / Auth:** `SessionGuard`
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `IdentitySchema` ([`packages/contracts/src/index.ts#L579-L588`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L579-L588))
  ```ts
  {
    userId: string (UUID),
    workspaceId: string (UUID),
    role: "owner" | "operator" | "viewer",
    email: string,
    name: string,
    workspaceName: string,
    development: boolean,
    workspace: WorkspaceSchema
  }
  ```
- **Error Codes:** `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 6: Workspace Overview Aggregates
- **Method:** `GET`
- **Path:** `/api/v1/overview`
- **Controller:** `WorkspaceController.overview` ([`apps/api/src/controllers.ts#L57-L59`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L57-L59))
- **Service Implementation:** `OperationsService.overview` ([`apps/api/src/operations.ts#L39-L78`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L39-L78))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L42-L47`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L42-L47) / `docs/api/openapi.json` (`/overview`)
- **Guards / Auth:** `SessionGuard`
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `OverviewSchema` ([`packages/contracts/src/index.ts#L620-L644`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L620-L644))
  - Aggregates: `campaignCount`, `contactCount`, `simulationAttempts`, `liveAttempts`, breakdowns by status/outcome, and 10 recent events.
- **Error Codes:** `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 7: Voice & Model Integrations Status
- **Method:** `GET`
- **Path:** `/api/v1/integrations`
- **Controller:** `WorkspaceController.integrations` ([`apps/api/src/controllers.ts#L60-L62`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L60-L62))
- **Service Implementation:** `OperationsService.integrations` ([`apps/api/src/operations.ts#L259-L282`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L259-L282))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L255-L259`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L255-L259) / `docs/api/openapi.json` (`/integrations`)
- **Guards / Auth:** `SessionGuard`
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `IntegrationSchema` ([`packages/contracts/src/index.ts#L589-L610`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L589-L610))
  - Returns telephony readiness flags (`provider`, `simulationReady: true`, `liveReady`, `liveEnabled`, `missingConfiguration`), call capabilities, webhook security description, cost note, and model planner readiness.
- **Error Codes:** `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 8: Read Workspace Settings
- **Method:** `GET`
- **Path:** `/api/v1/settings`
- **Controller:** `WorkspaceController.settings` ([`apps/api/src/controllers.ts#L63-L65`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L63-L65))
- **Service Implementation:** `OperationsService.settings` ([`apps/api/src/operations.ts#L283-L292`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L283-L292))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L260-L265`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L260-L265) / `docs/api/openapi.json` (`/settings` GET)
- **Guards / Auth:** `SessionGuard`
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `WorkspaceSchema` ([`packages/contracts/src/index.ts#L572-L578`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L572-L578))
  ```ts
  { id: string (UUID), name: string, timezone: string, settings: Record<string, unknown> }
  ```
- **Error Codes:** `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 9: Update Workspace Settings
- **Method:** `PATCH`
- **Path:** `/api/v1/settings`
- **Controller:** `WorkspaceController.settingsUpdate` ([`apps/api/src/controllers.ts#L66-L71`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L66-L71))
- **Service Implementation:** `OperationsService.updateSettings` ([`apps/api/src/operations.ts#L293-L329`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L293-L329))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L266-L272`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L266-L272) / `docs/api/openapi.json` (`/settings` PATCH)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)` ([`apps/api/src/common.ts#L51`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L51))
- **Request Body:** `SettingsSchema` ([`packages/contracts/src/index.ts#L175-L183`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L175-L183))
  ```ts
  {
    name?: string (1-100 chars),
    timezone?: string (valid IANA timezone),
    defaultRegion?: string (2-letter uppercase, e.g. "IN", "US") | null
  }
  ```
- **Response Status:** `200 OK`
- **Response Schema:** `WorkspaceSchema`
- **Side Effects:** Appends audit record `workspace.settings_changed`.
- **Error Codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`
- **Status:** `available`

#### Route 10: List Reports
- **Method:** `GET`
- **Path:** `/api/v1/reports`
- **Controller:** `WorkspaceController.reports` ([`apps/api/src/controllers.ts#L78-L83`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L78-L83))
- **Service Implementation:** `OperationsService.reports` ([`apps/api/src/operations.ts#L79-L95`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L79-L95))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L232-L237`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L232-L237) / `docs/api/openapi.json` (`/reports`)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset `^\d+$`)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(ReportSchema)` ([`packages/contracts/src/index.ts#L558-L571`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L558-L571))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

---

### 3.4 Events, Audit & Streaming (3 Routes)

#### Route 11: List Workspace Audit Logs
- **Method:** `GET`
- **Path:** `/api/v1/audit`
- **Controller:** `WorkspaceController.audit` ([`apps/api/src/controllers.ts#L72-L77`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L72-L77))
- **Service Implementation:** `OperationsService.audit` ([`apps/api/src/operations.ts#L330-L346`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L330-L346))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L273-L278`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L273-L278) / `docs/api/openapi.json` (`/audit`)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(AuditSchema)` ([`packages/contracts/src/index.ts#L611-L619`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L611-L619))
  ```ts
  {
    items: Array<{
      id: string,
      workspaceId: string (UUID),
      actorId: string (UUID) | null,
      action: string,
      entityId: string,
      metadata: Record<string, unknown>,
      createdAt: string (ISO)
    }>,
    nextCursor: string | null
  }
  ```
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 12: Replay Workspace Events
- **Method:** `GET`
- **Path:** `/api/v1/events`
- **Controller:** `WorkspaceController.events` ([`apps/api/src/controllers.ts#L103-L108`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L103-L108))
- **Service Implementation:** `OperationsService.events` ([`apps/api/src/operations.ts#L234-L258`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L234-L258))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L227-L231`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L227-L231) / `docs/api/openapi.json` (`/events`)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `after` (int string cursor, default "0"), `limit` (int 1..100, default 50)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `{ items: CampaignEventSchema[], nextCursor: string }` ([`packages/contracts/src/index.ts#L312-L319`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L312-L319))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 13: Real-Time Campaign Server-Sent Events (SSE) Stream
- **Method:** `GET`
- **Path:** `/api/v1/campaigns/:id/stream`
- **Controller:** `WorkspaceController.stream` ([`apps/api/src/controllers.ts#L116-L175`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L116-L175))
- **Service Implementation:** `StreamsService` ([`apps/api/src/streams.ts#L5-L42`](file:///Users/kuroyami/CallingAgents/apps/api/src/streams.ts#L5-L42))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L220-L226`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L220-L226) / `docs/api/openapi.json` (`/campaigns/{id}/stream`)
- **Guards / Auth:** `SessionGuard` (re-verifies session validity every 30 seconds)
- **Path Params:** `id`: UUID (campaign ID)
- **Headers:** `Last-Event-ID: <cursor>` (optional, supported alternative to query param `after`)
- **Query Params:** `after: string` (cursor, default "0")
- **Response Status:** `200 OK`
- **Response Headers:**
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- **Wire Event Protocol:**
  - Standard event frame: `id: <eventId>\ndata: <JSON-stringified CampaignEventSchema>\n\n`
  - Heartbeat: `: heartbeat\n\n` emitted every 15 seconds.
  - Reconnect notice: `event: reconnect\ndata: {"reason":"dependency_unavailable"}\n\n` or `server_shutdown`.
- **Lifecycle Management:** Cleanly registers with `StreamsService.register`. Gracefully terminates when client aborts or application shuts down.
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`, `503 SHUTTING_DOWN`
- **Status:** `available`

---

### 3.5 Agent Personas & Versions (6 Routes)

#### Route 14: List Agent Personas
- **Method:** `GET`
- **Path:** `/api/v1/agents`
- **Controller:** `AgentsController.list` ([`apps/api/src/controllers.ts#L181-L186`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L181-L186))
- **Service Implementation:** `AgentsService.list` ([`apps/api/src/agents.ts#L20-L36`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L20-L36))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L49-L53`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L49-L53) / `docs/api/openapi.json` (`/agents` GET)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(AgentSchema)` ([`packages/contracts/src/index.ts#L430-L441`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L430-L441))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 15: Create Agent Persona
- **Method:** `POST`
- **Path:** `/api/v1/agents`
- **Controller:** `AgentsController.create` ([`apps/api/src/controllers.ts#L187-L189`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L187-L189))
- **Service Implementation:** `AgentsService.save` ([`apps/api/src/agents.ts#L62-L120`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L62-L120))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L54-L61`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L54-L61) / `docs/api/openapi.json` (`/agents` POST)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Request Body:** `AgentInputSchema` ([`packages/contracts/src/index.ts#L94-L100`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L94-L100))
  ```ts
  {
    name: string (1-100 chars),
    description?: string (max 1000 chars, default ""),
    prompt: string (1-10000 chars),
    questions?: string[] (max 20 strings, 1-300 chars each, default []),
    language?: string (1-50 chars, default "English")
  }
  ```
- **Response Status:** `201 Created`
- **Response Schema:** `AgentSchema`
- **Side Effects:** Creates persona (`current_version = 1`), creates `agent_versions` row with version 1, appends audit log `agent.created`.
- **Error Codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`
- **Status:** `available`

#### Route 16: Read Agent Persona Details
- **Method:** `GET`
- **Path:** `/api/v1/agents/:id`
- **Controller:** `AgentsController.detail` ([`apps/api/src/controllers.ts#L190-L195`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L190-L195))
- **Service Implementation:** `AgentsService.detail` ([`apps/api/src/agents.ts#L37-L47`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L37-L47))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L62-L67`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L62-L67) / `docs/api/openapi.json` (`/agents/{id}` GET)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `AgentSchema`
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 17: Update Agent Persona (Creates Immutable Version)
- **Method:** `PATCH`
- **Path:** `/api/v1/agents/:id`
- **Controller:** `AgentsController.edit` ([`apps/api/src/controllers.ts#L196-L202`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L196-L202))
- **Service Implementation:** `AgentsService.save` ([`apps/api/src/agents.ts#L62-L120`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L62-L120))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L68-L74`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L68-L74) / `docs/api/openapi.json` (`/agents/{id}` PATCH)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** `AgentInputSchema`
- **Response Status:** `200 OK`
- **Response Schema:** `AgentSchema`
- **Side Effects:** Increments `current_version`, inserts new immutable `agent_versions` record, appends audit log `agent.version_created`. Previous versions remain accessible and linked to prior campaigns.
- **Error Codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 18: Read Agent Version History
- **Method:** `GET`
- **Path:** `/api/v1/agents/:id/versions`
- **Controller:** `AgentsController.versions` ([`apps/api/src/controllers.ts#L203-L208`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L203-L208))
- **Service Implementation:** `AgentsService.versions` ([`apps/api/src/agents.ts#L48-L61`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L48-L61))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L75-L80`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L75-L80) / `docs/api/openapi.json` (`/agents/{id}/versions`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Query Params:** None (returns all versions ordered `version DESC`)
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(AgentVersionSchema)` ([`packages/contracts/src/index.ts#L442-L449`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L442-L449))
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 19: Network-Free Synthetic Provider Sandbox
- **Method:** `POST`
- **Path:** `/api/v1/agents/:id/sandbox`
- **Controller:** `AgentsController.sandbox` ([`apps/api/src/controllers.ts#L209-L215`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L209-L215))
- **Service Implementation:** `AgentsService.sandbox` ([`apps/api/src/agents.ts#L121-L131`](file:///Users/kuroyami/CallingAgents/apps/api/src/agents.ts#L121-L131))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L81-L90`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L81-L90) / `docs/api/openapi.json` (`/agents/{id}/sandbox`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:**
  ```ts
  {
    mode: "simulation",
    kind: "terminal",
    event: NormalizedCallEventSchema
  }
  ```
- **Implementation:** Executes `MockVoiceProvider` in memory without making real telephony calls or invoking external APIs.
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

---

### 3.6 Contact Imports & Suppression (7 Routes)

#### Route 20: List Contact Imports
- **Method:** `GET`
- **Path:** `/api/v1/imports`
- **Controller:** `ImportsController.list` ([`apps/api/src/controllers.ts#L222-L227`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L222-L227))
- **Service Implementation:** `ImportsService.list` ([`apps/api/src/imports.ts#L27-L38`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L27-L38))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L91-L96`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L91-L96) / `docs/api/openapi.json` (`/imports` GET)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(ImportSchema)` ([`packages/contracts/src/index.ts#L450-L463`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L450-L463))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 21: Upload Import File
- **Method:** `POST`
- **Path:** `/api/v1/imports`
- **Controller:** `ImportsController.create` ([`apps/api/src/controllers.ts#L228-L233`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L228-L233))
- **Service Implementation:** `ImportsService.create` ([`apps/api/src/imports.ts#L39-L83`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L39-L83))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L97-L104`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L97-L104) / `docs/api/openapi.json` (`/imports` POST)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Request Body:** `ImportInputSchema` ([`packages/contracts/src/index.ts#L108-L125`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L108-L125))
  ```ts
  {
    filename: string (1-160 chars, regex /\.(csv|xlsx)$/i),
    contentBase64: string (Base64 encoded string, raw binary <= 5 MiB),
    mapping: {
      phone: string,
      name?: string,
      email?: string,
      consent?: string,
      outcome?: string
    },
    region?: string (2-letter uppercase ISO country code, e.g. "IN"),
    synthetic?: boolean (default false)
  }
  ```
- **Response Status:** `202 Accepted` (`@HttpCode(202)`)
- **Response Schema:** `ImportSchema`
- **Side Effects:** Stores raw bytes in `imports.source_bytes`, enqueues outbox message `imports`, records audit log `import.created`. Asynchronous worker performs parsing and validation.
- **Error Codes:** `400 VALIDATION_ERROR`, `400 FILE_SIZE_LIMIT` (if decoded size > 5 MiB or 0 bytes), `401 UNAUTHENTICATED`, `403 FORBIDDEN`
- **Status:** `available`

#### Route 22: Read Import Job Summary
- **Method:** `GET`
- **Path:** `/api/v1/imports/:id`
- **Controller:** `ImportsController.detail` ([`apps/api/src/controllers.ts#L234-L239`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L234-L239))
- **Service Implementation:** `ImportsService.detail` ([`apps/api/src/imports.ts#L84-L86`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L84-L86))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L105-L110`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L105-L110) / `docs/api/openapi.json` (`/imports/{id}`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ImportSchema` (contains `status`, `rowCount`, `validCount`, `errorCount`, `failureCode`)
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 23: Read Import Validation Rows
- **Method:** `GET`
- **Path:** `/api/v1/imports/:id/rows`
- **Controller:** `ImportsController.rows` ([`apps/api/src/controllers.ts#L240-L246`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L240-L246))
- **Service Implementation:** `ImportsService.rows` ([`apps/api/src/imports.ts#L87-L100`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L87-L100))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L111-L116`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L111-L116) / `docs/api/openapi.json` (`/imports/{id}/rows`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(ImportRowSchema)` ([`packages/contracts/src/index.ts#L148-L156`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L148-L156))
  ```ts
  {
    items: Array<{
      id: string (UUID),
      sourceRow: number,
      sourceCells: Record<string, unknown>,
      normalizedPhone: string | null,
      issues: Array<{ code: string, message: string, column?: string, field?: string }>,
      status: string,
      contactId: string (UUID) | null
    }>,
    nextCursor: string | null
  }
  ```
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 24: Revalidate Import Corrections
- **Method:** `POST`
- **Path:** `/api/v1/imports/:id/validate`
- **Controller:** `ImportsController.validate` ([`apps/api/src/controllers.ts#L247-L253`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L247-L253))
- **Service Implementation:** `ImportsService.validate` ([`apps/api/src/imports.ts#L101-L211`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L101-L211))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L117-L124`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L117-L124) / `docs/api/openapi.json` (`/imports/{id}/validate`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** `ImportCorrectionSchema` ([`packages/contracts/src/index.ts#L126-L141`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L126-L141))
  ```ts
  {
    mapping?: ImportMappingSchema,
    region?: string (2-letter uppercase),
    corrections?: Array<{
      sourceRow: number (1..10001),
      cells: Record<string, string> (max 50 cells per row)
    }>
  }
  ```
- **Response Status:** `202 Accepted` (`@HttpCode(202)`)
- **Response Schema:** `ImportSchema`
- **Side Effects:** Updates import status to `'uploaded'`, enqueues outbox message `imports`, records audit log `import.revalidated`.
- **Error Codes:**
  - `400 INVALID_CORRECTION`: if row does not exist, exceeds 50 columns, or attempts to add new column names
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 IMPORT_BUSY`: import is already validating
  - `409 INVALID_TRANSITION`: import status cannot transition to uploaded
  - `409 IMPORT_IN_USE`: a campaign already references this import
  - `410 IMPORT_SOURCE_EXPIRED`: original raw binary file expired from storage
- **Status:** `available`

#### Route 25: List Contacts and Suppression Status
- **Method:** `GET`
- **Path:** `/api/v1/contacts`
- **Controller:** `ImportsController.contacts` ([`apps/api/src/controllers.ts#L254-L259`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L254-L259))
- **Service Implementation:** `ImportsService.contacts` ([`apps/api/src/imports.ts#L212-L223`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L212-L223))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L125-L130`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L125-L130) / `docs/api/openapi.json` (`/contacts`)
- **Guards / Auth:** `SessionGuard`
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(ContactSchema)` ([`packages/contracts/src/index.ts#L464-L474`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L464-L474))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 26: Suppress Contact (Opt-Out)
- **Method:** `POST`
- **Path:** `/api/v1/contacts/:id/suppress`
- **Controller:** `ImportsController.suppress` ([`apps/api/src/controllers.ts#L260-L266`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L260-L266))
- **Service Implementation:** `ImportsService.suppress` ([`apps/api/src/imports.ts#L224-L263`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L224-L263))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L131-L137`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L131-L137) / `docs/api/openapi.json` (`/contacts/{id}/suppress`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** `SuppressionSchema` ([`packages/contracts/src/index.ts#L172-L174`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L172-L174))
  ```ts
  { reason?: string (1-300 chars, default "Contact opted out") }
  ```
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `{ id: string (UUID), suppressed: true }`
- **Side Effects:** Upserts into `suppressions`, sets `contacts.consent = false`, appends to `consent_records` (`granted=false, source='operator-opt-out'`), records audit log `contact.suppressed`.
- **Error Codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
- **Status:** `available`

---

### 3.7 Campaigns & Telephony Execution (17 Routes)

#### Route 27: List Campaigns
- **Method:** `GET`
- **Path:** `/api/v1/campaigns`
- **Controller:** `CampaignsController.list` ([`apps/api/src/controllers.ts#L274-L279`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L274-L279))
- **Service Implementation:** `CampaignsService.list` ([`apps/api/src/campaigns.ts#L45-L58`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L45-L58))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L139-L144`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L139-L144) / `docs/api/openapi.json` (`/campaigns` GET)
- **Guards / Auth:** `SessionGuard`
- **Query Params:**
  - `limit`: int 1..100, default 30
  - `cursor`: string offset
  - `status`: string optional (e.g., `'draft'`, `'planned'`, `'running'`, `'completed'`)
  - `mode`: string optional (`'simulation'` or `'live'`)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(CampaignSchema)` ([`packages/contracts/src/index.ts#L475-L497`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L475-L497))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`
- **Status:** `available`

#### Route 28: Save Campaign Draft
- **Method:** `POST`
- **Path:** `/api/v1/campaigns`
- **Controller:** `CampaignsController.create` ([`apps/api/src/controllers.ts#L280-L285`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L280-L285))
- **Service Implementation:** `CampaignsService.create` ([`apps/api/src/campaigns.ts#L150-L193`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L150-L193))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L145-L152`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L145-L152) / `docs/api/openapi.json` (`/campaigns` POST)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Request Body:** `CampaignInputSchema` ([`packages/contracts/src/index.ts#L157-L164`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L157-L164))
  ```ts
  {
    name: string (1-120 chars),
    objective: string (3-3000 chars),
    importId: string (UUID),
    agentId: string (UUID),
    mode?: "simulation" | "live" (default "simulation"),
    policy?: PolicySchema
  }
  ```
- **Response Status:** `201 Created`
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Locks agent persona version, populates `campaign_contacts`, appends `campaign.created` campaign event, records audit log `campaign.created`.
- **Error Codes:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 IMPORT_NOT_READY`
- **Status:** `available`

#### Route 29: Read Campaign Details
- **Method:** `GET`
- **Path:** `/api/v1/campaigns/:id`
- **Controller:** `CampaignsController.detail` ([`apps/api/src/controllers.ts#L286-L291`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L286-L291))
- **Service Implementation:** `CampaignsService.detail` ([`apps/api/src/campaigns.ts#L59-L108`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L59-L108))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L153-L158`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L153-L158) / `docs/api/openapi.json` (`/campaigns/{id}` GET)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `CampaignSchema` (includes dynamic `progress`, `outcomes`, and `activeCallsMayContinue` indicator)
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 30: Edit Unlaunched Campaign
- **Method:** `PATCH`
- **Path:** `/api/v1/campaigns/:id`
- **Controller:** `CampaignsController.edit` ([`apps/api/src/controllers.ts#L292-L298`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L292-L298))
- **Service Implementation:** `CampaignsService.edit` ([`apps/api/src/campaigns.ts#L194-L258`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L194-L258))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L159-L165`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L159-L165) / `docs/api/openapi.json` (`/campaigns/{id}` PATCH)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** `CampaignPatchSchema` (`CampaignInputSchema.partial()`)
- **Response Status:** `200 OK`
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Resets status to `'draft'`, sets `plan = NULL` (invalidates prior plan), re-populates contacts, appends `campaign.updated` event with `{ planInvalidated: true }`.
- **Error Codes:**
  - `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 CAMPAIGN_IMMUTABLE`: campaign is not in `draft` or `planned` state
  - `409 IMPORT_NOT_READY`: updated import is not ready
- **Status:** `available`

#### Route 31: Cancel Campaign via DELETE
- **Method:** `DELETE`
- **Path:** `/api/v1/campaigns/:id`
- **Controller:** `CampaignsController.remove` ([`apps/api/src/controllers.ts#L299-L304`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L299-L304))
- **Service Implementation:** `CampaignsService.action(..., 'cancel')` ([`apps/api/src/campaigns.ts#L546-L612`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L546-L612))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L166-L171`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L166-L171) / `docs/api/openapi.json` (`/campaigns/{id}` DELETE)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Does not physically delete record; marks campaign as `cancelled`, cancels non-terminal contacts, preserves all audit history.
- **Error Codes:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_TRANSITION`
- **Status:** `available`

#### Route 32: Generate Deterministic / Model Campaign Plan
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/plan`
- **Controller:** `CampaignsController.plan` ([`apps/api/src/controllers.ts#L305-L310`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L305-L310))
- **Service Implementation:** `CampaignsService.plan` ([`apps/api/src/campaigns.ts#L296-L427`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L296-L427))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L172-L177`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L172-L177) / `docs/api/openapi.json` (`/campaigns/{id}/plan`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema` (with populated `plan: CampaignPlanSchema`)
- **Side Effects:** Evaluates eligibility and exclusions (consent missing, suppression, synthetic in live mode), runs `CampaignContentPlanner` (`deterministic-local` for simulation, optional `sarvam-sdk` for live), saves structured plan, updates status to `'planned'`, appends event `campaign.planned`.
- **Error Codes:**
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 PLANNING_BLOCKED`: campaign status not in `['draft', 'planned']`
  - `409 PLAN_STALE`: campaign configuration modified concurrently
  - `503 MODEL_UNAVAILABLE`: model proposal failed
  - `503 MODEL_PROVENANCE_INVALID`: source provenance mismatch
- **Status:** `available`

#### Route 33: Confirm Free Simulation Launch
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/simulate`
- **Controller:** `CampaignsController.simulate` ([`apps/api/src/controllers.ts#L311-L323`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L311-L323))
- **Service Implementation:** `CampaignsService.launch(..., 'simulation')` ([`apps/api/src/campaigns.ts#L428-L545`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L428-L545))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L178-L188`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L178-L188) / `docs/api/openapi.json` (`/campaigns/{id}/simulate`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Headers:** `Idempotency-Key` (required, 8-128 chars `^[A-Za-z0-9_-]+$`)
- **Request Body:** `ConfirmLaunchSchema` ([`packages/contracts/src/index.ts#L166-L168`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L166-L168))
  ```ts
  { confirmed: true }
  ```
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Enqueues contact dispatches into `dispatch` outbox, updates status to `'running'`, appends `campaign.launched` event. Replays safely under same `Idempotency-Key`.
- **Error Codes:**
  - `400 IDEMPOTENCY_KEY_REQUIRED`, `400 VALIDATION_ERROR`
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 IDEMPOTENCY_CONFLICT`: key already used for live launch
  - `409 LAUNCH_BLOCKED`: campaign not in `planned` state or already launched
  - `409 MODE_MISMATCH`: campaign mode is `'live'`
  - `409 NO_ELIGIBLE_CONTACTS`: 0 contacts eligible
  - `409 PLAN_STALE`: eligibility counts diverged from planned count
- **Status:** `available`

#### Route 34: Confirm Guarded Live Telephony Launch
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/launch`
- **Controller:** `CampaignsController.launch` ([`apps/api/src/controllers.ts#L324-L336`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L324-L336))
- **Service Implementation:** `CampaignsService.launch(..., 'live')` ([`apps/api/src/campaigns.ts#L428-L545`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L428-L545))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L178-L188`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L178-L188) / `docs/api/openapi.json` (`/campaigns/{id}/launch`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Headers:** `Idempotency-Key` (required)
- **Request Body:** `ConfirmLaunchSchema`
  ```ts
  { confirmed: true }
  ```
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema`
- **Live Safety Checks:**
  1. `liveReady(config)`: Verifies all Sarvam provider API keys, webhook URLs, and secrets are present.
  2. `allowedLiveDestinations(config)`: Verifies every contact number is present in `ALLOWED_LIVE_DESTINATIONS`.
  3. `policy.concurrency <= 1`: Limits initial live dispatch concurrency to 1.
  4. `cost.estimatedTotalMinor <= policy.budgetMinor`: Enforces budget cap.
- **Error Codes:**
  - `400 LIVE_CONCURRENCY_LIMIT`, `400 BUDGET_EXCEEDED`, `400 IDEMPOTENCY_KEY_REQUIRED`
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  - `403 LIVE_DISABLED`: Sarvam credentials missing
  - `403 DESTINATION_NOT_AUTHORIZED`: un-allowlisted phone number detected
  - `404 NOT_FOUND`
  - `409 IDEMPOTENCY_CONFLICT`, `409 LAUNCH_BLOCKED`, `409 MODE_MISMATCH`, `409 NO_ELIGIBLE_CONTACTS`, `409 PLAN_STALE`
- **Status:** `available`

#### Route 35: Pause Running Campaign
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/pause`
- **Controller:** `CampaignsController.pause` ([`apps/api/src/controllers.ts#L337-L342`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L337-L342))
- **Service Implementation:** `CampaignsService.action(..., 'pause')` ([`apps/api/src/campaigns.ts#L546-L612`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L546-L612))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L189-L194`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L189-L194) / `docs/api/openapi.json` (`/campaigns/{id}/pause`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema`
- **Notes:** Halts new dispatches; active calls in progress are allowed to complete.
- **Error Codes:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_TRANSITION`
- **Status:** `available`

#### Route 36: Resume Paused Campaign
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/resume`
- **Controller:** `CampaignsController.resume` ([`apps/api/src/controllers.ts#L343-L348`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L343-L348))
- **Service Implementation:** `CampaignsService.action(..., 'resume')` ([`apps/api/src/campaigns.ts#L546-L612`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L546-L612))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L189-L194`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L189-L194) / `docs/api/openapi.json` (`/campaigns/{id}/resume`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Re-enqueues queued contacts to `dispatch` outbox, updates status to `'running'`.
- **Error Codes:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `403 LIVE_DISABLED`, `404 NOT_FOUND`, `409 INVALID_TRANSITION`
- **Status:** `available`

#### Route 37: Cancel Active Campaign
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/cancel`
- **Controller:** `CampaignsController.cancel` ([`apps/api/src/controllers.ts#L349-L354`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L349-L354))
- **Service Implementation:** `CampaignsService.action(..., 'cancel')` ([`apps/api/src/campaigns.ts#L546-L612`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L546-L612))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L189-L194`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L189-L194) / `docs/api/openapi.json` (`/campaigns/{id}/cancel`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Request Body:** None
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `CampaignSchema`
- **Side Effects:** Updates status to `'cancelled'`, cancels remaining pending and queued contacts, appends event `campaign.cancelled`.
- **Error Codes:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_TRANSITION`
- **Status:** `available`

#### Route 38: List Campaign Contacts & Outcomes
- **Method:** `GET`
- **Path:** `/api/v1/campaigns/:id/contacts`
- **Controller:** `CampaignsController.contacts` ([`apps/api/src/controllers.ts#L355-L361`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L355-L361))
- **Service Implementation:** `CampaignsService.contacts` ([`apps/api/src/campaigns.ts#L613-L631`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L613-L631))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L196-L200`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L196-L200) / `docs/api/openapi.json` (`/campaigns/{id}/contacts`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(CampaignContactSchema)` ([`packages/contracts/src/index.ts#L498-L514`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L498-L514))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 39: List Campaign Call Attempts
- **Method:** `GET`
- **Path:** `/api/v1/campaigns/:id/attempts`
- **Controller:** `CampaignsController.attempts` ([`apps/api/src/controllers.ts#L362-L368`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L362-L368))
- **Service Implementation:** `CampaignsService.attempts` ([`apps/api/src/campaigns.ts#L632-L650`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L632-L650))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L201-L206`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L201-L206) / `docs/api/openapi.json` (`/campaigns/{id}/attempts`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Query Params:** `limit` (int 1..100, default 30), `cursor` (string offset)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `ListSchema(AttemptSchema)` ([`packages/contracts/src/index.ts#L529-L557`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L529-L557))
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 40: Read Call Inspector & Transcript
- **Method:** `GET`
- **Path:** `/api/v1/calls/:id`
- **Controller:** `CampaignsController.call` ([`apps/api/src/controllers.ts#L369-L374`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L369-L374))
- **Service Implementation:** `CampaignsService.call` ([`apps/api/src/campaigns.ts#L651-L667`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L651-L667))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L207-L212`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L207-L212) / `docs/api/openapi.json` (`/calls/{id}`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID (call attempt ID)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `AttemptSchema` (includes full `analysis` with summary, extracted fields, and structured turn-by-turn `transcript`, plus timeline `events`)
- **Error Codes:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 41: Replay Campaign Specific Events
- **Method:** `GET`
- **Path:** `/api/v1/campaigns/:id/events`
- **Controller:** `WorkspaceController.campaignEvents` ([`apps/api/src/controllers.ts#L109-L115`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L109-L115))
- **Service Implementation:** `OperationsService.events` ([`apps/api/src/operations.ts#L234-L258`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L234-L258))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L213-L218`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L213-L218) / `docs/api/openapi.json` (`/campaigns/{id}/events`)
- **Guards / Auth:** `SessionGuard`
- **Path Params:** `id`: UUID
- **Query Params:** `after: string` (integer cursor, default "0"), `limit: int` (1..100, default 50)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** `{ items: CampaignEventSchema[], nextCursor: string }`
- **Error Codes:** `400 INVALID_CURSOR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`
- **Status:** `available`

#### Route 42: Request Campaign Report Generation
- **Method:** `POST`
- **Path:** `/api/v1/campaigns/:id/reports`
- **Controller:** `WorkspaceController.report` ([`apps/api/src/controllers.ts#L91-L102`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L91-L102))
- **Service Implementation:** `OperationsService.requestReport` ([`apps/api/src/operations.ts#L96-L185`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L96-L185))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L238-L246`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L238-L246) / `docs/api/openapi.json` (`/campaigns/{id}/reports`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Headers:** `Idempotency-Key` (required)
- **Request Body:** `ReportRequestSchema` ([`packages/contracts/src/index.ts#L169-L171`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L169-L171))
  ```ts
  { format: "csv" | "xlsx" }
  ```
- **Response Status:** `202 Accepted` (`@HttpCode(202)`)
- **Response Schema:** `ReportSchema`
- **Side Effects:** Enqueues outbox message `reports` for asynchronous worker spreadsheet compilation.
- **Error Codes:**
  - `400 IDEMPOTENCY_KEY_REQUIRED`, `400 VALIDATION_ERROR`
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 IDEMPOTENCY_CONFLICT`: key already mapped to different campaign/format
  - `409 REPORT_NOT_READY`: in-flight calls still active or campaign has not reached terminal status (`completed`, `cancelled`, `failed`)
- **Status:** `available`

#### Route 43: Download Private Report Artifact
- **Method:** `GET`
- **Path:** `/api/v1/reports/:id/download`
- **Controller:** `WorkspaceController.download` ([`apps/api/src/controllers.ts#L84-L90`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L84-L90))
- **Service Implementation:** `OperationsService.download` ([`apps/api/src/operations.ts#L186-L233`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L186-L233))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L247-L253`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L247-L253) / `docs/api/openapi.json` (`/reports/{id}/download`)
- **Guards / Auth:** `SessionGuard` + `requireWrite(identity)`
- **Path Params:** `id`: UUID
- **Response Status:** `200 OK`
- **Response Headers:**
  - `Content-Type`: `text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition`: `attachment; filename="<sanitized_filename>"`
  - `Cache-Control`: `private, no-store`
  - `X-Content-Type-Options`: `nosniff`
- **Response Body:** Binary byte stream ([`operations.ts#L232`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L232))
- **Side Effects:** Records audit log `report.downloaded`.
- **Error Codes:**
  - `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`
  - `409 REPORT_NOT_READY`: report status is not `completed` or byte artifact is empty
  - `410 REPORT_EXPIRED`: `expires_at < now`
- **Status:** `available`

---

### 3.8 Inbound Webhooks & OpenAPI Schema (2 Routes)

#### Route 44: Published OpenAPI 3.1 Document
- **Method:** `GET`
- **Path:** `/api/v1/openapi.json`
- **Controller:** `PublicController.openapi` ([`apps/api/src/controllers.ts#L381-L383`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L381-L383))
- **Service Implementation:** `openApiDocument` ([`apps/api/src/openapi.ts#L295-L471`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L295-L471))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L406-L411`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L406-L411) / `docs/api/openapi.json` (`/openapi.json`)
- **Guards / Auth:** None (Public)
- **Request Body:** None
- **Response Status:** `200 OK`
- **Response Schema:** OpenAPI 3.1.0 document (JSON)
- **Error Codes:** None
- **Status:** `available`

#### Route 45: Sarvam Telephony Terminal Webhook Callback
- **Method:** `POST`
- **Path:** `/api/v1/webhooks/sarvam/:token`
- **Controller:** `PublicController.webhook` ([`apps/api/src/controllers.ts#L384-L389`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L384-L389))
- **Service Implementation:** `WebhooksService.receive` ([`apps/api/src/webhooks.ts#L9-L103`](file:///Users/kuroyami/CallingAgents/apps/api/src/webhooks.ts#L9-L103))
- **OpenAPI Citation:** [`apps/api/src/openapi.ts#L280-L287`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L280-L287) / `docs/api/openapi.json` (`/webhooks/sarvam/{token}`)
- **Guards / Auth:** Public bearer route with high-entropy timing-safe token verification (`crypto.timingSafeEqual` against `config.SARVAM_WEBHOOK_TOKEN`). Rate limited to 200/min.
- **Path Params:** `token`: Secret token string (minLength 43)
- **Request Body:** `SarvamWebhookSchema` ([`packages/contracts/src/index.ts#L268-L300`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L268-L300))
  ```ts
  {
    attempt_id: string (1-200 chars),
    status: "connected" | "no_answer" | "busy" | "failed",
    channel_info: {
      channel_type: "v2v" | "whatsapp",
      channel_provider: string,
      agent_phone_number: string
    },
    duration?: number | null,
    interaction_id?: string | null,
    failure_reason?: string | null,
    final_agent_variables?: Record<string, unknown> | null,
    webhook_config?: { url: string, metadata?: Record<string, unknown> | null } | null,
    interaction_transcript?: Array<{ role: "agent" | "user", en_text: string }> | null
  }
  ```
- **Response Status:** `200 OK` (`@HttpCode(200)`)
- **Response Schema:** `{ accepted: true, duplicate: boolean }`
- **Side Effects:** Stores raw payload in `webhook_inbox`, enqueues outbox task `reconciliation`, detects contradictory terminal callbacks and flags audit records.
- **Error Codes:**
  - `400 INVALID_WEBHOOK`: payload fails schema or normalization
  - `404 NOT_FOUND`: token mismatch or attempt not initiated
  - `429 RATE_LIMITED`
- **Status:** `available`

---

## 4. Shared DTO & Contract Catalog (`packages/contracts`)

All domain entities and wire types are declared in [`packages/contracts/src/index.ts`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts). Below is the comprehensive schema index:

### 4.1 Enums & Status Literals

| Zod Schema | TypeScript Type | Allowed Literals | Source Citation |
| :--- | :--- | :--- | :--- |
| `ModeSchema` | `Mode` | `'simulation'`, `'live'` | [`index.ts#L4`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L4) |
| `CampaignStatusSchema` | `CampaignStatus` | `'draft'`, `'planned'`, `'running'`, `'paused'`, `'completed'`, `'cancelled'`, `'failed'` | [`index.ts#L5-L13`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L5-L13) |
| `ContactStatusSchema` | `ContactStatus` | `'pending'`, `'queued'`, `'calling'`, `'completed'`, `'excluded'`, `'unknown'`, `'cancelled'` | [`index.ts#L14-L22`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L14-L22) |
| `AttemptStatusSchema` | `AttemptStatus` | `'created'`, `'dispatching'`, `'accepted'`, `'connected'`, `'completed'`, `'failed'`, `'unknown'`, `'cancelled'` | [`index.ts#L23-L32`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L23-L32) |
| `ImportStatusSchema` | `ImportStatus` | `'uploaded'`, `'validating'`, `'ready'`, `'needs_correction'`, `'failed'`, `'cancelled'` | [`index.ts#L33-L40`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L33-L40) |
| `AnalysisStatusSchema` | `AnalysisStatus` | `'pending'`, `'processing'`, `'completed'`, `'failed'`, `'cancelled'` | [`index.ts#L41-L47`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L41-L47) |
| `ReportStatusSchema` | `ReportStatus` | Same as `AnalysisStatusSchema` | [`index.ts#L48`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L48) |
| `OutcomeSchema` | `Outcome` | `'connected'`, `'no_answer'`, `'busy'`, `'failed'`, `'unknown'`, `'cancelled'` | [`index.ts#L49-L56`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L49-L56) |

### 4.2 State Machine Transition Graphs
Defined in [`packages/contracts/src/index.ts#L337-L388`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L337-L388):

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> planned: /campaigns/:id/plan
    draft --> cancelled: /campaigns/:id/cancel
    planned --> draft: /campaigns/:id (PATCH)
    planned --> running: /simulate or /launch
    planned --> cancelled: /campaigns/:id/cancel
    running --> paused: /campaigns/:id/pause
    running --> completed: all contacts terminal
    running --> cancelled: /campaigns/:id/cancel
    running --> failed: unrecoverable failure
    paused --> running: /campaigns/:id/resume
    paused --> completed: all terminal
    paused --> cancelled: /campaigns/:id/cancel
```

### 4.3 Input DTOs

| Schema Name | Target Endpoint | Fields & Validations | Citation |
| :--- | :--- | :--- | :--- |
| `DemoSignInSchema` | `POST /auth/demo` | `email` (email, max 200), `name` (opt, 1-80 chars) | [`index.ts#L90-L93`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L90-L93) |
| `AgentInputSchema` | `POST/PATCH /agents` | `name` (1-100), `description` (max 1000), `prompt` (1-10000), `questions` (max 20 strings), `language` (1-50, default "English") | [`index.ts#L94-L100`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L94-L100) |
| `ImportInputSchema` | `POST /imports` | `filename` (*.csv/*.xlsx), `contentBase64` (max 5 MiB raw), `mapping` (`phone` required), `region` (2-letter code), `synthetic` (boolean) | [`index.ts#L108-L125`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L108-L125) |
| `ImportCorrectionSchema` | `POST /imports/:id/validate` | `mapping` (opt), `region` (opt), `corrections` (array of `{ sourceRow, cells }`, max 10000 rows, max 50 cells/row) | [`index.ts#L126-L141`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L126-L141) |
| `CampaignInputSchema` | `POST /campaigns` | `name` (1-120), `objective` (3-3000), `importId` (UUID), `agentId` (UUID), `mode` (simulation/live), `policy` (PolicySchema) | [`index.ts#L157-L164`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L157-L164) |
| `CampaignPatchSchema` | `PATCH /campaigns/:id` | `CampaignInputSchema.partial()` | [`index.ts#L165`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L165) |
| `ConfirmLaunchSchema` | `POST /simulate`, `/launch` | `confirmed: true` (strictly literal `true`) | [`index.ts#L166-L168`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L166-L168) |
| `ReportRequestSchema` | `POST /campaigns/:id/reports` | `format: "csv" \| "xlsx"` | [`index.ts#L169-L171`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L169-L171) |
| `SuppressionSchema` | `POST /contacts/:id/suppress` | `reason` (1-300 chars, default "Contact opted out") | [`index.ts#L172-L174`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L172-L174) |
| `SettingsSchema` | `PATCH /settings` | `name` (1-100), `timezone` (IANA), `defaultRegion` (2-letter code \| null) | [`index.ts#L175-L183`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L175-L183) |

### 4.4 Entity / Read-Model DTOs

| Schema Name | Primary Consumer Endpoints | Key Fields | Citation |
| :--- | :--- | :--- | :--- |
| `IdentitySchema` | `/auth/demo`, `/me` | `userId`, `workspaceId`, `role`, `email`, `name`, `workspaceName`, `development`, `workspace` | [`index.ts#L579-L588`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L579-L588) |
| `AgentSchema` | `/agents`, `/agents/:id` | `id`, `workspaceId`, `name`, `description`, `currentVersion`, `createdAt`, `versionId`, `prompt`, `questions`, `language` | [`index.ts#L430-L441`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L430-L441) |
| `AgentVersionSchema` | `/agents/:id/versions` | `id`, `version`, `prompt`, `questions`, `language`, `createdAt` | [`index.ts#L442-L449`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L442-L449) |
| `ImportSchema` | `/imports`, `/imports/:id` | `id`, `status`, `filename`, `mapping`, `region`, `rowCount`, `validCount`, `errorCount`, `failureCode`, `createdAt`, `updatedAt`, `synthetic` | [`index.ts#L450-L463`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L450-L463) |
| `ImportRowSchema` | `/imports/:id/rows` | `id`, `sourceRow`, `sourceCells`, `normalizedPhone`, `issues`, `status`, `contactId` | [`index.ts#L148-L156`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L148-L156) |
| `ContactSchema` | `/contacts` | `id`, `workspaceId`, `name`, `phone`, `attributes`, `consent`, `synthetic`, `createdAt`, `suppressionReason` | [`index.ts#L464-L474`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L464-L474) |
| `CampaignSchema` | `/campaigns`, `/campaigns/:id` | `id`, `name`, `objective`, `mode`, `status`, `agentVersionId`, `importId`, `policy`, `plan`, `launchKey`, `reservedMinor`, `agentId`, `agentName`, `progress`, `outcomes` | [`index.ts#L475-L497`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L475-L497) |
| `CampaignPlanSchema` | `/campaigns/:id/plan` | `version: 1`, `planner`, `model`, `eligibleCount`, `excludedCount`, `exclusions`, `steps`, `questions`, `cost` (`currency`, `estimatedTotalMinor`, `isEstimate`, `assumptions`) | [`index.ts#L202-L228`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L202-L228) |
| `CampaignContactSchema` | `/campaigns/:id/contacts` | `id`, `campaignId`, `contactId`, `status`, `reason`, `position`, `name`, `phone`, `synthetic`, `attemptId`, `outcome`, `durationSeconds`, `attemptStatus` | [`index.ts#L498-L514`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L498-L514) |
| `AttemptSchema` | `/campaigns/:id/attempts`, `/calls/:id` | `id`, `campaignId`, `campaignContactId`, `provider`, `mode`, `status`, `outcome`, `startedAt`, `completedAt`, `durationSeconds`, `analysis`, `events` | [`index.ts#L529-L557`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L529-L557) |
| `AnalysisSchema` | `/calls/:id` (sub-record) | `id`, `status`, `transcript` (turns), `extractedFields`, `summary`, `summarySource`, `summaryModel`, `synthetic`, `failureCode` | [`index.ts#L515-L528`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L515-L528) |
| `ReportSchema` | `/reports`, `/campaigns/:id/reports` | `id`, `campaignId`, `format`, `status`, `filename`, `contentType`, `rowCount`, `failureCode`, `expiresAt`, `createdAt`, `campaignName` | [`index.ts#L558-L571`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L558-L571) |
| `OverviewSchema` | `/overview` | `campaignCount`, `contactCount`, `simulationAttempts`, `liveAttempts`, `campaignCounts`, `contacts`, `reportCounts`, `attemptCounts`, `recentEvents` | [`index.ts#L620-L644`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L620-L644) |
| `IntegrationSchema` | `/integrations` | `provider`, `simulationReady`, `liveReady`, `liveEnabled`, `missingConfiguration`, `capabilities`, `webhookSecurity`, `costNote`, `planner` | [`index.ts#L589-L610`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L589-L610) |
| `CampaignEventSchema` | `/events`, `/campaigns/:id/events`, `/stream` | `id`, `workspaceId`, `campaignId`, `type`, `payload`, `createdAt` | [`index.ts#L312-L319`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L312-L319) |

---

## 5. OpenAPI Specification Analysis (`docs/api/openapi.json`)

The generated OpenAPI specification at `docs/api/openapi.json` is generated directly from the shared TypeScript operation catalog via `npm run docs:api` (`node --import tsx scripts/generate-openapi.mjs`).

### 5.1 Document Metadata
- **OpenAPI Specification Version:** `3.1.0`
- **API Version:** `0.1.0`
- **Title:** `Outreach Intern API`
- **Default Server URL:** `/api/v1`
- **Root-level Overrides:** `/health/live` and `/health/ready` specify `servers: [{ url: "/" }]`.
- **Security Scheme:**
  ```json
  "components": {
    "securitySchemes": {
      "cookieSession": {
        "type": "apiKey",
        "in": "cookie",
        "name": "outreach_session"
      }
    }
  }
  ```

### 5.2 Schema Dialect
The JSON Schema output target is `draft-2020-12` (via `z.toJSONSchema` in [`apps/api/src/openapi.ts#L290`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L290)). It outputs strict schemas where `additionalProperties: false` is enforced on command inputs, preventing rogue fields.

---

## 6. Critical Technical Guidance for Flutter UI Implementation

Building a robust Flutter desktop/mobile application against this backend requires adhering to several architectural constraints implemented by the NestJS server.

### 6.1 Cookie-Based Session Management in Dart
Because the backend expects `outreach_session` exclusively as an HTTP cookie:
1. **Use Dio + CookieJar:** Configure `Dio` with `dio_cookie_manager` and an in-memory or persisted `CookieJar`:
   ```dart
   final dio = Dio(BaseOptions(
     baseUrl: 'http://localhost:3000/api/v1',
     validateStatus: (status) => status != null && status < 500,
     headers: {'Content-Type': 'application/json'},
   ));
   final cookieJar = CookieJar();
   dio.interceptors.add(CookieManager(cookieJar));
   ```
2. **Session Persistence:** When running on macOS Desktop or mobile devices, serialize the session cookie securely using `flutter_secure_storage` or a persistent cookie jar (`PersistCookieJar`).
3. **Session Expiry Handling:** Intercept HTTP `401 UNAUTHENTICATED` responses globally to redirect the user to the Sign-In screen.

### 6.2 Managing the Origin Header
To satisfy [`verifyOrigin`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L35):
- In **Native Flutter (macOS, iOS, Android):** Do not inject an arbitrary `Origin` header. When `req.get('Origin')` is missing and `Sec-Fetch-Site` is not `cross-site`, the check passes.
- In **Flutter Web:** Ensure the Flutter web development server port (e.g. `http://localhost:8080`) is listed in the backend's `ALLOWED_ORIGINS` environment variable.

### 6.3 Idempotency Header Generation
For mutations that initiate background work (`/simulate`, `/launch`, `/reports`):
- Generate a client-side UUID v4 using the `uuid` package:
  ```dart
  import 'package:uuid/uuid.dart';
  final idempotencyKey = const Uuid().v4();
  ```
- Send in the header: `'Idempotency-Key': idempotencyKey`.
- Note: Re-submitting the same key after a network failure will safely return the existing record without duplicating runs.

### 6.4 Consuming Server-Sent Events (SSE)
For live campaign tracking at `/campaigns/:id/stream?after=<cursor>`:
- The endpoint sends standard SSE frames with heartbeat comments (`: heartbeat`) and `id: <cursor>`.
- Use a streaming client or package (such as `flutter_client_sse` or direct `dart:io` / `http.Client.send` streaming):
  ```dart
  final request = http.Request('GET', Uri.parse('$baseUrl/campaigns/$id/stream?after=$lastId'));
  request.headers['Cookie'] = 'outreach_session=$token';
  request.headers['Accept'] = 'text/event-stream';
  final response = await client.send(request);
  response.stream
      .transform(utf8.decoder)
      .transform(const LineSplitter())
      .listen((line) {
        // Parse "id: ...", "data: ...", and discard ": heartbeat"
      });
  ```
- Reconnect automatically with backoff when receiving `event: reconnect` or socket disconnects, passing the highest received `id` as `after` or `Last-Event-ID`.

### 6.5 File Uploads (Base64 JSON Payload)
Unlike standard multipart form uploads, `POST /api/v1/imports` accepts a JSON body:
- Read local CSV/XLSX file bytes.
- Enforce file size limit `<= 5 MiB` before sending.
- Encode as Base64 string:
  ```dart
  final bytes = await file.readAsBytes();
  if (bytes.length > 5 * 1024 * 1024) throw Exception('File exceeds 5 MiB');
  final base64Content = base64Encode(bytes);
  ```
- Post payload to `/api/v1/imports` with `filename`, `contentBase64`, and column `mapping`.

### 6.6 Binary Report Downloads
Endpoint `GET /api/v1/reports/:id/download` returns a binary stream:
- Request with `responseType: ResponseType.bytes` in Dio.
- Read `Content-Disposition` header to extract the recommended sanitized filename.
- Save bytes to the user's downloads folder (or present via share sheet on mobile).

### 6.7 Role-Based UI Permissions
The backend enforces `requireWrite` on all mutations:
- Inspect `identity.role` from `GET /api/v1/me`.
- If `role == 'viewer'`, disable or hide UI elements that trigger `POST`, `PATCH`, or `DELETE` operations (e.g., launch buttons, settings save, suppression, import uploads).

---

## 7. Audit Sign-Off

- **Audit Complete:** Yes
- **All 45 Routes Accounted For:** Yes
- **Discrepancies Found Between Routes, Controllers, & OpenAPI:** None (100% matched)
- **Target File Generated:** `docs/flutter-ui/backend-audit/api-contracts.md`
