# Actual agent ownership and integration order

Empty folder, no Git/worktree mechanism initially. No commits/push/deploy authorized. Research ran via three native worker slots after Orca run-create failed no_active_sender_terminal; current user explicitly requested available fan-out, overriding skill-only Orca routing. All seven requested topics delivered/read before code.

| Actual worker              | Research topics/files                                           | Implementation exclusive ownership                                                                                                      |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| domain_stack_research      | A product-domain.md; B typescript-stack.md                      | packages/contracts/**, packages/config/**, apps/api/**                                                                                  |
| provider_data_research     | C sarvam-contract.md; D data-model.md                           | packages/database/**, packages/voice-provider/**, apps/worker/**                                                                        |
| ui_infra_security_research | E ui-spec.md; F local-development.md; G security-reliability.md | apps/web/**                                                                                                                             |
| Lead                       | requirements/synthesis/source register                          | Root workspace/build/Compose/scripts, tests/integration/**, tests/e2e/**, runbooks/final docs/integration fixes coordinated with owners |

Research gate closed2026-10-24 after all reports read. Architecture/API/queue/provider contracts and ADR001–004 are source of truth. Database owner publishes schema/exports first; contracts owner publishes shared schemas first; API/worker/web then consume agreed interfaces. Owners communicate contract changes directly and notify lead. No agent rewrites another directory without coordination. Lead installs root dependency lockfile; agents request dependency additions, no competing installs/root manifest edits. Each returns changed paths, tests/results and known gaps. Lead integrates, tests actual Compose/browser/restarts, fixes defects, then synchronizes docs with implemented behavior and exact evidence.

## Acceptance wave

After implementation the lead explicitly extended exclusive ownership: API owner tests/integration/api-security.test.ts; database/provider/worker owner tests/integration/recovery.test.ts and database.test.ts; web owner tests/e2e/workflow.spec.ts. Lead owns helpers/workflow integration, root verification/documentation and narrow coordinated download-expiry integration fix. Disruptive recovery tests run before browser acceptance. A local Git repository was initialized solely for diff review; changes remain uncommitted, no remote was configured or modified.

## Current SDK/theme revision

Native workers reused for the explicit current user update: provider owner researched actual published SDK scope and implemented models.ts/worker summary/DB provenance; API owner added config/contracts/pure content planning and retained authority checks; frontend owner integrated actual upstream shadcn components and open monochrome layouts. API/reference owner audited public visual references and updated existing browser tests for Radix behavior. Lead installed pinned dependencies, aliases, rebuilt Compose, reviewed rendered screenshots and synchronized root documentation. Phone SDK absence is recorded explicitly; SDK usage is limited to supported model APIs rather than fabricated outbound methods.
