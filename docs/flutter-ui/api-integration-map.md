# Outreach Intern — API Integration Map

This document establishes the verified bidirectional mapping between the **NestJS Backend REST/SSE API** (`apps/api/src/`) and the **Flutter Client Application** (`apps/flutter_app/lib/`).

Every endpoint was audited against actual backend controllers, DTO schemas, and database entity models.

---

## 1. Authentication & Session Identity

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /auth/demo` | `POST` | `AuthController.demoLogin` | `{ email: string, name?: string }` | `{ user: User, workspace: Workspace }` + `Set-Cookie: outreach_session` | `sessionNotifierProvider.notifier.signInDemo` | `LoginScreen` (`/login`) | **Verified** |
| `GET /me` | `GET` | `AuthController.me` | None (requires `outreach_session` cookie) | `{ userId, workspaceId, role, email, name, workspaceName, development }` | `sessionNotifierProvider.notifier.checkActiveSession` | `AppShell`, `AppTopBar`, `AppNavDrawer` | **Verified** |
| `POST /auth/logout` | `POST` | `AuthController.logout` | None | `{ success: true }` + Cleared cookie | `sessionNotifierProvider.notifier.logout` | `AppNavDrawer` (Sign Out button) | **Verified** |

---

## 2. Agents & Voice Personas

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /agents` | `GET` | `AgentsController.findAll` | `?limit=50&offset=0` | `{ items: Agent[], total: number }` | `agentsListProvider`, `homeAgentsProvider` | `HomeScreen`, `AgentsScreen`, `CampaignWizardScreen` | **Verified** |
| `GET /agents/:id` | `GET` | `AgentsController.findOne` | `id: UUID` | `Agent & { currentVersionNumber: number, versions: AgentVersion[] }` | `agentDetailProvider(id)` | `AgentEditorScreen` (`/agents/:id`) | **Verified** |
| `POST /agents` | `POST` | `AgentsController.create` | `{ name, description, instructions, language, questions }` | `Agent` | `client.post(ApiEndpoints.agents, ...)` | `AgentEditorScreen` (`/agents/new`) | **Verified** |
| `PATCH /agents/:id` | `PATCH` | `AgentsController.update` | `{ name?, description? }` | `Agent` | `client.patch('/agents/:id', ...)` | `AgentEditorScreen` (Metadata card) | **Verified** |
| `POST /agents/:id/versions` | `POST` | `AgentsController.createVersion` | `{ instructions, language, questions }` | `AgentVersion` | `client.post('/agents/:id/versions', ...)` | `AgentEditorScreen` (Publish New Version) | **Verified** |
| `POST /agents/:id/sandbox` | `POST` | `AgentsController.runSandbox` | `{ message: string, history?: [...] }` | `{ reply: string, tokenUsage?: number }` | `client.post('/agents/:id/sandbox', ...)` | `PersonaSandboxSheet` | **Verified** |

---

## 3. Contacts & Ingestion Pipelines

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /contacts` | `GET` | `ContactsController.findAll` | `?limit=100&offset=0&search=...` | `{ items: Contact[], total: number }` | `contactsListProvider` | `ContactsScreen` (`/contacts`) | **Verified** |
| `POST /contacts` | `POST` | `ContactsController.create` | `{ phone, name, attributes?, consent }` | `Contact` | `client.post(ApiEndpoints.contacts, ...)` | `ContactsScreen` (Add Contact Dialog) | **Verified** |
| `POST /imports` | `POST` | `ImportsController.create` | `{ filename, mediaType, contentBase64, synthetic? }` | `Import` (Status: `pending` or `validating`) | `client.post(ApiEndpoints.imports, ...)` | `ImportWizardScreen` (Upload File Step) | **Verified** |
| `GET /imports/:id` | `GET` | `ImportsController.findOne` | `id: UUID` | `Import & { validCount, errorCount, duplicateCount }` | `importDetailProvider(id)` | `ImportWizardScreen` (Validation Review Step) | **Verified** |
| `GET /imports/:id/rows` | `GET` | `ImportsController.getRows` | `?status=invalid&limit=50` | `{ items: ImportRow[], total: number }` | `client.get('/imports/:id/rows', ...)` | `ImportRowCorrectionDialog` | **Verified** |
| `PATCH /imports/:id/rows/:rowId` | `PATCH` | `ImportsController.updateRow` | `{ sourceCells: { phone, name, ... } }` | `ImportRow` | `client.patch('/imports/:id/rows/:rowId', ...)` | `ImportRowCorrectionDialog` (Save & Re-evaluate) | **Verified** |
| `POST /imports/:id/apply` | `POST` | `ImportsController.apply` | None | `{ appliedCount: number, duplicatesSkipped: number }` | `client.post('/imports/:id/apply', ...)` | `ImportWizardScreen` (Commit Contacts to DB) | **Verified** |

---

## 4. Campaigns & Execution

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /campaigns/overview` | `GET` | `CampaignsController.overview` | None | `{ simulation: OverviewMetrics, live: OverviewMetrics }` | `overviewDataProvider` | `HomeScreen` (`OverviewMetricCards`) | **Verified** |
| `GET /campaigns` | `GET` | `CampaignsController.findAll` | `?mode=simulation\|live&limit=50` | `{ items: Campaign[], total: number }` | `homeRecentCampaignsProvider`, `campaignsListProvider` | `HomeScreen`, `AppNavDrawer` | **Verified** |
| `GET /campaigns/:id` | `GET` | `CampaignsController.findOne` | `id: UUID` | `Campaign & { agent, import, plan, policy }` | `campaignDetailProvider(id)` | `CampaignDetailScreen` (`/campaigns/:id`) | **Verified** |
| `POST /campaigns` | `POST` | `CampaignsController.create` | `{ name, objective, mode, agentVersionId, importId, policy }` | `Campaign` (Status: `draft`) | `client.post(ApiEndpoints.campaigns, ...)` | `CampaignWizardScreen` (Step 4 Submit) | **Verified** |
| `POST /campaigns/:id/plan` | `POST` | `CampaignsController.generatePlan` | None | `CampaignPlan & { eligibleCount, estimatedDuration, budget }` | `client.post('/campaigns/:id/plan', ...)` | `CampaignWizardScreen` (Step 4 Review Plan) | **Verified** |
| `POST /campaigns/:id/launch` | `POST` | `CampaignsController.launch` | None | `{ success: true, status: 'running' }` | `client.post('/campaigns/:id/launch', ...)` | `CampaignDetailScreen` & Wizard (Confirm Launch) | **Verified** |
| `POST /campaigns/:id/pause` | `POST` | `CampaignsController.pause` | None | `{ success: true, status: 'paused', activeCallsMayContinue: true }` | `client.post('/campaigns/:id/pause', ...)` | `CampaignDetailScreen` (Pause Button) | **Verified** |
| `POST /campaigns/:id/resume` | `POST` | `CampaignsController.resume` | None | `{ success: true, status: 'running' }` | `client.post('/campaigns/:id/resume', ...)` | `CampaignDetailScreen` (Resume Button) | **Verified** |
| `POST /campaigns/:id/cancel` | `POST` | `CampaignsController.cancel` | None | `{ success: true, status: 'cancelled', activeCallsMayContinue: true }` | `client.post('/campaigns/:id/cancel', ...)` | `CampaignDetailScreen` (Cancel Campaign Modal) | **Verified** |
| `GET /campaigns/:id/events` | `GET` | `CampaignsController.streamEvents` | SSE Stream (`text/event-stream`) | Server-Sent Events (`CALL_CONNECTED`, `CALL_COMPLETED`, etc.) | `client.subscribeEvents(id)` / `campaignEventsStreamProvider(id)` | `CampaignDetailScreen` (Realtime Feed) | **Verified** |

---

## 5. Calls & Inspection

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /campaigns/:id/attempts` | `GET` | `CallsController.findByCampaign` | `?limit=50&offset=0` | `{ items: CallAttempt[], total: number }` | `campaignAttemptsProvider(id)` | `CampaignDetailScreen` (Attempt Log Tab) | **Verified** |
| `GET /calls/:id` | `GET` | `CallsController.findOne` | `id: UUID` | `CallAttempt & { analysis: { transcript, summary, extractedFields } }` | `callDetailProvider(id)` | `CallInspectorSheet` | **Verified** |

---

## 6. Reports & Analytics

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /reports` | `GET` | `ReportsController.findAll` | `?limit=25` | `{ items: Report[], total: number }` | `reportsListProvider` | `ReportsScreen` (`/reports`) | **Verified** |
| `POST /reports` | `POST` | `ReportsController.create` | `{ campaignId: UUID, format: 'csv' \| 'xlsx' }` | `Report` (Status: `pending` or `completed`) | `client.post(ApiEndpoints.reports, ...)` | `ReportsScreen` (Generate Report Dialog) | **Verified** |
| `GET /reports/:id/download` | `GET` | `ReportsController.download` | `id: UUID` | Binary Stream (`application/octet-stream`) | `client.downloadFile('/reports/:id/download', savePath)` | `ReportsScreen` (Download Report Button) | **Verified** |

---

## 7. Workspace Settings & Integrations

| Endpoint | Method | Backend Controller & Path | Payload / Query | Response DTO | Client Provider / Call | UI Screen / Trigger | Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /integrations` | `GET` | `IntegrationsController.getStatus` | None | `IntegrationStatus` (Sarvam voice, telephony, model) | `integrationStatusProvider` | `SettingsScreen` (`/settings`) | **Verified** |
| `GET /workspace/settings` | `GET` | `WorkspaceController.getSettings` | None | `WorkspaceSettings` (Calling policy, timezone, budget limits) | `workspaceSettingsProvider` | `SettingsScreen` (Calling Policies Tab) | **Verified** |
| `PATCH /workspace/settings` | `PATCH` | `WorkspaceController.updateSettings` | `{ defaultTimezone?, callingWindow?, budgetMinor? }` | `WorkspaceSettings` | `client.patch('/workspace/settings', ...)` | `SettingsScreen` (Save Policy Changes) | **Verified** |
| `GET /workspace/audit-log` | `GET` | `WorkspaceController.getAuditLog` | `?limit=50` | `{ items: AuditLogEntry[], total: number }` | `client.get('/workspace/audit-log', ...)` | `SettingsScreen` (Audit Trail Tab) | **Verified** |

---

## 8. Sarvam Telephony Integration Reality Check

| Capability | Backend Route | Exposed to Client? | Flutter UI Implementation Truth | Status |
| :--- | :--- | :--- | :--- | :--- |
| Sarvam API Key | N/A (Server ENV `SARVAM_API_KEY`) | **NO** (Strictly forbidden) | **Zero provider keys** in Flutter codebase. Client interacts purely with authenticated NestJS backend. | **Verified Secure** |
| Voice Catalog Listing | None (Sarvam does not expose a list voices API) | **NO** | UI **does not fake** a voice catalog dropdown. It shows backend configured voice metadata from `GET /integrations`. | **Truth-Telling UI** |
| Voice Audio Preview | None (Sarvam provides no TTS preview endpoint for telephony voices) | **NO** | UI **does not fake** an MP3 audio previewer. Instead, it provides a functional persona sandbox (`POST /agents/:id/sandbox`). | **Truth-Telling UI** |
| Live Telephony Termination | None (Sarvam Outbound API v1 cannot kill active SIP legs) | Returned as `terminationSupported: false` | UI explicitly displays: *"In-flight calls will complete naturally (provider termination unsupported)"* when pausing or cancelling. | **Truth-Telling UI** |
