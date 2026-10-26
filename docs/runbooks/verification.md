# Verification evidence

Execution date: 2026-10-24. Host: macOS arm64, Node 26.3.1, npm 11.16.0. Compose containers: Linux arm64, Node 24.13.0. Results below describe commands that actually ran.

## Initial integration evidence

Normal installation, root lint/typecheck/build and npm audit passed. Unit suite: 43 tests across 5 files. `docker compose up --build -d` built and started all five healthy services. Initial composed workflow suite: 9 tests passed in 13.76 seconds, covering all mock outcomes, launch idempotency, SSE replay, reports, tenant isolation, opt-out, transactional rollback and inbox deduplication.

Resolved findings: resolver 6 optional peer conflict by selecting verified 5.2.2; Vite root entry by explicit web root; occupied ports by configurable 5442/6389 without touching unrelated containers. Fractional duration and private provider-version snapshots were corrected before final acceptance. Killed-worker recovery exposed a stale BullMQ active lock delay; safe mock recovery uses the existing attempt identity while live ambiguity remains protected from redial.

## Suite boundaries

Integration tests need the compiled Compose stack and create isolated synthetic workspaces. Recovery tests restart this project's worker, API and backing services, and create/remove only a named test worker. Do not run browser acceptance concurrently. Clean migration tests create a temporary named database, migrate twice and drop only that database in cleanup. Playwright exercises role/label-based UI actions, row correction, plan/confirmation, refresh, call detail and CSV/XLSX downloads, with mobile keyboard checks and screenshots.

No Sarvam HTTP request was performed. Mock tests prove no network transport; mocked Sarvam tests verify official request/response/callback and uncertain no-retry behavior. Production demo configuration is rejected. Targeted dependency overrides remove advisories without forced downgrades. OpenAPI is generated from the operation catalog/shared Zod, with separate binary/SSE media types.

## Final acceptance results

| Command                      | Actual result                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| npm ci / normal npm install  | Passed on host and Docker build; lockfile installed without force/legacy peer bypass |
| npm run format:check         | Passed after final documentation formatting                                          |
| npm run lint                 | Passed                                                                               |
| npm run typecheck            | Passed, including API, worker, web, packages, tests and smoke script                 |
| npm test                     | 44 passed, 5 files; final run807ms                                                   |
| npm run build                | Passed: API/worker/migration/seed bundles and Vite web                               |
| docker compose up --build -d | Passed; five healthy services, migration exits0                                      |
| npm run test:integration     | 28 passed, 5 files,83.39s                                                            |
| npm run test:e2e             | 3 passed,15.4s                                                                       |
| npm run test:compose-smoke   | Passed from fresh isolated volumes through four mock outcomes and XLSX download      |
| npm run docs:api             | Passed; generated from shared Zod operation catalog                                  |
| npm audit                    | Zero vulnerabilities                                                                 |
| git diff --check             | Passed; all changes remain uncommitted                                               |

Total automated test cases:75 (44unit+28integration+3browser). Clean Compose smoke is an additional standalone acceptance command. No paid provider invocation or real phone call occurred. Live financial fixtures are isolated synthetic test tenants using normalized callbacks without HTTP; they are not real calls or default demo usage.

The browser full flow covers editable personas, CSV normalization/duplicate/invalid/consent feedback, row correction, rupee-to-minor-unit conversion, zero attempts before confirmation, all four queued mock outcomes, SSE refresh/replay, actual call inspection and CSV/XLSX download accuracy. It also opens an unconfigured LIVE review without launching and verifies actual LIVE labels versus SIMULATION DEFAULT. Other cases exercise mobile navigation, reduced motion, dialog focus/Escape restoration and XLSX header mapping/upload. Browser recorded zero runtime errors and zero external-origin requests.

Integration covers auth/tenant/viewer boundaries, immutable versions, strict validation, forged webhook denial, outbox rollback/inbox deduplication, concurrent launch/report commands, two worker processes, pause/resume/cancel, actual worker SIGKILL recovery, Redis/PostgreSQL restart, clean migrations applied twice, fractional/unknown cost, retention and report regeneration without redial. Active-SSE API restart now completes in358ms through normal SIGTERM(exit143), preserves all four unique terminal outcomes and cursor replay. The original30-second SIGKILL defect was fixed with BeforeApplicationShutdown stream cleanup.

Initial failures were corrected and rerun: dependency optional peers; Vite root path; stable Drizzle foreign-key ordering; stale mock job locks after worker kill; test error-code assertion; dialog focus restoration; active-SSE shutdown. Final commands above passed. Vite reports one nonfatal large chunk warning (about512KiB raw/154KiB gzip); route splitting is deferred rather than hiding the warning.

Final artifacts are under test-results and intentionally ignored by Git: desktop overview/import/plan/outcomes/call/report screenshots, accepted CSV/XLSX downloads, mobile dialog/focus screenshots, and desktop-live-review-no-launch.png. All five services were left healthy. Temporary smoke projects/volumes, second workers and migration databases were cleaned up without changing the normal development volumes. No remote, commit, push or deployment action occurred.

## Current Sarvam SDK and shadcn revision

Verified 2026-10-24 after the explicit SDK/Tailwind/shadcn request. Prior results above describe the initial implementation; the current suite supersedes its counts.

| Command                      | Current actual result                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| npm test                     | 65 tests passed across 7 files; final root run710ms                       |
| npm run test:integration     | 28 passed across5 files,89.17s                                            |
| npm run test:e2e             | 3 passed,38.3s after correction cache fix                                 |
| npm run typecheck / lint     | Passed on updated source                                                  |
| docker compose up --build -d | Built updated SDK/frontend image, applied migration0004, started services |
| cached web rebuild           | Passed; current shadcn/row-cache revision served                          |
| npm audit                    | Zero vulnerabilities                                                      |
| npm run docs:api             | Regenerated current shared schemas                                        |

Total current automated cases96. Official sarvamai1.1.12 is exercised using mocked fetch only: request/auth/strict JSON, refusal/invalid output, timeout, no retry and no simulation SDK call. API planning rechecks snapshot before a short write transaction; model output has no policy/ID/launch authority. Summary provenance is persisted while transcript/extracted fields remain unchanged. Five generated migrations now define the22-table schema with processing leases.

The official published SDK lacks outbound PSTN methods; the verified Voice Agents HTTP adapter is intentionally retained. Actual model SDK use is opt-in for LIVE plans and connected LIVE summaries; MODEL_PROVIDER=local and all simulation stay free/local. No real model or telephone request occurred.

Frontend uses genuine official shadcn source with provenance, Tailwind4 neutral tokens, open table/list sections and horizontal personas. Visual previews were reviewed on desktop/mobile. Latest browser run passes corrected row refresh, all four terminal mock outcomes, plan-without-attempts, explicit launch, persisted replay after refresh, actual call inspection, CSV/XLSX downloads, unconfigured LIVE review without launch, Radix Dialog/Sheet focus/Escape and XLSX mapping. The first run found a stale correction-row cache; final revision status+updatedAt invalidation fixed it without weakening assertions.

Current Vite build passes with a nonfatal chunk warning (~675KiB JavaScript/206KiB gzip; CSS68.5KiB). No remote fonts/analytics are introduced. Screenshot artifacts: test-results/workflow-reviewed-campaign-fea14-inspection-and-both-reports-chromium (overview/import/plan/outcomes/inspector/reports/activity/live-review) and sibling mobile screenshots. Read-only redesign previews are /tmp/outreach-shadcn-overview.png, campaign.png, agents.png and mobile navigation/agents/sign-in. Allfive services left healthy; no commits/push/deploy.
