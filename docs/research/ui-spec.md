# Frontend audit and operational UI specification

Research accessed 2026-10-24. The workspace contains no existing frontend, package manager, styling, or screenshots to preserve. Neither original product document was present; current user requirements are authoritative. This report defines implementation acceptance rather than claiming any screen already exists.

## Verified stack

| Package               | Registry version inspected | Compatibility                                                                |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| react / react-dom     | 19.3.1 / 19.3.1            | react-dom peer React ^19.3.1                                                 |
| vite                  | 8.3.5                      | Node ^20.19.0 or >=22.12.0; guide page labels 8.3.4, registry patch is 8.3.5 |
| @vitejs/plugin-react  | 6.1.2                      | Vite ^8.0.0; optional compiler peers must remain optional                    |
| @tanstack/react-query | 5.104.5                    | React and @types/react ^18 or ^19                                            |
| react-hook-form       | 7.90.0                     | React ^16.8, ^17, ^18, or ^19; Node >=18                                     |
| @hookform/resolvers   | 6.0.0                      | RHF ^7.55.0; Zod ^3.25.0 or ^4.0.0; other validator peers are optional       |
| zod                   | 4.6.7                      | Resolver supports Zod 4; server remains final authority                      |

Use Node 24 and the lead-selected TypeScript 5.9.3 to avoid unnecessary TypeScript 7 peer compatibility changes. Registry metadata is evidence for exact versions, not proof every library behavior is compatible; typecheck/build verifies the integrated combination. React state holds transient UI state; TanStack Query owns fetched state and mutation invalidation. React Hook Form uses zodResolver against shared Zod schemas, with z.input/z.output generics if schemas transform inputs. No client-generated progress, duplicated campaign reducer, or fake analytics. Forms retain server errors and focus the first invalid field.

Use a small native CSS design system rather than installing Tailwind/shadcn or React Flow just for the demo. These are optional suggestions in the prompt, and no workflow graph execution requirement exists. A readable persisted execution timeline explains state more clearly. If introduced later, their current installation docs must be researched first.

## Information architecture and visual direction

A light, restrained operations workspace: dark ink typography, warm neutral canvas, thin dividers, one emerald accent, compact navigation, generous content widths, readable tables, and a persistent amber SIMULATION badge or red LIVE badge. Distinguish state with text/icons as well as color. Do not scatter identical metric cards. Overview starts with a short readiness strip, a campaign table, an activity feed and one meaningful next action. All counts come from the API and exclude live/simulation mixing.

| Route          | Primary content and interactions                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| /signin        | Product purpose; explicit development-only demo entry; API-backed identity; production cannot expose bypass                       |
| /              | Workspace readiness, real campaign totals, recent campaign table, recent events, first-run action                                 |
| /campaigns     | Search/status/mode filters, stable paginated table, objective/persona/status/eligible/completed columns                           |
| /campaigns/new | Guided objective → contacts → agent → schedule/policy → schema-validated plan and review                                          |
| /campaigns/:id | Persistent mode, state, real progress, plan, dispatch/pause/resume/cancel controls, event stream, contact outcomes                |
| /contacts      | Import source/sample CSV/XLSX, column mapping, validation and correction, consent/suppression                                     |
| /agents        | Five editable personas, version detail, objective/instructions/voice configuration; synthetic sandbox explicitly labeled          |
| /activity      | Campaign-filtered persisted timeline and reconnect/replay status                                                                  |
| /calls/:id     | Authorized attempt timeline, normalized connection result, actual analysis and optional transcript; missing answers shown Unknown |
| /reports       | Campaign/format/status filters, asynchronous generation and authorized downloads                                                  |
| /integrations  | Mock provider selected by default; Sarvam configured/disabled readiness without credentials; local planner label                  |
| /settings      | Workspace/timezone/retention and identity, enabled capabilities; secrets absent                                                   |
| /audit         | Real persisted launch/pause/resume/cancel/consent/export events with actor/time                                                   |

Related screens may share a route layout in the first slice if all required capabilities are discoverable. The route guide must be synchronized to actual routes at integration.

## Wizard, import, launch and inspector

1. Objective and campaign name use visible labels and shared schema limits. Select an existing import or upload a bounded file. Sample contacts are synthetic and cannot be dialed in live mode.
2. Mapping preview shows header/sample values, explicit name/phone/region/consent/outcome mappings, and preserves row numbers. An E.164 value can stand alone; local numbers require source region. Validation displays accepted/duplicate/invalid/suppressed/ineligible counts and row reasons. Corrections return to authoritative validation rather than changing counters locally. CSV and XLSX are supported; do not claim a file was validated while a job is still queued.
3. Select a saved persona version; editing the persona creates a new version, leaving existing campaigns pinned. Sandbox produces explicitly synthetic results and no network call.
4. Review timezone/calling window/concurrency/budget/consent. Plan is deterministic local when no model is configured; label this plainly. Saving or planning never dispatches calls.
5. Separate Save, Plan, Simulate and Live launch controls. Simulation requires deliberate action. Live launch opens a keyboard-accessible confirmation showing eligible/excluded counts, reason groups, window/timezone, destination allowlist, budget cap and verified cost assumptions. Unknown pricing is Unknown, not a made-up estimate. Confirm submits an idempotency key and an explicit confirmation field; Enter in any preceding form cannot launch.
6. Contact inspector uses persisted attempt records. Connected does not equal a business success; no answer and busy are distinct. Transcript is visible only if stored and authorized. Extracted answers remain null/Unknown when absent. Pause says new dispatches stopped; cancel does not imply active calls terminated if adapter lacks verified support.

## Remote state, events and accessibility

Use same-origin API routing and HttpOnly session cookies. Query keys include workspace and entity identifiers; logout clears cached sensitive data. Disable automatic retries for authorization/validation mutations. Refetch campaign data after persisted events and action success; never optimistically promise a call stopped. SSE uses event IDs, bounded timeline retention in browser, a persisted cursor, and reconnect/replay status. Refresh resumes from cursor. Replayed events deduplicate by ID. On disconnect show Reconnecting and keep existing data; a connection error is not a terminal campaign failure.

Every page has a skeleton/loading label, actionable empty state, inline validation, retryable connection error, and terminal failure where appropriate. Buttons expose pending labels and prevent duplicate submissions while preserving server idempotency. Semantic tables include headings and readable horizontal scroll on narrow screens. Navigation collapses to an accessible drawer below ~800px. Detail/inspector layout becomes one column; controls wrap and retain touch targets. Keyboard focus is visible; dialog focus is contained and restored, Escape closes, and background is inert. Native dialog is preferred if implemented correctly. Respect prefers-reduced-motion; avoid decorative motion. Event announcements use restrained aria-live=polite rather than announcing every queue tick. No analytics dependency receives numbers, transcripts, prompts or tokens.

## Sources and evidence

All pages accessed 2026-10-24. Official package metadata: https://registry.npmjs.org/react , https://registry.npmjs.org/react-dom , https://registry.npmjs.org/vite , https://registry.npmjs.org/@vitejs%2fplugin-react , https://registry.npmjs.org/@tanstack%2freact-query , https://registry.npmjs.org/react-hook-form , https://registry.npmjs.org/@hookform%2fresolvers , https://registry.npmjs.org/zod . Versions above are published stable dist-tags inspected at access.

- React, Quick Start: https://react.dev/learn — official page React 19.3; component purity and local state patterns.
- Vite, Getting Started: https://vite.dev/guide/ — Node 20.19+/22.12+; React TS template and build tooling.
- React Hook Form, useForm: https://react-hook-form.com/docs/useform — resolver, submission validation, default values, form disabled state.
- React Hook Form Resolvers, official README: https://raw.githubusercontent.com/react-hook-form/resolvers/master/README.md — zodResolver and input/output inference, Zod 4 imports.
- TanStack Query, React Overview: https://tanstack.com/query/latest/docs/framework/react/overview and Important Defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults — site returned HTTP403; authoritative repository fallback used where retrievable: https://raw.githubusercontent.com/TanStack/query/main/docs/framework/react/overview.md and https://raw.githubusercontent.com/TanStack/query/main/docs/framework/react/guides/important-defaults.md .
- Zod: https://zod.dev/ — HTTP403 from this environment; official repository README https://raw.githubusercontent.com/colinhacks/zod/main/README.md redirects to packages/zod/README.md. This agent did not fetch the target; shared contract owner must verify Zod documentation. Resolver README and package metadata confirm supported peer versions. Shared contract behavior must have tests.
- W3C WAI APG, Dialog (Modal) Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — focus containment, Escape, initial focus and restoration.
- MDN, Using server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — id/retry fields and EventSource reconnection.

Acceptance: Playwright signs in → selects editable persona → maps imports and sees row errors → plans without attempts → simulates → receives persisted progress after refresh → inspects real results → generates/downloads CSV and XLSX; narrow viewport and keyboard dialog checks. UI labels mock/manual planner, missing answers, disconnected feed, failed jobs and blocked live prerequisites honestly.

## Integration correction

Lead actual npm install failed with ERESOLVE for resolver6.0.0 optional Effect4 peer versus TypeSchema Effect3 peer. Selected stable resolver5.2.2 instead; npm metadata verified2026-10-24 peer react-hook-form^7.55.0 and upstream release Zod4 support. Official package https://registry.npmjs.org/@hookform%2fresolvers/5.2.2 and source https://github.com/react-hook-form/resolvers/tree/v5.2.2 . No legacy-peer-deps/force bypass used. Actual installation/typecheck confirms integration.

## Implemented routes and forms

Actual route guide is apps/web/README.md. Persona/demo/campaign/settings forms use shared inferred contracts; API responses are runtime-validated on the server. Currency inputs display rupees and use the officially documented RHF Controller transform to persist integer minor units. No remote fonts, analytics or decorative canvas are required. Native modal focus/labels, hidden mobile navigation and reduced motion are verified through browser acceptance.
