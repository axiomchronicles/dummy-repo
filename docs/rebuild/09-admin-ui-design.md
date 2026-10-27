# Outreach Intern V3 — Vite Admin Console UI Design Specification

**Document:** `docs/rebuild/09-admin-ui-design.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal Frontend Architect  

---

## 1. Visual Language & Operator Persona

The **Vite Admin Console (`apps/admin`)** provides a private, operator-focused control plane. It shares the identical design tokens, typography, and dark/light monochrome aesthetic as the Flutter mobile app:
- **Surface Elevation:** Pitch black background (`#0B0B0B`), elevated cards (`#141414`), subtle borders (`#262626`).
- **Typography:** Monospace fonts for IDs, hashes, and metrics; clean sans-serif for labels and navigation.
- **Tone:** Professional, high-density, auditable, and resilient.

---

## 2. Admin Console Views & Navigation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Outreach Intern Admin  │  Overview  │  Users  │  Queues  │  Agent Harness  │  Audit   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [EMERGENCY TELEPHONY KILL-SWITCH: OFF]                     [Operator: Milo (Superadmin)]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 View 1: System Overview & Telephony Kill-Switch
- **Health Panel:** Real-time health check cards for PostgreSQL pool, Redis ping, BullMQ worker processes, and active SSE stream count.
- **Emergency Telephony Kill-Switch:**
  - High-visibility banner switch: `GLOBAL TELEPHONY KILL-SWITCH`.
  - When triggered, sends `POST /api/v1/admin/kill-switch { active: true, reason: string }`.
  - Prompts for confirmation with mandatory reason entry.
- **Operational Metrics:** Active campaigns, running calls, completed calls today, failure rate percentage.

### 2.2 View 2: User Provisioning & MFA Administration
- **User Directory Table:**
  - Columns: Name, Email, Role (`superadmin`, `admin`, `operator`, `viewer`), Status (`active`, `invited`, `disabled`, `locked`), MFA Status (`Enrolled`, `Pending`), Last Login, Actions.
- **Invite User Modal:**
  - Input: Email, Full Name, Workspace, Role.
  - Submits to `POST /api/v1/admin/users/invite`. Displays generated invitation link and expiry time.
- **Action Menu (Per User):**
  - `Revoke All Sessions`: Immediately drops active tokens.
  - `Reset MFA`: Clears user TOTP secret with mandatory reason log, requiring re-enrollment on next login.
  - `Lock / Disable Account`: Suspends user access.
  - `Reactivate Account`: Restores account access.

### 2.3 View 3: Operational Queue & Worker Health
- **5 Queue Cards:** `imports`, `dispatch`, `reconciliation`, `analysis`, `reports`.
- Displays:
  - Active jobs count.
  - Waiting / Delayed jobs count.
  - Failed / Dead-letter jobs count.
- **Dead-Letter Job Inspector:**
  - Inspects failed BullMQ jobs.
  - Displays error code, stack trace, and attempt count.
  - Action buttons: "Retry Job", "Purge Job".

### 2.4 View 4: Agent Harness & Prompt Version Registry
- **Configured Agents:** Inspect active Mastra agents (`Outreach Planner`, `Contact Validator`, `Campaign Supervisor`, `Post-call Analyst`).
- **Prompt Version Inspector:** Read-only view of versioned prompt instructions, active skills, and attached tools.
- **Model Provider Configuration:**
  - Shows configured `Base URL` and `Model ID`.
  - Key status: `Configured (Encrypted)` or `Missing`. (Actual secret key is never sent to browser).
  - Button: "Test Model Capability Ping" (sends a test prompt without side-effects).

### 2.5 View 5: Security & Mutation Audit Log
- Searchable log of all sensitive operations:
  - Columns: Timestamp, Actor Name, Action (`user.invite`, `auth.mfa_reset`, `campaign.kill_switch_enabled`, `session.revoked`), Target Entity, IP Address, Status.
  - PII Protection: Phone numbers in payload metadata are masked (`+91 ••••• ••793`).
- Export Audit Log: Download CSV audit record with formula injection escaping.
