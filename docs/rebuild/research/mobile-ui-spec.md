# Outreach Intern V3 — Flutter Mobile Architecture & Visual Design Specification

**Document:** `docs/rebuild/research/mobile-ui-spec.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent F)  
**Author:** Mobile Product Engineering & UX Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Flutter Mobile Architecture Baseline

Official Flutter & Riverpod architecture verified:
- Flutter Architecture Guide: https://docs.flutter.dev/app-architecture/guide
- Riverpod Architecture: https://riverpod.dev/docs/introduction/why_riverpod
- HugeIcons Flutter: `hugeicons: ^1.2.0` (cached on pub.dev)

### 1.1 Feature-First Monorepo Structure (`apps/mobile`)
```
apps/mobile/
├── lib/
│   ├── main.dart                          # App entry point, ProviderScope, Theme initialization
│   ├── core/
│   │   ├── config/env.dart                # API Base URL (configurable for Simulator/Emulator/Host)
│   │   ├── network/api_client.dart        # Typed HTTP client with token refresh & error mapping
│   │   ├── storage/secure_storage.dart    # OS Keychain/Keystore token adapter
│   │   ├── theme/app_theme.dart           # Light/Dark monochrome theme definitions
│   │   └── widgets/                       # Shared atomic widgets (buttons, badges, inputs)
│   └── features/
│       ├── auth/                          # Login, MFA challenge, Google sign-in
│       ├── chat/                          # Conversational composer, threads, SSE streaming
│       ├── imports/                       # File picker, roster preview, column mapping
│       ├── confirmation/                  # Confirmation bottom sheet drawer
│       ├── campaigns/                     # Campaign monitor, live activity, progress
│       ├── history/                       # Call history, transcript detail, summary
│       ├── agents/                        # Sarvam voice & agent catalog inspector
│       └── settings/                      # Security, MFA management, sessions, profile
└── test/                                  # Widget, unit, and integration tests
```

---

## 2. Visual Design System (Monochrome Premium)

Derived from the approved design reference screenshots (`0dd53d837bc38927ee068b9a59f270e9` and `0c84abb05736192de821639b0950cc13`):

### 2.1 Color Tokens & Theming
| Token Name | Light Theme | Dark Theme | Purpose |
| :--- | :--- | :--- | :--- |
| `surfaceBackground` | `#F8F9FA` | `#0B0B0B` (Pitch dark) | Main scaffold background |
| `cardSurface` | `#FFFFFF` | `#161616` | Elevated cards, bottom sheets |
| `borderDelicate` | `#E5E7EB` | `#262626` | 1px subtle divider borders |
| `textPrimary` | `#111827` | `#F3F4F6` | High-contrast headings and body |
| `textSecondary` | `#6B7280` | `#9CA3AF` | Supporting labels, timestamps |
| `accentColor` | `#111827` / `#DC2626` | `#EF4444` (Vibrant Red) | Action button, send arrow, focus |
| `statusSuccess` | `#16A34A` | `#22C55E` | Connected, Completed, Valid |
| `statusWarning` | `#D97706` | `#F59E0B` | Needs Correction, Duplicate |
| `statusDanger` | `#DC2626` | `#EF4444` | Excluded, Busy, Failed |

### 2.2 Typography & Elevation
- Clean typography hierarchy (Inter or Platform Default) with spacious line heights.
- No heavy drop-shadows; depth is communicated through subtle borders (`#262626`) and background value stepping (`#0B0B0B` -> `#161616` -> `#1F1F1F`).
- Rounded Corner Radius: `16px` (`BorderRadius.circular(16)`) for cards; `24px` for the floating prompt composer.

---

## 3. Screen Specifications & Flows

### 3.1 Sign-In & MFA Screens
- **Sign-In View:**
  - Minimal logo mark, heading "Sign in to Outreach Intern".
  - Email and password input fields with clear validation states.
  - "Sign in with Google" button.
  - Notice: "Accounts are provisioned by your system administrator. Contact your team lead for access." (Explicitly no Sign-up link).
- **MFA Challenge View:**
  - 6-digit PIN input with auto-advance and numeric keyboard.
  - "Verify Authenticator Code" button.
  - Secondary action: "Use a backup recovery code".

### 3.2 Conversational Home Screen (`/chat`)
- **Header:** Drawer menu icon (`HugeIcons.strokeRoundedMenuSquare`), centered app logo, user avatar.
- **Greeting Section:** "Hello, Milo" (time-of-day contextual greeting) positioned gracefully above composer.
- **Floating Prompt Composer Card:**
  - Text input: "How can I help you today?" with multi-line auto-expand.
  - Bottom action bar:
    - `+` icon for file attachment (CSV, XLSX, TSV, TXT, vCard).
    - Agent selector dropdown (e.g. `Hindi Voice Agent v1`).
    - Voice input microphone icon.
    - High-contrast circular send button with upward arrow (`HugeIcons.strokeRoundedArrowUp01`).
- **Thread View:** Once message sent, messages render in conversation flow:
  - User message in rounded bubble (`#F1F5F9` light / `#1F1F1F` dark).
  - Assistant message with expandable "Thought" banner, file view pill (`Viewed students_batch.csv`), and generated draft.

### 3.3 Confirmation Drawer / Bottom Sheet
When draft generation completes, the confirmation sheet automatically slides up:
- **Header:** Campaign Title ("Acme Corp Interview Outreach"), status pill "DRAFT REVIEW".
- **Metric Cards:** 3-column summary:
  - Total: `48 Contacts`
  - Valid: `46 Eligible`
  - Excluded: `2 Excluded (1 Duplicate, 1 Invalid Phone)`
- **Configuration Section:**
  - Sarvam Agent: `Hindi Voice Agent` (Version 1)
  - Telephony Connection: `+918064269408`
  - Planned Call Window: `10:00 - 18:00 IST`
  - Estimated Cost: `Simulation: ₹0.00` (or `Estimated: ₹230.00`)
- **Call Script & Questions Preview:** Expandable card showing the exact message script and confirmation questions.
- **Recipient Drilldown Table (SliverList):**
  - Columns: Name, Masked Phone (`+91 ••••• ••793`), Scheduled Slot, Status.
  - Tap row to inspect or exclude.
- **Action Buttons:**
  - `Cancel` (dismisses sheet and preserves draft).
  - `Simulate` (launches in local simulation mode).
  - `Confirm & Launch` (prominent button executing live dispatch if configured).

### 3.4 Call History & Transcript Detail
- **Call History Screen:**
  - Built with `CustomScrollView` and `SliverList` for smooth scrolling over 1,000+ records.
  - Filter chips: `All`, `Connected`, `No Answer`, `Busy`, `Failed`.
  - Search bar filtering by recipient name or phone.
  - List item shows contact name, masked number, duration badge ("0m 48s"), outcome badge, timestamp.
- **Call Detail Screen:**
  - Header: Recipient Name, masked number, date, duration.
  - **Transcript View:**
    - Clean chronological speech bubbles distinguishing Agent (`#1E293B`) from User (`#0F172A`).
    - For non-English calls: Original Hindi text with toggle for translated English (`en_text`).
  - **Post-Call Analysis Card:**
    - Executive Summary (bulleted takeaway).
    - Disposition (`confirmed: true`, `attendance: "Will attend with Aadhaar card"`).
    - Follow-up recommendation.
  - **Audio Player:** Standard waveform/slider player if recording exists, or clean "Audio recording unavailable" badge.

---

## 4. Performance & Accessibility Standards
- **Sliver Primitives:** Utilized in Call History and Recipient Drilldown to ensure 60fps scrolling with lazy widget recycling.
- **Riverpod State:** Selective subscriptions via `ref.watch(provider.select(...))` to prevent unnecessary widget rebuilds during live SSE events.
- **Reduced Motion:** Observes `MediaQuery.of(context).disableAnimations` to bypass heavy transitions.
- **Dark/Light Mode:** Seamless reactive theme switching with high contrast ratios exceeding WCAG AA standards.
