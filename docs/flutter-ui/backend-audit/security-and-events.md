# Backend Audit: Authentication, Uploads, Real-Time Events, and Security Boundaries

**Date:** 2026-10-26  
**Auditor:** Agent D (Authentication, Uploads, Events, and Security Boundary)  
**Target Architecture:** Flutter Client (`apps/flutter_app`) communicating with NestJS Backend (`apps/api`) & Worker (`apps/worker`)  
**Scope:** Authentication, Session Lifecycle, Flutter Client Implications, Real-Time SSE Streams, File Upload / Validation Workflows, Report Generation / Download, and Tenant / Provider Security Boundaries.

---

## Executive Summary

This audit establishes the rigorous technical contract for authentication, data ingestion, event delivery, and security boundaries across the Outreach platform. The backend employs a local-first, zero-cloud architecture ([ADR-003](file:///Users/kuroyami/CallingAgents/docs/architecture/decisions/ADR-003-local-auth-and-artifacts.md#L1-L5)) with strict multitenant isolation, server-side credential isolation ([ADR-004](file:///Users/kuroyami/CallingAgents/docs/architecture/decisions/ADR-004-sarvam-live-boundary.md#L1-L3)), and private database artifact persistence.

Key operational findings for the upcoming Flutter client:
1. **Cookie-Only Session Authentication:** The API strictly inspects the `Cookie: outreach_session=<token>` header and does **not** accept `Authorization: Bearer` headers. Flutter HTTP clients (`dio` / `http`) must maintain a persistent CookieJar.
2. **CSRF & Origin Enforcement:** `verifyOrigin` rejects requests from unauthorized browser origins. Mobile clients omitting `Origin` headers pass safely; however, clients sending arbitrary origins or non-`application/json` bodies on POST/PATCH will be rejected.
3. **SSE Real-Time Delivery:** The campaign stream endpoint (`/api/v1/campaigns/:id/stream`) pushes monotonic 64-bit event IDs, 15-second heartbeat comments (`: heartbeat\n\n`), and supports reconnection via `Last-Event-ID` or `?after=<cursor>`.
4. **Base64 JSON File Uploads:** Uploads accept CSV and XLSX files up to 5 MiB encoded as base64 inside a JSON payload (no `multipart/form-data`). Ingestion includes zip bomb prevention (50 MiB expanded limit), formula injection mitigation, and an interactive row-correction workflow.
5. **Private Bytea Artifacts & Safe Downloads:** Final campaign reports (up to 10,000 rows / 20 MiB) are generated asynchronously, protected by `Idempotency-Key`, stored directly in PostgreSQL as `bytea`, and served with anti-sniff, private caching, and sanitised CSV/XLSX cell formulas.
6. **Zero Client Secrets:** All Sarvam provider API keys, webhook signing secrets, and model credentials reside strictly server-side. No vendor credentials or raw provider payloads are ever exposed to the client.

---

## 1. Authentication & Session Management

### 1.1 Development Sign-In (`POST /api/v1/auth/demo`)

Development authentication is implemented in [`apps/api/src/auth.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L58-L137) and routed through [`apps/api/src/controllers.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L30-L37).

```
Client (Flutter)                     NestJS API (auth.ts)                  PostgreSQL
     │                                        │                                │
     │  POST /api/v1/auth/demo                │                                │
     │  { "email": "user@example.com" }      │                                │
     ├───────────────────────────────────────>│                                │
     │                                        │ verifyOrigin(req)              │
     │                                        │ Check DEV_AUTH && !production  │
     │                                        │ Gen token (randomBytes 32)     │
     │                                        │                                │
     │                                        │ BEGIN TRANSACTION              │
     │                                        │───────────────────────────────>│
     │                                        │ SELECT pg_advisory_xact_lock   │
     │                                        │ Upsert user & workspace        │
     │                                        │ Seed 5 personas (if new ws)    │
     │                                        │ INSERT sessions(token_hash...) │
     │                                        │ INSERT audit_log(...)          │
     │                                        │ COMMIT                         │
     │                                        │<───────────────────────────────│
     │  200 OK                                │                                │
     │  Set-Cookie: outreach_session=<token>  │                                │
     │  { userId, workspaceId, role, ... }    │                                │
     │<───────────────────────────────────────│                                │
```

* **Endpoint Signature:** `POST /api/v1/auth/demo` -> Returns HTTP 200 with `SessionIdentity` JSON.
* **Input Validation:** Input is validated against `DemoSignInSchema` ([`packages/contracts/src/index.ts:50-54`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L50-L54)):
  ```typescript
  export const DemoSignInSchema = z.strictObject({
    email: z.string().email(),
    name: z.string().min(1).max(100).optional(),
  });
  ```
* **Production Guard:** Lines 59–64 of [`apps/api/src/auth.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L59-L64) strictly forbid demo authentication in production:
  ```typescript
  if (!config.DEV_AUTH || config.NODE_ENV === 'production')
    throw new DomainError('DEMO_DISABLED', 'Development sign-in is disabled', 403);
  ```
* **Token Generation & Cryptographic Hashing:**
  * Raw token: 32 bytes of cryptographically secure random bytes generated via `randomBytes(32).toString('base64url')` (producing a 43-character URL-safe string, line 67).
  * Storage digest: Stored as SHA-256 hex digest: `createHash('sha256').update(token).digest('hex')` (lines 32–34, 105). The raw token is **never** persisted to disk or database.
* **Concurrency Locking & Provisioning:**
  * Uses transaction-scoped PostgreSQL advisory locking: `SELECT pg_advisory_xact_lock(hashtext($1))` keyed to `demo:${email}` (lines 69–71) to prevent race conditions during simultaneous logins.
  * Upserts the user record into `users(email, name)`.
  * If the user has no existing workspace, creates a default workspace (`Asia/Kolkata` timezone), grants the `owner` role in `memberships`, and automatically seeds the 5 default agent personas via `seedAgentPersonas` (lines 84–101).
* **Session Cookie Properties:**
  * Name: `outreach_session`
  * Value: Raw 43-character base64url token.
  * Cookie options (lines 129–135):
    * `httpOnly: true` (prevents browser JavaScript extraction)
    * `sameSite: 'strict'` (blocks cross-site request forgery)
    * `secure: false` (allows local HTTP testing; should be set to true in HTTPS production)
    * `maxAge: config.SESSION_TTL_HOURS * 3600000` (derived from configuration)
    * `path: '/'`
* **Audit Logging:** Logs audit event `'auth.demo_signin'` directly within the database transaction (lines 111–118).

### 1.2 Session Identity & Resolution

Protected endpoints resolve caller identity using `SessionGuard` ([`apps/api/src/auth.ts:171-180`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L171-L180)):

* **Cookie Parsing (`cookie()`):** Lines 25–31 read the incoming `req.headers.cookie`, parse key-value pairs, and extract `outreach_session`.
* **Regex Token Validation:** Line 140 checks `!token || !/^[A-Za-z0-9_-]{43}$/.test(token)`. Malformed tokens immediately reject with 401 `UNAUTHENTICATED`.
* **Database Verification:**
  ```sql
  SELECT s.user_id, s.workspace_id, m.role, u.email, u.name
  FROM sessions s
  JOIN memberships m ON m.workspace_id = s.workspace_id AND m.user_id = s.user_id
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = $1 AND s.expires_at > now()
  ```
  If no active session matches the SHA-256 digest or if `expires_at <= now()`, throws 401 `UNAUTHENTICATED` ("Session expired; sign in again").
* **Identity Injection:** Attaches `req.identity` with `{ userId, workspaceId, role, email, name }` to the request object ([`apps/api/src/common.ts:43-50`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L43-L50)).

### 1.3 CSRF, Origin Enforcement & Content-Type (`verifyOrigin`)

Enforced by `verifyOrigin(req)` in [`apps/api/src/auth.ts:35-55`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L35-L55) on all mutating methods:
1. **Safe Method Bypass:** `GET`, `HEAD`, and `OPTIONS` bypass origin verification (line 36).
2. **Origin Whitelist:** Checked against `(config.ALLOWED_ORIGINS || config.PUBLIC_BASE_URL).split(',')` (lines 38–40). Default allowed origin is `http://localhost:5173`.
3. **Origin Rejection:** If the `Origin` header is present and does not match the whitelist, throws 403 `ORIGIN_REJECTED` (lines 41–46).
4. **Cross-Site Fetch Rejection:** If `Origin` is missing, but `Sec-Fetch-Site === 'cross-site'`, throws 403 `ORIGIN_REJECTED` (lines 47–52).
5. **Content-Type Enforcement:** If `Content-Type` is supplied, it must satisfy `req.is('application/json')`, or the API throws 415 `CONTENT_TYPE_REQUIRED` ("Use application/json", lines 53–54).

### 1.4 Rate Limiting & Denial of Service Protection

Implemented in [`apps/api/src/main.ts:106-132`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L106-L132) via an in-memory sliding window bucket:
* Route prefix `/api/v1/auth`: **30 requests per minute** per client IP.
* Route prefix `/api/v1/webhooks`: **200 requests per minute** per client IP.
* Exceeding the bucket returns HTTP 429 `{ error: { code: 'RATE_LIMITED', message: 'Retry after the current minute' } }`.

### 1.5 Session Expiry (TTL) & Logout (`POST /api/v1/auth/logout`)

* **Session TTL:** Controlled by `config.SESSION_TTL_HOURS` ([`packages/config/src/index.ts:57`](file:///Users/kuroyami/CallingAgents/packages/config/src/index.ts#L57)), defaulting to 24 hours (min 1, max 168 hours / 7 days).
* **Logout Flow:** [`apps/api/src/auth.ts:161-169`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L161-L169):
  1. Validates origin via `verifyOrigin(req)`.
  2. Extracts cookie token.
  3. Deletes session row from PostgreSQL: `DELETE FROM sessions WHERE token_hash=$1`.
  4. Instructs client to clear cookie: `res.clearCookie('outreach_session', { path: '/' })`.
  5. Returns `{ signedOut: true }`.
* **Worker Retention Sweeper:** Every worker tick ([`apps/worker/src/main.ts:237`](file:///Users/kuroyami/CallingAgents/apps/worker/src/main.ts#L237)), expired sessions are cleaned up:
  `DELETE FROM sessions WHERE expires_at < now()`.

---

## 2. Flutter Client Authentication Implications

### 2.1 The Cookie vs. Authorization Header Reality

> [!IMPORTANT]
> **API Has Zero `Authorization: Bearer` Support:**  
> The backend authentication engine in [`apps/api/src/auth.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L139-L145) and OpenAPI spec in [`apps/api/src/openapi.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/openapi.ts#L462-L467) strictly look for cookie named `outreach_session`. Passing `Authorization: Bearer <token>` **will result in a 401 UNAUTHENTICATED error**.

In browser environments, `fetch` with `credentials: 'include'` automatically handles cookies. In Flutter (mobile/desktop), Dart HTTP clients (`dart:io` `HttpClient`, `package:http`, or `dio`) do not automatically manage cookie jars across process lifecycles.

### 2.2 Recommended Flutter Auth Architecture

To handle this cleanly in `apps/flutter_app`:
1. **Cookie Jar Storage:** Use `dio` coupled with `dio_cookie_manager` and `cookie_jar` (or `persist_cookie_jar`).
2. **Explicit Header Injection:** Alternatively, store the raw token string in secure storage (`flutter_secure_storage`) upon receiving the `Set-Cookie` header during sign-in, and register an interceptor that appends `Cookie: outreach_session=$token` to every request.
3. **Origin Header Strategy:**
   * By default, native Dart mobile requests omit the `Origin` header. As seen in [`apps/api/src/auth.ts:47`](file:///Users/kuroyami/CallingAgents/apps/api/src/auth.ts#L47), if `Origin` is null and `Sec-Fetch-Site` is not `cross-site`, the request succeeds.
   * **Caution:** If Flutter developers configure an interceptor adding `Origin: 'http://localhost'` or a custom app scheme like `outreach://app`, the API will throw 403 `ORIGIN_REJECTED` because it is not in `ALLOWED_ORIGINS`.
   * **Rule for Flutter:** Either **omit** the `Origin` header completely, or configure the client to send the matching `PUBLIC_BASE_URL` (e.g. `http://localhost:5173`).
4. **Mandatory JSON Content-Type:** Every POST and PATCH call must explicitly set `Content-Type: application/json` to avoid 415 `CONTENT_TYPE_REQUIRED`.

### 2.3 Mobile Network Client Resilience

| Network Scenario | Backend Behavior | Recommended Flutter Client Strategy |
| :--- | :--- | :--- |
| **Cellular to Wi-Fi Handoff (IP Change)** | Backend sessions are keyed to `token_hash` in PostgreSQL, not client IP. Valid token continues to work seamlessly. | None needed; session remains valid regardless of IP changes. |
| **Transient Network Drop** | Request times out or fails at socket layer. | Idempotent retries on GETs; for mutations (`launch`, `reports`), supply the same `Idempotency-Key` or `launchKey`. |
| **App Backgrounding / Process Kill** | Token stored in volatile memory is lost. | Persist session token in iOS Keychain / Android EncryptedSharedPreferences via `flutter_secure_storage`. On app startup, verify session via `GET /api/v1/me`. |
| **Session Expiry (401)** | Backend returns `{ "error": { "code": "UNAUTHENTICATED", "message": "Session expired; sign in again" } }`. | Interceptor catches 401, clears stored credentials, and routes user to login view. |

---

## 3. Real-Time Events: Server-Sent Events (SSE) & Polling

### 3.1 Architecture Overview

The API provides two mechanisms to observe campaign progress and system events:
1. **Persistent SSE Stream:** `GET /api/v1/campaigns/:id/stream` (implemented in [`apps/api/src/controllers.ts:116-175`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L116-L175) and [`apps/api/src/streams.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/streams.ts#L1-L42)).
2. **Paginated Event Polling:** `GET /api/v1/campaigns/:id/events` and `GET /api/v1/events` (implemented in [`apps/api/src/operations.ts:234-258`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L234-L258)).

```
Flutter Client                           NestJS API (controllers.ts)        PostgreSQL (campaign_events)
     │                                                │                                   │
     │  GET /campaigns/:id/stream                     │                                   │
     │  Cookie: outreach_session=...                  │                                   │
     │  Last-Event-ID: 1042                           │                                   │
     ├───────────────────────────────────────────────>│                                   │
     │                                                │ StreamsService.register(res)      │
     │                                                │ Flush headers: text/event-stream  │
     │  200 OK (text/event-stream)                    │                                   │
     │<───────────────────────────────────────────────│                                   │
     │                                                │                                   │
     │                                                │ Loop (every 750ms):               │
     │                                                │ SELECT * FROM campaign_events     │
     │                                                │ WHERE workspace_id=$1 AND id > $2 │
     │                                                │──────────────────────────────────>│
     │                                                │<──────────────────────────────────│
     │  id: 1043                                      │                                   │
     │  data: {"id":"1043","type":"attempt.accepted"} │                                   │
     │<───────────────────────────────────────────────│                                   │
     │                                                │                                   │
     │  : heartbeat (every 15s)                       │                                   │
     │<───────────────────────────────────────────────│                                   │
     │                                                │ Session re-check (every 30s)      │
     │                                                │                                   │
```

### 3.2 SSE Stream Mechanics (`GET /api/v1/campaigns/:id/stream`)

* **Permission & Ownership Verification:** Line 123 calls `this.service.events(req.identity, { after: cursor, limit: 1 }, id)`. If the campaign does not exist or belongs to another workspace, it immediately fails with 404 `NOT_FOUND` before any headers are flushed.
* **HTTP Headers Sent (lines 129–133):**
  * `Content-Type: text/event-stream`
  * `Cache-Control: no-cache, no-transform`
  * `Connection: keep-alive`
  * `X-Accel-Buffering: no` (disables reverse proxy buffering in Nginx)
* **Monotonic Event Cursor (`Last-Event-ID` vs. `?after=`):**
  * Line 122: `let cursor = req.get('Last-Event-ID') || String(query.after || '0');`
  * The stream accepts the cursor from **either** the standard HTTP header `Last-Event-ID` or query parameter `?after=<bigint>`.
  * The database table `campaign_events` uses a 64-bit monotonically increasing sequence ([`packages/database/src/schema.ts:449-451`](file:///Users/kuroyami/CallingAgents/packages/database/src/schema.ts#L449-L451)):
    `id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey()`
  * Format sent over wire (line 151):
    ```
    id: 1043
    data: {"id":"1043","workspaceId":"...","campaignId":"...","type":"attempt.terminal","payload":{...},"createdAt":"2026-10-26T17:46:00.000Z"}
    ```
* **Heartbeats & Keep-Alive:**
  * Lines 158–161: If 15 seconds elapse without an event (`Date.now() - lastHeartbeat > 15000`), the server writes:
    ```
    : heartbeat
    ```
  * In the SSE standard, lines beginning with a colon (`:`) are comments. This prevents mobile carrier NAT timeouts and middlebox socket termination.
* **Active Re-Authorization:**
  * Lines 138–142: Every 30 seconds (`Date.now() - lastAuthorization > 30000`), the server re-validates the session against the database (`this.auth.identity(req)`). If the session expired or the workspace changed, the stream terminates immediately.
* **Stream Termination & Reconnection Triggers:**
  * **Server Shutdown:** If the API receives SIGTERM/SIGINT, [`apps/api/src/streams.ts:29-41`](file:///Users/kuroyami/CallingAgents/apps/api/src/streams.ts#L29-L41) intercepts the shutdown and emits:
    ```
    event: reconnect
    data: {"reason":"server_shutdown"}
    ```
  * **Dependency Error:** If database or Redis encounters an error during the polling loop, lines 163–167 emit:
    ```
    event: reconnect
    data: {"reason":"dependency_unavailable"}
    ```
  * **Campaign Terminal State:** The server loop does **not** close automatically when a campaign reaches `completed` or `failed`. It remains open to deliver subsequent reports (`report.requested`, `report.completed`) or analysis updates. The client may disconnect when appropriate.

### 3.3 Event Schema Catalog

Events conform to `CampaignEventSchema` ([`packages/contracts/src/index.ts:312-319`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L312-L319)). Identified event types across the system:

| Event Type (`type`) | Source Location | Description |
| :--- | :--- | :--- |
| `campaign.created` | [`apps/api/src/campaigns.ts:175`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L175) | Initial campaign entity created from import. |
| `campaign.updated` | [`apps/api/src/campaigns.ts:242`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L242) | Metadata, name, or persona updated. |
| `campaign.planned` | [`apps/api/src/campaigns.ts:400`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L400) | Policy and target contact list planned. |
| `campaign.launched` | [`apps/api/src/campaigns.ts:528`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L528) | Running state entered; outbox dispatch triggered. |
| `campaign.paused` | [`apps/api/src/campaigns.ts:595`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L595), [`apps/worker/src/calls.ts:277`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L277) | Paused by user or budget/concurrency limits. |
| `campaign.resumed` | [`apps/api/src/campaigns.ts:595`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L595) | Resumed by operator. |
| `campaign.cancelled` | [`apps/api/src/campaigns.ts:595`](file:///Users/kuroyami/CallingAgents/apps/api/src/campaigns.ts#L595) | Cancelled by operator; pending contacts aborted. |
| `campaign.completed` | [`apps/worker/src/calls.ts:45`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L45) | All campaign contacts reached terminal states. |
| `campaign.failed` | [`apps/worker/src/calls.ts:234`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L234) | Fatal error occurred (policy or system failure). |
| `attempt.accepted` | [`apps/worker/src/calls.ts:387`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L387) | Voice provider accepted outbound call request. |
| `attempt.rejected` | [`apps/worker/src/calls.ts:403`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L403) | Voice provider rejected call initiation. |
| `attempt.terminal` | [`apps/worker/src/calls.ts:123`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L123) | Call ended (`connected`, `no_answer`, `busy`, `failed`). |
| `attempt.unknown` | [`apps/worker/src/main.ts:199`](file:///Users/kuroyami/CallingAgents/apps/worker/src/main.ts#L199) | Provider recovery or webhook reconciliation timeout. |
| `analysis.completed` | [`apps/worker/src/calls.ts:519`](file:///Users/kuroyami/CallingAgents/apps/worker/src/calls.ts#L519) | Call transcript summarization and analysis completed. |
| `report.requested` | [`apps/api/src/operations.ts:167`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L167) | Report export job queued in worker. |
| `report.completed` | [`apps/worker/src/reports.ts:97`](file:///Users/kuroyami/CallingAgents/apps/worker/src/reports.ts#L97) | CSV/XLSX artifact generated and ready for download. |

### 3.4 Flutter Implementation: SSE vs. Polling Fallback

Flutter clients should implement a dual-mode event listener:
```dart
// Conceptual Flutter Event Stream Handler
class CampaignEventRepository {
  Stream<CampaignEvent> streamEvents(String campaignId, {String? lastEventId}) async* {
    // 1. Establish SSE Connection via http.Client or specialized SSE client
    // 2. Pass headers:
    //    'Cookie': 'outreach_session=$token',
    //    'Last-Event-ID': lastEventId ?? '0',
    //    'Accept': 'text/event-stream'
    // 3. Filter out comments (lines starting with ':')
    // 4. On disconnect or error, catch and fallback to paginated polling:
    //    GET /api/v1/campaigns/$campaignId/events?after=$lastEventId&limit=50
  }
}
```

---

## 4. File Upload Constraints & Row Validation Workflow

### 4.1 Ingestion Constraints & Payloads

File upload is handled via `POST /api/v1/imports` ([`apps/api/src/imports.ts:39-83`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L39-L83)).

> [!WARNING]
> **Base64 JSON Body Required (Not Multipart):**  
> The backend does **not** accept `multipart/form-data`. Uploads must be encoded as base64 inside a JSON payload conforming to `ImportInputSchema` ([`packages/contracts/src/index.ts:56-69`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L56-L69)).

* **Payload Structure:**
  ```json
  {
    "filename": "contacts.xlsx",
    "contentBase64": "UEsDBBQAAAAIA...",
    "mapping": {
      "phone": "Phone",
      "name": "Full Name",
      "consent": "Consented",
      "outcome": "SimulatedOutcome"
    },
    "region": "IN",
    "synthetic": false
  }
  ```
* **Size Limits & Memory Guardrails:**
  * **Express JSON Parser Limit:** Configured to `7mb` in [`apps/api/src/main.ts:99`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L99) (`app.use(json({ limit: '7mb', strict: true }))`). This ensures a 5 MiB binary file (~6.67 MiB base64 encoded) can be parsed without throwing 413 Payload Too Large.
  * **Binary Buffer Limit:** Line 43 of [`apps/api/src/imports.ts`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L43) rejects decoded buffers exceeding 5,242,880 bytes (5 MiB):
    ```typescript
    if (bytes.length > 5242880 || !bytes.length)
      throw new DomainError('FILE_SIZE_LIMIT', 'Upload a nonempty file no larger than 5 MiB');
    ```
  * **Maximum Rows:** Capped at **10,000 rows** ([`apps/worker/src/imports.ts:111`](file:///Users/kuroyami/CallingAgents/apps/worker/src/imports.ts#L111)).
  * **Maximum Columns:** Capped at **50 columns** ([`apps/worker/src/imports.ts:69`](file:///Users/kuroyami/CallingAgents/apps/worker/src/imports.ts#L69)).
  * **Maximum Cell Length:** Capped at **2,000 characters** per cell ([`apps/worker/src/imports.ts:84`](file:///Users/kuroyami/CallingAgents/apps/worker/src/imports.ts#L84)).

### 4.2 Security Defenses: Zip Bombs & Formula Injection

Implemented in [`apps/worker/src/imports.ts`](file:///Users/kuroyami/CallingAgents/apps/worker/src/imports.ts#L33-L65):
1. **XLSX Archive Verification (`validateXlsxArchive`):**
   * Inspects ZIP End of Central Directory signature (`0x06054b50`).
   * Capped at 1,000 archive entries.
   * Calculates total expanded uncompressed size: if sum exceeds **50 MiB** (`50 * 1024 * 1024`), rejects with `XLSX_EXPANDED_LIMIT` to eliminate ZIP bomb attacks.
2. **Formula Injection Sanitization:**
   * Lines 158–159 & 220–229 detect spreadsheet formula injection via regex:
     ```typescript
     const suspicious = (value: string) =>
       /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(value) || /^[\t\r\n]/.test(value);
     ```
   * Any cell starting with `=, +, -, @`, full-width unicode equivalents, or whitespace/tabs is flagged with issue code `SPREADSHEET_FORMULA` (unless it is the mapped phone column beginning with `+` followed by valid E.164 digits).

### 4.3 Phone & Synthetic Destination Validation

* **E.164 Normalization:** Handled by `libphonenumber-js/max` ([`apps/worker/src/imports.ts:16-32`](file:///Users/kuroyami/CallingAgents/apps/worker/src/imports.ts#L16-L32)). If phone numbers omit leading `+`, a valid ISO country code (`region`) is mandatory.
* **Synthetic Sandbox Isolation:** If `synthetic: true`, phone numbers **must** strictly match `/^\+1[2-9]\d{2}55501\d{2}$/` (reserved 555-01xx fictitious North American numbers, lines 244–251). Real phone numbers in synthetic imports are rejected with `SYNTHETIC_RANGE`.

### 4.4 Row Statuses & The Correction Workflow

Rows are validated by the worker into `import_rows`:

```
   Raw File Uploaded
          │
          ▼
   Worker processImport()
          │
    ┌─────┴───────────────────────────────────────────────────────┐
    │                                                             │
    ▼                                                             ▼
[Blocking Errors Exist]                                   [Zero Blocking Errors]
(INVALID_PHONE, SPREADSHEET_FORMULA,                      (All rows valid, duplicate,
SYNTHETIC_RANGE)                                          or excluded)
    │                                                             │
    ▼                                                             ▼
Import Status:                                            Import Status:
needs_correction                                          ready
    │                                                             │
    ▼                                                             ▼
User views invalid rows via                               Campaign planning
GET /api/v1/imports/:id/rows                              can proceed
    │
    ▼
User submits fixes via
POST /api/v1/imports/:id/validate
{ "corrections": [{ "sourceRow": 4, "cells": {"Phone": "+919876543210"} }] }
    │
    ▼
API updates imports.corrections JSONB
and resets status to 'uploaded'
    │
    ▼
Worker re-runs processImport()
```

* **Row Status Classification:**
  * `valid`: Phone normalized, consent present, destination allowed.
  * `invalid`: Malformed phone, formula cell, or synthetic violation. **Increments `blocking` count.**
  * `duplicate`: Phone occurs more than once within the same import file.
  * `excluded`: Contact is on workspace suppression list (`SUPPRESSED`) or missing explicit consent evidence (`CONSENT_MISSING`).
* **Correction Endpoint (`POST /api/v1/imports/:id/validate`):**
  * Handled in [`apps/api/src/imports.ts:101-211`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L101-L211).
  * Payload conforms to `ImportCorrectionSchema` ([`packages/contracts/src/index.ts:71-80`](file:///Users/kuroyami/CallingAgents/packages/contracts/src/index.ts#L71-L80)).
  * Enforces that the import is not currently validating (`IMPORT_BUSY`), that the original source bytes have not expired (`IMPORT_SOURCE_EXPIRED`), and that the import is not currently associated with an active campaign (`IMPORT_IN_USE`).
  * Applies edits to `imports.corrections` JSONB, resets status to `uploaded`, and re-enqueues the import to the outbox for background re-validation.

---

## 5. Report Generation & Download

### 5.1 Requesting a Report (`POST /api/v1/campaigns/:id/reports`)

Report requests are handled in [`apps/api/src/operations.ts:96-185`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L96-L185) and [`apps/api/src/controllers.ts:91-102`](file:///Users/kuroyami/CallingAgents/apps/api/src/controllers.ts#L91-L102):

* **HTTP Status:** Returns **202 Accepted**.
* **Idempotency Enforcement:**
  * Requires `Idempotency-Key` header matching `/^[A-Za-z0-9_-]{8,128}$/` ([`apps/api/src/common.ts:189-197`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L189-L197)).
  * If the key already exists for the workspace, checks campaign and format match:
    * If matching, returns existing report record (idempotent success).
    * If conflicting with a different campaign or format, throws 409 `IDEMPOTENCY_CONFLICT`.
* **State Preconditions:**
  * Campaign must be terminal: `status IN ('completed', 'cancelled', 'failed')` (line 143).
  * Active calls must be zero: `status IN ('pending', 'queued', 'calling')` must equal 0 (lines 132–142). If active, throws 409 `REPORT_NOT_READY`.
* **Role Check:** `requireWrite(identity)` enforces that operators or owners can request reports; viewers receive 403 `FORBIDDEN`.

### 5.2 Worker Generation & Bytea Storage

Implemented in [`apps/worker/src/reports.ts:69-105`](file:///Users/kuroyami/CallingAgents/apps/worker/src/reports.ts#L69-L105):
* Joins contacts, campaign contacts, call attempts, and analyses for up to 10,000 records.
* **Output Formats:**
  * **CSV:** Generated using `csvCell()` ([`apps/worker/src/reports.ts:4-9`](file:///Users/kuroyami/CallingAgents/apps/worker/src/reports.ts#L4-L9)). Prepends a tab (`\t`) to any cell that could be interpreted as a spreadsheet formula (`=, +, -, @`), satisfying OWASP CSV Injection guidelines.
  * **XLSX:** Built using `ExcelJS.Workbook`. Headers frozen; values sanitized via `sanitizeSpreadsheetCell`.
* **Private Storage:** Stored directly in PostgreSQL `reports.artifact` column as `bytea` ([ADR-003](file:///Users/kuroyami/CallingAgents/docs/architecture/decisions/ADR-003-local-auth-and-artifacts.md#L3)). No external cloud storage (S3/GCS) is used.
* **Size Ceiling:** Buffer capped at **20 MiB** (`20 * 1024 * 1024`, line 86).
* **Retention Policy:** `expires_at` is set to `Date.now() + config.RETENTION_DAYS * 86400000` (default 30 days).

### 5.3 Secure Report Download (`GET /api/v1/reports/:id/download`)

Handled in [`apps/api/src/operations.ts:186-233`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L186-L233):
* **Tenant Isolation:** Scoped via `owned(pool, 'reports', id, identity.workspaceId)` (lines 192). Cross-tenant requests return 404 `NOT_FOUND` without leaking existence.
* **Permission Check:** `requireWrite(identity)` restricts download to operators/owners. Viewers receive 403 `FORBIDDEN`.
* **Expiry Check:** If `expires_at < now()`, returns 410 `REPORT_EXPIRED`.
* **Readiness Check:** If `status !== 'completed'` or `artifact` is null, returns 409 `REPORT_NOT_READY`.
* **Security Headers Emitted (lines 219–231):**
  * `Content-Type: text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  * `Content-Disposition: attachment; filename="outreach-<id>.<ext>"` (sanitized: `replace(/[^A-Za-z0-9._-]/g, '_')`)
  * `Cache-Control: private, no-store`
  * `X-Content-Type-Options: nosniff`
* **Direct Streaming:** Sends the `bytea` buffer directly via `response.send(row.artifact)`.
* **Audit Trail:** Appends `report.downloaded` to `audit_log` within a database transaction.

---

## 6. Security Boundaries & Credential Protection

### 6.1 PII Protection & Data Sanitization

1. **Wire Serialization Redaction (`clean()`):**  
   Implemented in [`apps/api/src/common.ts:55-94`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L55-L94), every outgoing JSON response passes through `clean()`. The following fields are unconditionally stripped from responses:
   * `'source_bytes'` (raw uploaded files)
   * `'artifact'` (binary report bytes)
   * `'token_hash'` (hashed session credentials)
   * `'provider_attempt_id'` (telephony provider identifiers)
   * `'interaction_id'` (Sarvam call correlation IDs)
   * `'provider_config'` (telephony credentials / connection configs)
   * `'processing_token'` / `'processing_started_at'` (worker lock metadata)
2. **Scheduled PII Scrubbing:**  
   In [`apps/worker/src/main.ts:209-238`](file:///Users/kuroyami/CallingAgents/apps/worker/src/main.ts#L209-L238), after `RETENTION_DAYS` (30 days):
   * `reports.artifact` is set to NULL (`failure_code = 'ARTIFACT_EXPIRED'`).
   * `analyses.transcript`, `extracted_fields`, and `summary` are set to NULL.
   * `imports.source_bytes` is overwritten with `Buffer.alloc(0)`.
   * `import_rows.source_cells` is wiped to `{}` and `normalized_phone` is set to NULL.
   * `webhook_inbox.payload` has its `transcript` and `extractedFields` scrubbed to `null`.
3. **Durable Suppression Invariance:**  
   Phone numbers added to `suppressions` ([`apps/api/src/imports.ts:241`](file:///Users/kuroyami/CallingAgents/apps/api/src/imports.ts#L241)) persist independently of contact revisions. Subsequent re-imports of the same phone number will **never** clear an opt-out.

### 6.2 Provider Boundary & Zero Sarvam Secrets on Client

> [!CAUTION]
> **Zero Provider Secrets on Client:**  
> The Flutter client must never contain or request Sarvam credentials. All provider interaction is strictly proxied and orchestrated server-side.

* **Configuration Containment:** All Sarvam API keys (`SARVAM_API_KEY`, `SARVAM_MODEL_API_KEY`), Organization IDs, Connection IDs, and webhook tokens are validated strictly in [`packages/config/src/index.ts:13-58`](file:///Users/kuroyami/CallingAgents/packages/config/src/index.ts#L13-L58) and held in server memory.
* **Integrations Endpoint Sanitization:**  
  When the client calls `GET /api/v1/integrations` ([`apps/api/src/operations.ts:259-282`](file:///Users/kuroyami/CallingAgents/apps/api/src/operations.ts#L259-L282)), the backend returns only safe operational metadata:
  ```json
  {
    "provider": "mock",
    "simulationReady": true,
    "liveReady": false,
    "liveEnabled": false,
    "missingConfiguration": ["SARVAM_API_KEY", "SARVAM_ORG_ID", ...],
    "capabilities": { "termination": false, "recordings": false },
    "planner": {
      "provider": "local",
      "configurationReady": true,
      "model": null,
      "simulationProvider": "local",
      "requiresLiveCampaign": true
    }
  }
  ```
* **Constant-Time Webhook Verification:**  
  In [`apps/api/src/webhooks.ts:10-18`](file:///Users/kuroyami/CallingAgents/apps/api/src/webhooks.ts#L10-L18), incoming callbacks at `/api/v1/webhooks/sarvam/:token` verify the high-entropy route token using `crypto.timingSafeEqual` to prevent timing analysis attacks.

### 6.3 Safe Error Filter (`SafeExceptionFilter`)

Implemented in [`apps/api/src/common.ts:198-222`](file:///Users/kuroyami/CallingAgents/apps/api/src/common.ts#L198-L222) and applied globally in [`apps/api/src/main.ts:133`](file:///Users/kuroyami/CallingAgents/apps/api/src/main.ts#L133):
* Prevents leakage of internal SQL queries, stack traces, and database connection strings.
* Standardizes all error responses to:
  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human-readable safe explanation",
      "details": []
    }
  }
  ```
* Unhandled exceptions return generic 500:
  ```json
  {
    "error": {
      "code": "INTERNAL_ERROR",
      "message": "The operation could not be completed; retry or check service health"
    }
  }
  ```

---

## 7. Concrete Architectural Checklist for Flutter Client

To guarantee compatibility with the audited backend contracts:

1. [ ] **Cookie Management:**
   * Configure `Dio` with `CookieManager` (`cookie_jar` or `persist_cookie_jar`).
   * Intercept `Set-Cookie` on `POST /api/v1/auth/demo` and attach `Cookie: outreach_session=<token>` on every subsequent request.
2. [ ] **Origin & Content-Type Headers:**
   * Ensure mobile HTTP requests **omit** the `Origin` header (or pass `http://localhost:5173`).
   * Explicitly set `Content-Type: application/json` on all POST and PATCH calls.
3. [ ] **SSE Stream Handling:**
   * Connect to `/api/v1/campaigns/:id/stream` with `Accept: text/event-stream`.
   * Include `Cookie` header and either `Last-Event-ID` header or `?after=<cursor>` parameter.
   * Parse SSE line-by-line; ignore comments starting with `:`.
   * Reset a 30-second client-side watchdog timer on receiving `: heartbeat` or events.
   * Implement automatic reconnect on `event: reconnect` or connection loss using the last received monotonic event `id`.
4. [ ] **File Upload Workflow:**
   * Read picked `.csv` / `.xlsx` files as binary bytes.
   * Enforce client-side check: `<= 5,242,880 bytes` (5 MiB).
   * Encode binary to base64 string and wrap in JSON matching `ImportInputSchema`.
   * Do not use multipart form data.
5. [ ] **Report Export:**
   * Generate a random 16-character alphanumeric `Idempotency-Key` before calling `POST /campaigns/:id/reports`.
   * Poll report status or listen for `report.completed` SSE event.
   * Trigger download via `GET /reports/:id/download`, receiving binary byte stream and writing to app storage.
6. [ ] **Zero Vendor Secrets:**
   * Do not import or bundle any Sarvam SDK or vendor API keys in the Flutter application codebase.
