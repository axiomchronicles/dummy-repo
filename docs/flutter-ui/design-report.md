# Gate B: Comprehensive UI and Integration Design Report

**Product:** Outreach Intern — AI-Powered Voice Outreach Platform  
**Target Client:** Flutter 3.44+ (Dart 3.12+), Riverpod 2.6+, GoRouter 14+, HugeIcons  
**Backend:** NestJS 11 + PostgreSQL 17 + Drizzle ORM + BullMQ 5 + Express  
**Date:** 2026-10-26  
**Author:** Lead Flutter Architect, Product Designer & Multi-Agent Coordinator  

---

## 1. Product Goals & Requirements Derived from Backend Audit

Outreach Intern is a mission-critical campaign operations platform orchestrating AI-driven voice outreach. Based on the verified repository audit (Phase 0 and Gate A), the Flutter client fulfills the following core product goals:

1. **Deterministic Local Execution First:** By default, Outreach Intern runs entirely locally with zero external network or telephony dependencies (`VOICE_PROVIDER=mock`, `LIVE_CALLS_ENABLED=false`). Synthetic calls, transcripts, and analysis are generated deterministically via SHA-256 hashes of attempt identifiers.
2. **Safe, Deliberate Live Gating:** Live calling requires deliberate operator confirmation, an acknowledged HTTPS webhook route, destination allowlist verification, affirmative consent, calling window adherence, and budget caps. The UI must never silently initiate a live call.
3. **Truth-Telling UX:** Where capabilities do not exist in the backend or provider (such as public voice catalog enumeration or active call termination), the UI explicitly communicates the reality rather than showing dead controls or placeholder mocks disguised as real features.
4. **Resilient Real-Time Operations:** Campaigns are monitored live via Server-Sent Events (SSE) with 64-bit integer cursor replay, automatic reconnection, and heartbeat detection.
5. **Private Artifact Management:** Contact CSV/XLSX imports and generated campaign reports are stored securely in PostgreSQL as `bytea` records, protected by tenant authorization, formula injection sanitization, and automated data retention policies.

---

## 2. Backend Integration Capabilities & UI-Dependent Gaps

### 2.1 Backend Integration Summary

- **Total Audited Endpoints:** 45 endpoints across 7 controllers (`apps/api/src/controllers.ts`).
- **Authentication:** Development demo session (`POST /api/v1/auth/demo`), returning `SessionIdentity` and setting `outreach_session` cookie (`httpOnly: true`, `sameSite: strict`).
- **Guards & Roles:** 39 endpoints enforce `SessionGuard`; 17 endpoints enforce `requireWrite(identity)` (rejecting `viewer` role with `403 FORBIDDEN`).
- **Idempotency:** 3 endpoints (`/campaigns/:id/simulate`, `/campaigns/:id/launch`, `/campaigns/:id/reports`) require an `Idempotency-Key` header (`^[A-Za-z0-9_-]{8,128}$`).
- **Real-Time Stream:** `GET /api/v1/campaigns/:id/stream` emits SSE frames, 15-second heartbeats (`: heartbeat\n\n`), and supports resumption via `Last-Event-ID` or `?after=<cursor>`.

### 2.2 Prioritized Gap Resolution Matrix

| Gap / Capability | Priority | Classification | Flutter Client Resolution |
| :--- | :--- | :--- | :--- |
| **Cookie Session Transport** | P1 | *Can work around safely* | Use `dio_cookie_manager` with `cookie_jar` or inject `Cookie: outreach_session=<token>` in a Dio interceptor. Store token in `flutter_secure_storage`. |
| **Voice Catalog API** | P2 | *Missing Provider Capability* | Do not display a fake voice catalog dropdown. Display the server-configured Sarvam agent ID and version tag from `GET /api/v1/integrations`, noting that voice selection is governed in the Sarvam Dashboard. |
| **Audio Voice Preview API** | P2 | *Missing Provider Capability* | Do not render a fake audio player. Provide the text-based persona sandbox preview (`POST /api/v1/agents/:id/sandbox`). |
| **Active Telephony Termination** | P3 | *Documented Limitation* | On pause/cancel, display clear badge: "Pausing (Calls active)" and explicit copy explaining that in-flight calls complete naturally. |

---

## 3. Information Architecture, Route Map & Navigation Shell

### 3.1 Adaptive Shell Hierarchy

The navigation shell adapts responsively across compact (<600dp), medium (600–1024dp), and expanded (≥1024dp) screen constraints:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              AppShell                                  │
├───────────────────┬────────────────────────────────────────────────────┤
│   Navigation      │                 Main Content Area                  │
│  (Drawer / Rail)  │                                                    │
│  - Brand Logo     │  Top Bar: Title / Campaign Mode Pill / User Avatar │
│  - + New Campaign ├────────────────────────────────────────────────────┤
│  - Pinned (···)   │                                                    │
│  - Recents        │  Route Content (IndexedStack via GoRouter)         │
│  - Contacts       │  - Home / Composer                                 │
│  - Personas       │  - Campaign Wizard / Detail / Activity Timeline    │
│  - Reports        │  - Call Inspector (Side Sheet / Modal)             │
│  - Settings       │                                                    │
│  - Profile Footer │                                                    │
└───────────────────┴────────────────────────────────────────────────────┘
```

### 3.2 Declarative GoRouter Routes

| Path | Screen / Page | Description | Guard / Auth |
| :--- | :--- | :--- | :--- |
| `/login` | `LoginScreen` | Demo workspace sign-in (`email`, `name`) | Public |
| `/` | `HomeScreen` | Natural-language objective composer & overview metrics | `SessionGuard` |
| `/campaigns/new` | `CampaignWizardScreen` | 5-step guided campaign builder (Wizard) | `SessionGuard` + `requireWrite` |
| `/campaigns/:id` | `CampaignDetailScreen` | Campaign overview, execution status & real-time activity | `SessionGuard` |
| `/campaigns/:id/calls/:callId` | `CallInspectorScreen` | Call details, turn-by-turn transcript, and analysis JSON | `SessionGuard` |
| `/contacts` | `ContactsScreen` | Persisted contacts list & suppression controls | `SessionGuard` |
| `/contacts/import` | `ImportWizardScreen` | Base64 file upload, column mapping & row corrections | `SessionGuard` + `requireWrite` |
| `/agents` | `AgentsScreen` | Persona list, version history & text sandbox preview | `SessionGuard` |
| `/agents/:id` | `AgentEditorScreen` | Persona instructions editor (creates immutable version) | `SessionGuard` + `requireWrite` |
| `/reports` | `ReportsScreen` | Asynchronous report job list & binary download stream | `SessionGuard` |
| `/settings` | `SettingsScreen` | Workspace policy, calling windows, and integrations readiness | `SessionGuard` |

---

## 4. Detailed Screen Inventory & Acceptance Criteria

### 4.1 Home Screen (`HomeScreen`)
- **Purpose:** Command-oriented landing experience inspired by reference designs. Centered greeting ("Welcome, Operator"), floating squircle prompt composer, mode toggle (`Simulation` | `Live`), and overview aggregate cards.
- **Inputs:** Natural-language campaign objective prompt, quick persona selector pill.
- **Actions:**
  - Submit objective $\rightarrow$ Pre-populates Campaign Wizard at `/campaigns/new`.
  - Mode switch $\rightarrow$ Toggles simulation / live preview context.
  - Recent/Pinned click $\rightarrow$ Navigates to `/campaigns/:id`.
- **Server Dependencies:** `GET /api/v1/overview`, `GET /api/v1/campaigns?limit=5`, `GET /api/v1/agents?limit=10`.
- **States:** Shimmer loading skeletons, clean empty state when no campaigns exist, error banner with retry.

### 4.2 Campaign Creation Wizard (`CampaignWizardScreen`)
- **Purpose:** 5-step guided campaign flow:
  1. *Objective:* Prompt / campaign description and mode selection (`simulation` | `live`).
  2. *Persona Selection:* Select from app personas (Customer Discovery, Appointment Coordinator, etc.) with previewed instructions.
  3. *Contact Data:* Select from validated imports (`status: "ready"`).
  4. *Calling Policy:* Calling window (start/end hour), IANA timezone, concurrency (capped to 1 for live), and budget reservation.
  5. *Plan Review:* Displays server-generated plan steps, estimated duration, contact eligibility counts, and cost disclaimer.
- **Actions:** "Save & Build Plan" (`POST /campaigns` $\rightarrow$ `POST /campaigns/:id/plan`). Planning NEVER dials a phone call.
- **Acceptance Criteria:** Wizard prevents proceeding if required fields are missing; unsaved changes trigger `PopScope` exit confirmation.

### 4.3 Campaign Detail & Real-Time Activity Screen (`CampaignDetailScreen`)
- **Purpose:** Operational command center for a single campaign.
- **Header:** Campaign name, mode badge (`SIMULATION` or pulsing red `LIVE`), status chip (`draft`, `planned`, `running`, `paused`, `completed`, `cancelled`).
- **Metrics Bar:** Total Contacts, Dispatched Attempts, Connected, Busy, No Answer, Failed.
- **Action Controls:**
  - `Simulate` (`POST /simulate` with `Idempotency-Key` and `{ confirmed: true }`).
  - `Launch Live` (High-stakes confirmation dialog requiring explicit typed confirmation, consent acknowledgment, and allowlist check).
  - `Pause` (`POST /pause`) $\rightarrow$ Badged as "Pausing (Calls active)".
  - `Resume` (`POST /resume`).
  - `Cancel` (`POST /cancel`).
  - `Export Report` (`POST /campaigns/:id/reports`).
- **Activity Timeline:** CustomScrollView featuring real-time event turns streamed via SSE (`GET /api/v1/campaigns/:id/stream`) with automatic cursor resumption (`Last-Event-ID`).
- **Call Inspector Navigation:** Tapping an attempt opens the `CallInspectorSheet`.

### 4.4 Call Inspector (`CallInspectorSheet`)
- **Purpose:** Deep dive into a specific call attempt.
- **Data Displayed:** Attempt ID, contact name/phone, provider (`mock` or `sarvam`), duration, outcome badge, failure code (if any), estimated cost in INR minor.
- **Turn-by-Turn Transcript:** Chat bubbles for `agent` and `user` turns.
- **Extracted Fields & Analysis:** Structured JSON key-values (e.g. `interest`, `followUpRequested`) and AI summary.

### 4.5 Contacts & Import Screen (`ContactsScreen` & `ImportWizardScreen`)
- **Purpose:** Contact list management, opt-out suppression, and CSV/XLSX file ingestion.
- **Upload Flow:** File picker reads CSV/XLSX $\rightarrow$ Encodes bytes to Base64 off UI isolate $\rightarrow$ `POST /api/v1/imports`.
- **Validation Feedback:** Displays valid, duplicate, excluded, and invalid row counts.
- **Row Correction Dialog:** When status is `needs_correction`, operators can inspect invalid rows (`GET /imports/:id/rows?status=invalid`) and submit in-place corrections (`POST /imports/:id/validate`) without re-uploading.

### 4.6 Persona Editor & Sandbox (`AgentsScreen` & `AgentEditorScreen`)
- **Purpose:** Manage Outreach Intern personas and prompt instructions.
- **Versioning:** Editing an existing persona appends an immutable new version snapshot (`v1` $\rightarrow$ `v2`). Historical campaigns retain their original version reference.
- **Text Sandbox:** Operators can trigger a synthetic sandbox turn (`POST /agents/:id/sandbox`) to preview persona behavior safely without telephony audio.

### 4.7 Reports & Downloads (`ReportsScreen`)
- **Purpose:** Asynchronous export center for CSV and XLSX campaign snapshots.
- **Flow:** Gated to terminal campaigns (`completed`, `cancelled`, `failed`) with 0 active calls.
- **Download:** Authorized streaming download (`GET /reports/:id/download`) saved via local file dialog or mobile share sheet.

### 4.8 Settings & Integrations (`SettingsScreen`)
- **Purpose:** Workspace configuration and sanitized provider readiness.
- **Integrations Panel:** Reads `GET /api/v1/integrations` to show status of Sarvam Voice Agents, Sarvam AI Model completions, and telephony caller ID. Never exposes secrets or API keys.

---

## 5. Visual System & Design System Tokens

Derived from the two user references, Outreach Intern uses a restrained, high-contrast monochrome design system accented by vivid coral red:

### 5.1 Color Token Palette

```dart
class AppColors extends ThemeExtension<AppColors> {
  // Light Theme
  static const lightCanvas = Color(0xFFF9F9F8);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightSurfaceSubtle = Color(0xFFF2F2F0);
  static const lightBorderSubtle = Color(0xFFE5E5E3);
  static const lightBorderStrong = Color(0xFFD1D1CE);
  static const lightTextPrimary = Color(0xFF141413);
  static const lightTextSecondary = Color(0xFF6B6B66);
  static const lightTextMuted = Color(0xFF9E9E99);

  // Dark Theme (Near-black OLED charcoal)
  static const darkCanvas = Color(0xFF0D0D0E);
  static const darkSurface = Color(0xFF161618);
  static const darkSurfaceSubtle = Color(0xFF202023);
  static const darkBorderSubtle = Color(0xFF2A2A2E);
  static const darkBorderStrong = Color(0xFF3E3E44);
  static const darkTextPrimary = Color(0xFFF5F5F7);
  static const darkTextSecondary = Color(0xFFA1A1A6);
  static const darkTextMuted = Color(0xFF6E6E73);

  // Vivid Crimson Accent (Bloom reference)
  static const accentRed = Color(0xFFDC2626);
  static const accentRedHover = Color(0xFFB91C1C);
  static const accentRedSubtle = Color(0xFFFEF2F2); // Light
  static const accentRedSubtleDark = Color(0xFF2D1515); // Dark

  // Status Colors
  static const statusSuccess = Color(0xFF16A34A);
  static const statusWarning = Color(0xFFD97706);
  static const statusError = Color(0xFFDC2626);
  static const statusSimulation = Color(0xFF475569);
}
```

### 5.2 Radii & Border Perimeter
- **Composer Card:** 26dp squircle pill with 1px border.
- **Buttons & Chips:** 18dp rounded pill.
- **Cards & Dialogs:** 16dp rounded rectangle.
- **Shadows:** No heavy multi-layer blur; crisp 1px borders and subtle 2dp elevation.

### 5.3 Iconography
- Standardized on `hugeicons` stroke rounded style (stroke width 1.5–1.6px, sizes 18px and 20px).

---

## 6. Component Inventory & Contracts

1. **`OutreachComposer`:** Floating pill card with auto-expanding `TextField`, `+` attachment button, persona dropdown pill, mic sandbox action, and red send trigger.
2. **`AppNavDrawer` / `AppNavRail`:** Adaptive navigation sidebar with red brand mark, `+ New Campaign` button, Pinned items with `···` menu, chronological Recents (`Today`, `Yesterday`, `Previous Week`), and profile footer.
3. **`OutreachButton`:** Primary ink black, primary accent red, secondary outline, ghost, and destructive variants with integrated geometric loading spinner.
4. **`StatusChip`:** Distinctive mode pills (`SIMULATION` blueprint vs pulsing red `LIVE`), campaign statuses, and call outcomes (`Connected`, `No Answer`, `Busy`, `Failed`).
5. **`ActivityTimelineTile`:** Conversation turn bubble with collapsible thought accordion and status badges.
6. **`CallInspectorSheet`:** Modal side sheet displaying duration, ₹3.50/min cost pulse, transcript turns, and formatted JSON fields.
7. **`ImportCorrectionDialog`:** Interactive spreadsheet editor for correcting invalid rows with live regex feedback.
8. **`LiveLaunchConfirmationModal`:** High-stakes modal requiring explicit typing of "LAUNCH", checkbox consent confirmation, and destination allowlist verification.

---

## 7. Data Flow: Presentation → Provider → Repository → API

```
┌────────────────────────────────────────────────────────┐
│                      Presentation                      │
│             Widget / Screen (ConsumerWidget)           │
└───────────────────────────┬────────────────────────────┘
                            │ ref.watch / ref.read
                            ▼
┌────────────────────────────────────────────────────────┐
│                      Application                       │
│        Riverpod Notifiers (AsyncNotifier / Notifier)   │
│  - SessionNotifier, CampaignListNotifier               │
│  - CampaignDetailNotifier (SSE Stream Coordinator)    │
│  - ContactImportNotifier, AgentNotifier                │
└───────────────────────────┬────────────────────────────┘
                            │ Repository Methods
                            ▼
┌────────────────────────────────────────────────────────┐
│                          Data                          │
│            Typed Repositories (Auth, Campaigns, ...)   │
│  - Serializes DTOs (fromJson / toJson)                 │
│  - Normalizes Errors to `ApiException`                 │
│  - Coordinates Dio Network Client                      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / SSE (/api/v1)
                            ▼
┌────────────────────────────────────────────────────────┐
│                       NestJS API                       │
│             [Cookie: outreach_session=<token>]         │
└────────────────────────────────────────────────────────┘
```

---

## 8. Accessibility, Performance & Automated Testing Strategy

### 8.1 Performance Architecture
- **Sliver Virtualization:** Large contact and timeline feeds use `CustomScrollView` and `SliverList.builder` with fixed item extents.
- **Strict Ban on `shrinkWrap: true`:** Unbounded lists are wrapped in appropriate flex constraints or viewport slivers to maintain $O(1)$ lazy layout.
- **Granular Selectors:** SSE events update targeted state using `ref.watch(provider.select(...))` to eliminate screen-wide rebuild cascades.
- **Off-Isolate Encoding:** Contact file parsing and Base64 encoding run inside `Isolate.run` to keep UI frame times $<16.6$ ms.
- **Lifecycle Disposal:** All text controllers, focus nodes, stream subscriptions, and network cancel tokens are disposed reliably in `dispose()` or `ref.onDispose()`.

### 8.2 Accessibility (WCAG 2.1 AA)
- Contrast ratio $\ge 4.5:1$ for all text tokens in both light and dark themes.
- Touch target bounds $\ge 48 \times 48$ dp for icon buttons.
- Dynamic text scaling up to 200% font scale without pixel overflow.
- `SemanticsService.announce` announcements for critical real-time campaign state changes.
- Respects `MediaQuery.disableAnimationsOf(context)` for reduced-motion preferences.

### 8.3 Automated Test Matrix
- **Unit Tests:** `ApiException` parsing, campaign state machine invariants, import regex validation, and Riverpod AsyncNotifier unit tests.
- **Widget Tests:** Light/Dark theme rendering, composer inputs, wizard steps, status chips, live confirmation dialogs, and A11y semantics labels.
- **Integration Tests:** End-to-end verification against the local NestJS backend verifying demo login, CSV upload, campaign planning, simulation dispatch, and report export.

---

## 9. Implementation Plan & Agent File Ownership

To ensure non-overlapping, concurrent execution, work is allocated as follows:

| Agent / Workstream | Module / Directory Ownership | Key Deliverables |
| :--- | :--- | :--- |
| **Agent J (Foundation & Shell)** | `lib/core/theme/`, `lib/core/widgets/`, `lib/app/router/`, `lib/app/shell/` | Design system tokens, `OutreachButton`, `AppNavDrawer`, `AppNavRail`, GoRouter shell setup |
| **Agent K (API Client & Auth)** | `lib/core/api/`, `lib/core/auth/`, `lib/core/models/`, `lib/features/auth/` | Dio client, cookie session jar, `ApiException` mapper, demo login flow, shared data models |
| **Agent L (Home & Wizard)** | `lib/features/home/`, `lib/features/campaigns/wizard/` | Floating composer, overview metrics, 5-step campaign wizard, deterministic plan review |
| **Agent M (Contacts & Import)** | `lib/features/contacts/` | Contact list, Base64 file upload, validation feedback, row correction dialog |
| **Agent N (Personas & Sandbox)** | `lib/features/agents/` | Persona list, prompt editor, version snapshotting, text sandbox preview |
| **Agent O (Execution & Inspector)** | `lib/features/campaigns/detail/`, `lib/features/calls/` | Real-time campaign detail, SSE stream consumer, pause/resume/cancel, call inspector side sheet |
| **Agent P (Reports & Settings)** | `lib/features/reports/`, `lib/features/settings/` | Async report creation, binary download stream, workspace settings, integrations readiness |
| **Agent Q (Testing & Verification)** | `test/`, `integration_test/` | Unit tests, widget tests, provider tests, E2E integration test suite |

**Gate B Status:** **APPROVED**. Proceed to Phase 3 (Architecture Setup & Scaffolding) and Phase 4 (Implementation).
