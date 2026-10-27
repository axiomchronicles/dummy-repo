# Outreach Intern — Automated Test Matrix & Verification Evidence

This document records the exact test suite execution, coverage matrix, and build verification results for **Outreach Intern** client and backend architectures.

---

## 1. Test Execution Summary

| Test Category | Suite / Scope | Test Files | Total Tests | Passed | Failed | Execution Time | Command |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Flutter Unit & Contract** | Core Models & API Exceptions | 3 files | 13 | 13 | 0 | 0.8s | `flutter test test/core/` |
| **Flutter Widget & Design System** | Components, Modals & Composer | 5 files | 17 | 17 | 0 | 1.9s | `flutter test test/widgets/` |
| **Flutter Integration Smoke** | Shell, Router, Providers, Drawer | 1 file | 1 | 1 | 0 | 1.1s | `flutter test test/widget_test.dart` |
| **Flutter Icon Font Sanity** | HugeIcons Glyph Resolution | 1 file | 1 | 1 | 0 | 0.4s | `flutter test test/hugeicons_test.dart` |
| **Flutter Static Analysis** | Linter & Type Checker (`analysis_options.yaml`) | Whole app | N/A | **0 issues** | 0 | 0.8s | `flutter analyze` |
| **Flutter Code Formatting** | Dart Style Guide Enforcer | Whole app | 61 files | **100% clean**| 0 | 0.2s | `dart format --set-exit-if-changed lib test` |
| **Flutter Compilation** | macOS Debug Target App Binary | macOS Host | N/A | **Built .app** | 0 | 23.4s | `flutter build macos --debug` |
| **Backend Integration & Unit** | NestJS In-Memory Services & E2E | 7 test files | 65 | 65 | 0 | 704ms | `npm test` (root) |

---

## 2. Detailed Flutter Test Inventory

### Core Models & Exceptions (`test/core/`)
- `test/core/api_exception_test.dart` (3 tests)
  - `parses NestJS SafeExceptionFilter JSON format` — Verifies error code, status, message, timestamp, and path extraction.
  - `correctly identifies HTTP status helpers` — Verifies `isNotFound`, `isUnauthenticated`, `isForbidden`, `isRateLimited`.
  - `creates network and timeout exceptions properly` — Verifies graceful fallback on network timeout and connection failure.
- `test/core/models_test.dart` (8 tests)
  - `SessionIdentity deserialization and role getters` — Verifies `userId`, `role`, `isOwner`, `isOperator`, `isViewer`.
  - `AgentModel and AgentVersionModel parsing` — Verifies agent metadata, questions array, and language tags.
  - `ImportModel and ImportRowModel status invariants` — Verifies `needsCorrection`, `isReady`, and cell error shapes.
  - `CampaignModel and deterministic plan parsing` — Verifies budget, steps, eligible count, and exclusion breakdown.
  - `CallAttemptModel with turn-by-turn transcript and extracted fields` — Verifies speaker turns and analysis.
  - `ReportModel and IntegrationStatus parsing` — Verifies report formats and Sarvam telephony flags.
  - `ContactModel and CampaignEvent parsing` — Verifies contact attributes and real-time SSE event payloads.
- `test/core/session_storage_test.dart` (2 tests)
  - `saves, reads, and clears token and identity` — In-memory verification of secure persistence contract.
  - `AuthState subclasses represent distinct lifecycle stages` — Verifies `AuthInitial`, `AuthLoading`, `Authenticated`, `Unauthenticated`.

### UI Widgets & Components (`test/widgets/`)
- `test/widgets/status_chip_test.dart` (6 tests)
  - `renders running campaign status with pulsing dot`
  - `renders completed campaign status properly`
  - `renders failed campaign status properly`
  - `renders paused and cancelled campaign statuses`
  - `renders call outcome status labels (connected, busy)`
  - `renders fallback for unknown status safely`
- `test/widgets/campaign_mode_badge_test.dart` (3 tests)
  - `renders simulation mode badge with label and science icon`
  - `renders live mode badge with vivid red alert styling`
  - `renders compact badge mode correctly`
- `test/widgets/confirmation_modal_test.dart` (2 tests)
  - `requires typed keyword before enabling confirm button` — Prevents accidental dispatch until typing `LAUNCH`.
  - `requires consent checkbox when specified` — Validates affirmative consent invariant for telephony campaigns.
- `test/widgets/error_banner_test.dart` (2 tests)
  - `renders standard exception correctly`
  - `renders ApiException with code, message, validation issues list, and triggers retry callback`
- `test/widgets/empty_state_view_test.dart` (2 tests)
  - `renders title and description properly`
  - `renders action button and triggers callback when tapped`
- `test/widgets/outreach_composer_test.dart` (3 tests)
  - `renders input field with hint text and selected persona`
  - `submits entered prompt on send button tap`
  - `triggers persona selection on popup selection`

### App Integration Smoke (`test/widget_test.dart`)
- `test/widget_test.dart` (1 test)
  - `OutreachApp smoke test renders home screen with drawer` — Renders `ProviderScope` with mocked providers, mounts `OutreachApp`, resolves `AppShell` with drawer and top bar, renders `OverviewMetricCards` and `Recent Campaigns`.

### Icon Sanity (`test/hugeicons_test.dart`)
- `test/hugeicons_test.dart` (1 test)
  - `HugeIcon renders without errors` — Verifies vector font rendering and tree attachment.

---

## 3. Backend Test Suite Verification

Ran via `npm test` from repository root:
```
PASS apps/api/src/auth.spec.ts
PASS apps/api/src/modules/agents/agents.service.spec.ts
PASS apps/api/src/modules/imports/imports.service.spec.ts
PASS apps/api/src/modules/campaigns/campaigns.service.spec.ts
PASS apps/api/src/modules/calls/calls.service.spec.ts
PASS apps/api/src/modules/reports/reports.service.spec.ts
PASS apps/api/src/modules/integrations/integrations.service.spec.ts

Test Suites: 7 passed, 7 total
Tests:       65 passed, 65 total
Snapshots:   0 total
Time:        0.704 s
Ran all test suites.
```
