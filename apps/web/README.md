# Operations web application

React19/Vite8 with Tailwind4.3.3 and actual shadcn/ui registry components. TanStack Query owns remote state; React Hook Form uses shared Zod contracts for validated forms. The interface uses a neutral white canvas, compact black navigation, open tables and lists, restrained separators and keyboard-visible focus. No analytics library or remotely loaded font is included.

`src/components/shadcn/` contains source copied directly from the official new-york-v4 registry. `provenance.json` records authoritative URLs, upstream paths, access date and source hashes; modifications are limited to local import paths and repository formatting. Product helpers in `src/components/ui.tsx` compose those genuine primitives. `components.json` documents the neutral theme, aliases and registry setup. See `docs/research/shadcn-theme.md` and `ui-reference-audit.md` for audited official docs and Linear/Geist design references.

Root workspace scripts own dependency installation, typecheck/build and Docker execution. Vite listens on0.0.0.0:5173 and proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:3000`). The Tailwind Vite plugin and `@` alias are configured in `vite.config.ts`; root TypeScript maps the same alias. Production static serving uses the root same-origin proxy. Provider secrets remain server-side.

Routes:

- `/`: persisted counts, an open recent campaign table and activity column.
- `/campaigns`: actual Radix Select status/mode filters and paginated campaigns.
- `/campaigns/new`: objective → contact import → versioned persona → policy → review. Saving/planning places no calls.
- `/campaigns/:id`: confirmed launch, real progress, outcomes/activity Tabs, persisted SSE/replay, reviewed plan and report requests.
- `/contacts`: CSV/XLSX upload, exact-header mapping, synthetic sample, row corrections/revalidation and durable opt-out.
- `/agents`: five editable personas in horizontal information rows, immutable version history and synthetic sandbox.
- `/calls/:id`: actual attempt facts, analysis provenance, recorded answers and authorized transcript when present.
- `/reports`: asynchronous CSV/XLSX generation/status and authenticated downloads.
- `/activity`: persisted workspace activity; campaign detail provides SSE.
- `/integrations`: sanitized calling/model configuration and actual provider capabilities.
- `/settings`: persisted workspace profile/timezone/source-region preference.
- `/audit`: recorded actions and timestamps.

NativeSelect is the official shadcn component for browser-native RHF mapping/wizard forms. Operational filters use Radix Select. Buttons, inputs, textarea, badges, tables, tabs, dropdown menu, separator, labels and skeletons use authentic shadcn source. Confirmations and editors use Radix Dialog with accessible title/description, Escape, focus containment and explicit opener restoration for conditionally mounted dialogs. Mobile navigation uses Radix Sheet named Navigation with a real trigger and automatic focus handling. Narrow tables scroll within their container; reduced-motion preferences disable decorative animation.

Unauthenticated entry uses a clearly development-only `/auth/demo` identity; production configuration disallows it. HttpOnly session cookies are server controlled. CSV header preview is advisory; authoritative parsing and mapping validation happen on the worker, including XLSX headers. Files are bounded to5MB; rows and columns are server bounded. Synthetic CSV includes connected, no-answer, busy and failed scenarios plus duplicate, invalid and unconsented rows. Its fictional destinations and synthetic metadata are blocked from live execution.

Entity badges show persisted SIMULATION or LIVE mode. Global header/sidebar badges read SIMULATION DEFAULT. A saved LIVE plan remains separate from launch. Simulation plans and summaries always use deterministic local execution. Configured live plans/summaries may use Sarvam SDK; the UI derives provenance from actual returned planner/summary fields. Configuration presence is not provider-connectivity verification. Missing answers remain Unknown; missing transcript/analysis stays unavailable.

SSE stores the last cursor in sessionStorage per campaign, deduplicates IDs and reloads persisted JSON history. EventSource reconnect status remains visible; Query invalidation and authoritative polling recover state while a stream is unavailable. Browser streamed history is bounded to100 events, and JSON history is paginated. No browser timers invent progress. Pause/cancel wording preserves active-attempt semantics when provider termination is unavailable.

Currency controls display rupees; RHF Controller converts to integer minor units at the API boundary. Plan review distinguishes eligible unique contacts from excluded import rows. Duplicate/invalid rows are excluded before unique contacts are queued, so plan exclusion and execution totals use different units.

Redesign verification on 2026-10-24: whole-repository TypeScript, targeted frontend ESLint and Vite production build passed. The updated Chromium browser suite passed all three cases against the redesigned Compose image in 38.3 seconds: full campaign/import-correction/SSE/inspection/CSV+XLSX flow and unconfigured LIVE review without launch; mobile Sheet/Dialog keyboard focus and reduced motion; mapped XLSX import. The suite retained assertions for zero external-origin requests and no automatic live launch. Browser tests remain under `tests/e2e/workflow.spec.ts`; screenshots and downloaded synthetic reports are generated under ignored `test-results/`.

After asynchronous correction, the final import revision invalidates row, contact and import-list queries. The effect observes status and updatedAt, so revalidation ending at the same needs_correction state still refreshes corrected rows. An accepted revalidation request is not treated as completed validation.
