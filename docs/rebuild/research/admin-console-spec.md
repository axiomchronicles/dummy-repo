# Outreach Intern V3 — Vite Admin Console UX, Auth & Operational Tools Specification

**Document:** `docs/rebuild/research/admin-console-spec.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent G)  
**Author:** Administrative Systems & Operator Tooling Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Product Scope & Operator Boundary

The **Vite Admin Console (`apps/admin`)** is a private, operator-only web portal. It is explicitly **not** a general-purpose customer dashboard or campaign wizard. Its sole purpose is system provisioning, security enforcement, infrastructure observability, and operational control.

### Key Architectural Tenets
1. **Identical Design System:** Uses the same minimalist, monochrome design tokens as the Flutter mobile app (pitch black/crisp white surfaces, 1px delicate borders, high-contrast typography, restrained red accent).
2. **Server-Enforced Privileges:** Every administrative endpoint validates session cookies, checks the `admin` or `superadmin` role, and mandates prior TOTP MFA verification. The UI never hides security flaws behind client-side route guards alone.
3. **Write-Only Secrets:** API keys for Sarvam and OpenAI-compatible models are never transmitted back to the browser. The console displays status as `Configured` or `Missing` and provides a safe test ping.

---

## 2. Admin Console Views & Operations

```
                                  ┌───────────────────────────────┐
                                  │      Admin Console Layout     │
                                  └──────────────┬────────────────┘
                                                 │
            ┌──────────────────┬─────────────────┼──────────────────┬─────────────────┐
            ▼                  ▼                 ▼                  ▼                 ▼
     [System Overview]    [Users & MFA]     [Audit Logs]      [Agent Harness]    [Telephony & Ops]
     • Health / Ready     • Invite User     • Login Attempts  • Prompt Versions  • Kill Switch
     • Queue Backlogs     • Reset TOTP      • Role Changes    • Tool Allowlists  • Failed Jobs
     • Active Workers     • Revoke Sessions • PII Masked Log  • Provider Test    • Retention
```

### 2.1 View 1: System Overview & Telephony Kill-Switch
- **System Readiness:** Live indicators for PostgreSQL connection pool, Redis ping, BullMQ worker status.
- **Queue Metrics:** Backlog depths and throughput across all 5 queues (`imports`, `dispatch`, `reconciliation`, `analysis`, `reports`).
- **Global Emergency Kill-Switch:**
  - High-visibility banner switch: `EMERGENCY TELEPHONY KILL-SWITCH`.
  - When toggled ON: Backend writes `telephony_kill_switch: true` to `system_settings` in a transaction. Workers immediately suspend outbound dispatch.
  - Requires explicit confirmation modal with reason input.

### 2.2 View 2: User Provisioning & MFA Administration
- **User Directory:** Paginated list displaying name, email, role (`superadmin`, `admin`, `operator`, `viewer`), status (`active`, `invited`, `disabled`, `locked`), MFA status (`Enrolled`, `Pending`), and last login timestamp.
- **Invite User Modal:**
  - Fields: Email, Full Name, Assigned Role, Workspace.
  - Action: Issues invitation token and copies invitation link to clipboard or dispatches email.
- **Security Actions (Row Menu):**
  - `Revoke All Sessions`: Invalidates active session tokens immediately.
  - `Reset MFA`: Clears user TOTP secret with mandatory audit log entry, requiring re-enrollment on next login.
  - `Lock / Disable Account`: Prevents any further login or token refresh.
  - `Reactivate Account`: Restores disabled account.

### 2.3 View 3: Security & Mutation Audit Log
- Searchable and filterable table recording all critical system events:
  - Columns: Timestamp, Actor, Action (e.g. `user.invite`, `auth.mfa_reset`, `campaign.kill_switch_enabled`), Target Entity, IP Address, Status.
  - Masking: Phone numbers in metadata are masked (`+91 ••••• ••793`); tokens and secrets are redacted.

### 2.4 View 4: Agent Harness & Prompt Registry
- **Configured Agents:** Inspect active Mastra agents (`Outreach Planner`, `Contact Validator`, `Supervisor`, `Post-call Analyst`, `Report QA`).
- **Prompt Version Inspector:** Read-only view of versioned prompt templates, tools attached, and system instructions.
- **Model Provider Diagnostics:**
  - Displays configured `Base URL` and `Model ID`.
  - Button: "Test Model Capability" (sends a lightweight test prompt to verify structured JSON output support without incurring high costs or side-effects).

### 2.5 View 5: Sarvam Telephony & Operations
- **Sarvam Status:** Connection ID, Agent Phone Number (`+918064269408`), active App ID, webhook ingress URL.
- **Telephony Allowlist:** Displays configured `LIVE_DESTINATION_ALLOWLIST` numbers.
- **Dead-Letter / Failed Jobs Queue:**
  - Lists failed BullMQ jobs with error stack trace and attempt count.
  - Actions: "Retry Job", "Discard Job".
- **Data Retention & Pruning:** Configured retention window (default 30 days) and manual trigger for expiring completed call transcripts and temporary import artifacts.

---

## 3. Technology Stack & Implementation Directory (`apps/admin`)
- **Framework:** React 19 + TypeScript + Vite 8
- **State Management:** `@tanstack/react-query` v5 for reactive server data
- **Forms & Validation:** `react-hook-form` + `@hookform/resolvers` + `zod`
- **Component Primitives:** Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-switch`)
- **Icons:** `lucide-react` or `hugeicons`
- **Styling:** Tailwind CSS v4 with dark/light monochrome theme matching the mobile design.
