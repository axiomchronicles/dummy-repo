# Outreach Intern V3 — API & Event Contracts Specification

**Document:** `docs/rebuild/06-api-and-event-contracts.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal API Architect  

---

## 1. REST API Route Catalog (`/api/v1`)

### 1.1 Authentication & Session Endpoints
- `POST /api/v1/auth/login`
  - Body: `{ email: string, password?: string, googleIdToken?: string }`
  - Response (200): `{ mfaRequired: true, mfaToken: string, enrolled: boolean }`
- `POST /api/v1/auth/mfa/verify`
  - Body: `{ mfaToken: string, code: string, isRecoveryCode?: boolean }`
  - Response (200): `{ accessToken: string, refreshToken: string, user: UserDto, workspace: WorkspaceDto }`
- `POST /api/v1/auth/mfa/enroll`
  - Headers: `Authorization: Bearer <accessToken>`
  - Response (200): `{ secret: string, qrCodeUri: string, recoveryCodes: string[] }`
- `POST /api/v1/auth/mfa/confirm`
  - Headers: `Authorization: Bearer <accessToken>`
  - Body: `{ code: string }`
  - Response (200): `{ enrolled: true }`
- `POST /api/v1/auth/refresh`
  - Body: `{ refreshToken: string }`
  - Response (200): `{ accessToken: string, refreshToken: string }`
- `POST /api/v1/auth/logout`
  - Headers: `Authorization: Bearer <accessToken>`
  - Response (200): `{ success: true }`
- `GET /api/v1/auth/me`
  - Headers: `Authorization: Bearer <accessToken>`
  - Response (200): `{ user: UserDto, workspace: WorkspaceDto, permissions: string[] }`

### 1.2 Conversational Chat & Import Endpoints
- `GET /api/v1/chat/threads`
  - Query: `?limit=20&cursor=...`
  - Response (200): Paginated list of `ChatThreadDto`
- `POST /api/v1/chat/threads`
  - Body: `{ title?: string }`
  - Response (201): `ChatThreadDto`
- `GET /api/v1/chat/threads/:id/messages`
  - Response (200): Array of `ChatMessageDto`
- `POST /api/v1/chat/threads/:id/messages`
  - Body: `{ content: string, attachmentIds?: string[] }`
  - Response (200): `{ message: ChatMessageDto, draftProposal?: CampaignDraftDto }`
- `POST /api/v1/imports/upload`
  - Content-Type: `multipart/form-data` or raw octet-stream
  - Body: `{ file: File, defaultRegion?: string }`
  - Response (201): `{ importId: string, filename: string, rowCount: number, validCount: number, errorCount: number }`
- `GET /api/v1/imports/:id/preview`
  - Response (200): `{ mapping: Record<string, string>, rows: ImportRowDto[], issues: IssueDto[] }`

### 1.3 Campaign & Confirmation Endpoints
- `GET /api/v1/campaigns`
  - Query: `?status=...&mode=...&limit=20`
  - Response (200): Paginated list of `CampaignSummaryDto`
- `GET /api/v1/campaigns/:id`
  - Response (200): Detailed `CampaignDetailDto` with contact progress and outcome aggregates
- `POST /api/v1/campaigns/:id/confirm`
  - Headers: `Idempotency-Key: <uuid>`
  - Body: `{ planSnapshotHash: string, executionMode: 'simulation' | 'live' }`
  - Response (200): `{ campaignId: string, status: 'running' | 'scheduled', eligibleCount: number }`
  - Error (409): `{ code: 'PLAN_STALE', message: 'Campaign was updated; review refreshed plan.' }`
- `POST /api/v1/campaigns/:id/action`
  - Body: `{ action: 'pause' | 'resume' | 'cancel' }`
  - Response (200): `{ status: string }`

### 1.4 Call History & Transcript Endpoints
- `GET /api/v1/history/attempts`
  - Query: `?campaignId=...&outcome=...&search=...&limit=20`
  - Response (200): Paginated list of `CallAttemptSummaryDto`
- `GET /api/v1/history/attempts/:id`
  - Response (200): `CallAttemptDetailDto` with chronological `transcript`, `analyses`, and `recordingUrl` (if available)

### 1.5 Admin Operator Endpoints (Admin Session & Role Guarded)
- `GET /api/v1/admin/overview`
  - Response (200): `{ ready: boolean, database: boolean, redis: boolean, workerCount: number, queueDepths: Record<string, number>, killSwitchActive: boolean }`
- `POST /api/v1/admin/kill-switch`
  - Body: `{ active: boolean, reason: string }`
  - Response (200): `{ killSwitchActive: boolean }`
- `GET /api/v1/admin/users`
  - Query: `?status=...&role=...&limit=50`
  - Response (200): Paginated list of `AdminUserDto`
- `POST /api/v1/admin/users/invite`
  - Body: `{ email: string, name: string, role: 'admin' | 'operator' | 'viewer' }`
  - Response (201): `{ invitationId: string, token: string, expiresAt: string }`
- `POST /api/v1/admin/users/:id/reset-mfa`
  - Body: `{ reason: string }`
  - Response (200): `{ success: true }`
- `POST /api/v1/admin/users/:id/revoke-sessions`
  - Response (200): `{ revokedCount: number }`
- `GET /api/v1/admin/audit`
  - Query: `?action=...&actorId=...&limit=50`
  - Response (200): Paginated list of `AuditEventDto`

### 1.6 Webhook Ingress
- `POST /api/v1/webhooks/sarvam/:token`
  - Validates `token` in constant time against server secret.
  - Body: `SarvamWebhookPayload`
  - Response (200): `{ accepted: true, duplicate: boolean }`

---

## 2. Server-Sent Events (SSE) Stream Protocol

### Endpoint: `GET /api/v1/campaigns/:id/stream?cursor=:eventId`
Streams live progress updates to Flutter mobile and admin console:
- Headers:
  ```http
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  ```
- Event Message Format:
  ```text
  id: 1042
  event: campaign.progress
  data: {"campaignId":"f74e6451-2495-46aa-b3e1-7ce2fb7fba26","progress":{"total":50,"completed":12,"calling":2,"pending":36},"outcomes":{"connected":10,"busy":1,"no_answer":1}}
  
  id: 1043
  event: attempt.outcome
  data: {"attemptId":"d3b07384-d113-460b-980b-8041a774b9b4","contactName":"Rahul Sharma","outcome":"connected","durationSeconds":48.5}
  ```
- Heartbeat: Keep-alive ping comments (`: ping`) emitted every 15 seconds.
