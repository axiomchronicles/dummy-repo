# Outreach Intern V3 — Flutter Mobile UI Design Specification

**Document:** `docs/rebuild/08-mobile-ui-design.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal Mobile UI/UX Architect  

---

## 1. Visual Language & Surface Hierarchy

The Flutter application (`apps/mobile`) embodies a restrained, minimalist aesthetic inspired by modern AI conversational interfaces (e.g. OpenAI / Perplexity / Claude):
- **Surfaces:** Generous whitespace, razor-thin borders (`1px`), subtle surface elevation steps (`#0B0B0B` -> `#161616` -> `#202020` in dark mode; `#F8F9FA` -> `#FFFFFF` -> `#F1F3F5` in light mode).
- **Typography:** Crisp sans-serif with distinct weight hierarchy (Bold 24pt greetings, Medium 16pt message text, Regular 14pt secondary labels).
- **Accents:** High-contrast circular action button with upward arrow; semantic badges for status (green for connected, amber for warning/retry, red for failed/excluded).

---

## 2. Screen & Component Inventory

### 2.1 Screen 1: Sign-In & MFA Flow
- `SignInScreen`:
  - Minimal logo banner.
  - Email and password inputs with reactive validation.
  - "Sign In with Google" branded button.
  - Footnote: "System access is provisioned by administrators only." (No sign-up link).
- `MfaChallengeScreen`:
  - 6-digit PIN input fields with auto-focus and auto-advance.
  - Button: "Verify Code".
  - Link: "Use one-time backup recovery code".

### 2.2 Screen 2: Conversational Home (`HomeScreen`)
- `AppBar`:
  - Left: Hamburger drawer trigger (`HugeIcons.strokeRoundedMenuSquare`).
  - Center: Minimal brand mark.
  - Right: Profile avatar.
- `GreetingWidget`:
  - "Hello, Milo" (or "Evening, Milo" contextual greeting).
- `MessageThreadListView`:
  - Renders conversation bubbles.
  - Assistant bubble includes expandable "Thought" card, attachment pills, and draft summary card.
- `PromptComposerCard`:
  - Floating container (`rounded-3xl`, 24px corner radius, delicate border).
  - Multi-line text field: "How can I help you today?".
  - Action row:
    - Attachment icon (`HugeIcons.strokeRoundedAttachment01`): opens file picker.
    - Agent selector dropdown (e.g. `Hindi Voice Agent v1`).
    - Microphone icon (`HugeIcons.strokeRoundedMic01`).
    - Circular high-contrast send button (`HugeIcons.strokeRoundedArrowUp01`).

### 2.3 Screen 3: Slide-Out Navigation Drawer (`AppDrawer`)
- Header: Brand logo + workspace name ("Acme Outreach Operations").
- Menu Items:
  - `New Task` (`HugeIcons.strokeRoundedPencilEdit02`)
  - `Campaigns` (`HugeIcons.strokeRoundedCall`)
  - `Scheduled` (`HugeIcons.strokeRoundedCalendar03`)
  - `Agents & Voices` (`HugeIcons.strokeRoundedVoice`)
  - `Reports` (`HugeIcons.strokeRoundedFile01`)
  - `Settings & Security` (`HugeIcons.strokeRoundedSettings02`)
- Thread History Sections:
  - `Today`
  - `Yesterday`
  - `Previous 7 Days`

### 2.4 Screen 4: Confirmation Bottom Sheet (`ConfirmationDrawer`)
Modal bottom sheet displaying the proposed outreach plan before execution:
- **Campaign Objective:** "Acme Corp Interview Outreach".
- **Recipient Stat Strip:** Total (48), Valid (46), Excluded (2).
- **Script & Intent Card:** Exact message script that will be delivered by the agent.
- **Provider & Cost Card:**
  - Sarvam Agent: `Hindi Voice Agent` (Version 1).
  - Outbound Number: `+918064269408`.
  - Mode Badge: `Simulation: ₹0.00` or `Live Dialing`.
- **Recipient Drilldown Table (SliverList):**
  - Name, Masked Phone (`+91 ••••• ••793`), Scheduled Slot, Exclude toggle.
- **Footer Actions:**
  - `Edit Script`
  - `Cancel`
  - `Simulate`
  - `Confirm & Launch` (Requires deliberate tap; dispatches campaign).

### 2.5 Screen 5: Call History & Chronological Transcript (`HistoryScreen` & `CallDetailScreen`)
- **Call History:** Filterable by outcome chips (`All`, `Connected`, `No Answer`, `Busy`, `Failed`).
- **Call Detail:**
  - Outcome pill, call duration (`0m 48s`), timestamp.
  - Transcript Feed:
    - Agent speech bubble (left-aligned, soft dark surface).
    - User speech bubble (right-aligned, darker surface).
    - Non-English toggle: switches between original language and translated English (`en_text`).
  - Analysis Card:
    - Disposition badge (e.g. `Confirmed Attendance`).
    - Executive takeaway summary.
    - Commitment details (e.g. "Will bring Aadhaar card").

---

## 3. Widget Hierarchy & Riverpod Architecture

```
ProviderScope
├── MaterialApp (Theme: Dark / Light)
│   └── AppRouter (GoRouter)
│       ├── /auth (AuthGuard)
│       │   ├── /login -> SignInScreen
│       │   └── /mfa -> MfaChallengeScreen
│       └── / (HomeShell)
│           ├── /chat -> HomeScreen (with AppDrawer & ConfirmationDrawer)
│           ├── /campaigns -> CampaignsListScreen
│           ├── /campaigns/:id -> CampaignDetailScreen
│           ├── /history -> HistoryListScreen
│           ├── /history/:id -> CallDetailScreen
│           └── /settings -> SecuritySettingsScreen
```

### Riverpod State Management
- `authNotifierProvider`: Manages session tokens, current user, and MFA state.
- `chatNotifierProvider`: Manages current thread messages, file uploads, and streaming responses.
- `campaignListProvider`: Paginated campaign query with cursor-based pagination.
- `callHistoryProvider`: Paginated call attempts filtered by outcome.
- `activeStreamProvider(campaignId)`: Connects to SSE endpoint and folds incoming events into state without tearing down widget trees.
