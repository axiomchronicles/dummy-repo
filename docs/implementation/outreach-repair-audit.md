# Outreach repair audit — 2026-10-27

Clean starting git tree at c7d0672. Baseline TypeScript check and 72 unit tests pass. Integration suite started against the existing Docker services. No secrets inspected beyond key presence.

## Observed execution map

Flutter home → ChatNotifier POST SSE → Nest ChatController → ChatService → direct fetch to OpenAI-compatible completions. This bypasses the separate Mastra tools entirely. An LLM JSON fence triggers a second, independent SQL campaign constructor. It chooses the latest import, inserts every valid import contact as queued, forces simulation, and stores an incomplete plan. CampaignsService.launch parses the strict complete CampaignPlanSchema, so this draft cannot launch. Flutter catches the error in a snackbar; changing the local mode doesn't persist it. Stream exceptions resubmit the prompt, duplicating side effects.

Canonical existing path: CampaignsService → PostgreSQL campaign + campaign_contacts → transactional outbox → BullMQ worker → MockVoiceProvider (simulation) or SarvamVoiceProvider (instant outbound REST) → durable webhook inbox → reconciliation → call_attempts/analyses/events → authenticated polling/SSE → monitor. Attempt acceptance is separate from connection; unknown acceptance is deliberately never automatically redialed. Browser SDK isn't used for PSTN.

Web operations UI lives in apps/web; current dev:web/build commands instead run apps/admin, a separate administrative console. The web operations UI has no chat route. Mobile screenshot source is Flutter. Both surfaces must share backend plans/launches.

Existing schema: workspaces/memberships/sessions; immutable agent_versions; imports/import_rows → contacts/consent_records/suppressions; campaigns → campaign_contacts → call_attempts → analyses/attempt_events; outbox/webhook inbox/campaign_events/audit_log/reports. Consent evidence lacks scope. Recording retrieval is absent. Local agent personas are not proof of a deployed provider version/voice.

Stack: npm workspaces, strict TS 5.9, Nest/Express, Drizzle/Postgres, BullMQ/Redis, React 19/Vite/Tailwind/Radix, Flutter/Riverpod/http. Existing libphonenumber-js and Zod reused. Unit Vitest, API integration Vitest, browser Playwright. Existing red accent and dark surfaces retained with simpler conversation layout.

Repair: one typed authorized tool registry and bounded streaming loop; exact workspace-scoped contact resolution; single-target durable plans through CampaignsService; snapshot-bound idempotent launches; explicit live blockers; shared incremental SSE decoder; durable artifact retrieval and truthful processing; operational web chat and mobile drawer repair. No automatic real calls during verification.
