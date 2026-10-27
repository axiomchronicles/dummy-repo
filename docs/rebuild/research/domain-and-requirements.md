# Outreach Intern V3 — Product Requirements and Domain Lifecycle Specification

**Document:** `docs/rebuild/research/domain-and-requirements.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent A)  
**Author:** Requirements & Domain Modeling Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Domain Problem & Scope Boundary

Outreach Intern V3 is an AI-assisted calling and outreach operations platform designed for deliberate, auditable outbound campaigns. The user interacts through a conversational composer on a Flutter mobile client, uploads or attaches contact rosters, reviews an unambiguous per-recipient plan in a confirmation bottom sheet, and explicitly confirms the execution.

### Non-Negotiable Boundaries
1. **Surfaces**:
   - Primary: **Flutter Mobile App (`apps/mobile`)** running on iOS/Android.
   - Operator: **Vite Admin Console (`apps/admin`)** for user provisioning, tenant security, system kill-switch, queue health, and integration administration.
   - **No Customer Web App**: `apps/web` from V2 is discarded. There is no general-purpose customer dashboard.
2. **Authorization Boundary**:
   - The LLM proposes; deterministic backend rules authorize.
   - A natural-language prompt or file upload NEVER initiates a phone call.
   - Confirmation is an explicit, separate user action passing an idempotency key and versioned snapshot.
3. **Simulation Default**:
   - The default mode is `simulation`, which produces deterministic synthetic call outcomes, transcripts, and analytics without consuming provider credits or placing network calls.
   - Live calling requires explicit server-side configuration, live mode toggle, allowlist verification, and active consent records.

---

## 2. Entity Lifecycles & State Transitions

### 2.1 User & Account Lifecycle
```
[Admin Invitation Created] ──> [Pending First Login / Setup] ──> [MFA Enrollment] ──> [Active]
                                                                                        │
                                                                   ┌────────────────────┴────────────────────┐
                                                                   ▼                                         ▼
                                                             [Disabled / Locked]                     [Sessions Revoked]
```
- **States**: `invited`, `active`, `disabled`, `locked`.
- **Transitions**:
  - `invited -> active`: User sets initial password via token or completes primary auth + enrolls in TOTP MFA + stores hashed recovery codes.
  - `active -> disabled`: Admin action revokes active sessions and prevents further token issuance.
  - `active -> locked`: Triggered automatically after 5 consecutive failed login attempts within 15 minutes. Requires admin unlock or recovery-code unlock.

### 2.2 Chat Conversation & Message Lifecycle
- `chat_threads`: Represents a planning conversation thread owned by a user in a workspace.
- `chat_messages`: Ordered sequence of user prompts and agent responses.
  - Role: `user` | `assistant` | `system`
  - Metadata: attached file hashes, referenced draft IDs, token usage, Mastra run ID.
  - Independent from phone call transcripts. Planning chat is retained according to workspace message policy.

### 2.3 Contact Import Lifecycle
```
[Uploaded] ──> [Validating] ──> [Ready] (All rows valid)
                     │
                     ├──> [Needs Correction] (Partial row issues)
                     └──> [Failed] (Unparseable / Corrupted / Exceeds size limits)
```
- **Supported Formats**: CSV, XLSX, XLS, TSV, TXT, vCard (`.vcf`).
- **Row States**:
  - `valid`: Full name, verified E.164 phone number, valid required parameters.
  - `invalid`: Missing name, malformed phone, missing critical parameters.
  - `duplicate`: Repeated phone number within batch or across existing campaign roster.
  - `excluded`: Explicitly blocked due to suppression list, lack of consent, or out-of-bounds calling window.

### 2.4 Campaign Draft & Confirmation Lifecycle
```
[Draft Created] ──> [Planner Processing] ──> [Plan Proposed] ──> [User Review in Drawer]
                                                                          │
                                       ┌──────────────────────────────────┴──────────────────┐
                                       ▼                                                     ▼
                              [User Edits Plan / Rows]                              [Explicit Confirmation]
                                       │                                                     │
                                       └─────────────────── [Re-validating] <────────────────┘
                                                                    │
                                                                    ▼
                                                            [Campaign Durable]
```
- **Plan Snapshot**: A cryptographic SHA-256 hash of the objective, agent version ID, import ID, eligible contact count, and policy parameters.
- **Stale Protection**: If any row or parameter changes between plan generation and user tap on "Confirm", the server rejects with `409 Conflict: PLAN_STALE`, forcing the drawer to re-render the refreshed snapshot.

### 2.5 Campaign Execution Lifecycle
```
[Planned / Scheduled] ──> [Running / Dispatching] ──> [Completed]
           │                         │
           ├──> [Cancelled]          ├──> [Paused] ──> [Resumed]
           │                         │
           └──> [Failed]             └──> [Cancelled]
```
- **Scheduled vs Immediate**:
  - If `scheduledAt` is in the future: campaign remains in `scheduled` state; BullMQ delayed job or database scheduler triggers state change to `running` when eligible.
  - If `scheduledAt` is null or immediate: immediately transitions to `running` and dispatches eligible contacts.
- **Terminal States**: `completed`, `cancelled`, `failed`.

### 2.6 Per-Contact Call Attempt Lifecycle
```
[Created] ──> [Queued] ──> [Dispatching] ──> [Accepted by Provider] ──> [Connected] ──> [Completed]
                  │              │                      │                     │
                  │              │                      │                     └──> [Terminated Early]
                  │              │                      │
                  │              │                      └──> [Provider Webhook / Reconciled Terminal]
                  │              │                             (no_answer, busy, failed)
                  │              │
                  │              └──> [Network Timeout / Ambiguous] ──> [Reconciliation Job]
                  │                                                           │
                  │                                                           └──> Resolved
                  └──> [Excluded / Cancelled]
```
- **Attempt Outcome (Terminal)**: `connected`, `no_answer`, `busy`, `failed`, `unknown`, `cancelled`.
- **Invariance**: An attempt record is never overwritten. If a retry is permitted by campaign policy, a *new* attempt record is inserted with `attempt_number = attempt_number + 1`.

---

## 3. End-to-End User Journey Specification

### Journey Step 1: Admin Provisions User
- Admin opens `apps/admin`, navigates to `/users`, clicks "Invite User".
- Enters email, display name, and initial role (`operator` or `admin`).
- Backend generates an invitation token with 48-hour expiry and logs an audit record.

### Journey Step 2: Mobile Authentication & MFA
- User launches Flutter app on Android/iOS.
- Sees clean sign-in screen (Email/Password or Sign in with Google).
- Submits primary credentials. Server returns `200 OK` with `{ mfaRequired: true, mfaToken: "..." }`.
- App presents TOTP screen. User enters 6-digit authenticator code (or one-time recovery code).
- Server verifies TOTP secret using `speakeasy`/`otplib`, generates rotating refresh token and access token, stored securely in Flutter's `flutter_secure_storage` (iOS Keychain / Android Keystore).

### Journey Step 3: Conversational Prompt & File Attachment
- User lands on minimalist home screen: Greeting ("Hello, Milo"), drawer toggle, and bottom composer card.
- User taps "+" and attaches `students_batch_october.csv` (or `.xlsx`, `.tsv`, `.vcf`).
- User types prompt: *"Call these students and inform them their interview with Acme Corp is scheduled for Thursday, Nov 5 at 2:00 PM IST. Ask them to confirm attendance and bring government ID."*
- User taps Send. Message appears in thread. App connects to SSE stream or watches Mastra run.

### Journey Step 4: Planner Processing & Clarification
- Mastra Outreach Planner Agent processes the request:
  - Invokes `parseImportFile` tool to extract headers and preview rows.
  - Invokes `validateAndResolveContacts` to check phone numbers, normalize to E.164 (using workspace default `Asia/Kolkata` / `+91`), and flag missing fields.
  - If a mandatory parameter is ambiguous (e.g. venue address is missing), agent responds in chat asking for clarification.
  - Once resolved, agent constructs a structured `CampaignDraft` and triggers UI to display the confirmation drawer.

### Journey Step 5: Confirmation Drawer Review
- Bottom sheet animates up over the screen showing:
  - Campaign title & resolved objective.
  - Recipient summary: Total rows (50), Valid & Eligible (48), Excluded (2: 1 duplicate, 1 invalid phone format).
  - Selected Sarvam Voice Agent: Name, Version ID, Language (`Hindi` / `English`), Connection ID.
  - Script & Call Intent Preview: First message greeting, interview details, confirmation question.
  - Recipient Drilldown: Table with name, masked phone (`+91 ••••• ••793`), scheduled slot, custom variables.
  - Policy & Economics: Calling window (`10:00 - 18:00 IST`), max concurrency (2), estimated cost (or explicit "Simulation: ₹0.00").
  - Actions: `Edit Draft`, `Cancel`, `Simulate`, `Confirm & Launch`.

### Journey Step 6: Confirmation & Dispatch
- User taps `Confirm & Launch`.
- Flutter client issues `POST /api/v1/campaigns/:id/confirm` with `Idempotency-Key` and `planSnapshotHash`.
- Backend executes transactional commit:
  - Validates campaign is still in `draft` or `planned` state.
  - Inserts 48 `campaign_contacts` with status `pending`.
  - Emits `campaign.confirmed` event and writes to `outbox` table.
- BullMQ worker picks up outbox event and moves contacts into `dispatch` queue.

### Journey Step 7: Controlled Dispatch & Sarvam Telephony
- Worker claims contact task. Re-validates:
  - Global emergency kill-switch is NOT enabled.
  - Current time is within workspace calling window (`10:00 - 18:00 IST`).
  - Contact is not in `suppressions` table.
- In **Simulation Mode**:
  - `MockVoiceProvider` generates synthetic call progression (`dispatching -> accepted -> connected -> completed`).
  - Simulates realistic speech transcript and extracted variables.
- In **Live Mode**:
  - Issues POST to `https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds`.
  - Stores provider `attempt_id`.
  - Awaits webhook callback on `POST /api/v1/webhooks/sarvam/:token`.

### Journey Step 8: Post-Call Analysis & Call History
- When attempt reaches terminal state with transcript:
  - Enqueues `analysis` job.
  - Mastra Post-call Analysis Agent processes transcript turns:
    - Extracts attendance confirmation: `confirmed` | `declined` | `reschedule_requested` | `unknown`.
    - Generates 2-sentence executive summary.
    - Flags follow-up requirements.
- User opens "Call History" in Flutter app:
  - Filterable by outcome, date, campaign.
  - Detailed view shows chronological transcript bubbles with speaker distinction (Agent vs User), original text, translated English text, extracted fields, confidence scores, and audio recording player if authorized.

### Journey Step 9: Report Generation & Export
- User requests report: `POST /api/v1/campaigns/:id/reports`.
- Worker asynchronously queries canonical relational data, sanitizes all fields against CSV/XLSX formula injection (`=`, `+`, `-`, `@`), generates `.csv` or `.xlsx` artifact, and updates report status to `completed`.
- User downloads report directly from mobile or admin console.

---

## 4. Acceptance Criteria for Agent A
- [x] All 7 entity lifecycles modeled with unambiguous legal transitions and failure states.
- [x] Hard boundary verified: user confirmation is the sole campaign launch trigger.
- [x] Zero customer-facing web dashboard permitted; mobile and admin console surfaces strictly defined.
- [x] Simulation vs Live execution cleanly isolated.
