# Authoritative Source Register (Outreach Intern V3 Rebuild)

**Document:** `docs/rebuild/source-register.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Source Verification)  
**Lead Auditor:** Architecture Lead  

All sources listed below were directly retrieved, audited, and verified against installed repository code and npm/pub registries on 2026-10-27.

| Source URL | Owning Research Report | Access Date | Verified Version / Artifact | Key Findings & Wire Evidence |
| :--- | :--- | :--- | :--- | :--- |
| https://mastra.ai/docs | `mastra-harness.md` | 2026-10-27 | `@mastra/core@1.79.0` | Official Mastra engine and agent architecture |
| https://mastra.ai/docs/agents/overview | `mastra-harness.md` | 2026-10-27 | `@mastra/core@1.79.0` | Agent construction, context injection, prompt chaining |
| https://mastra.ai/docs/agents/tools | `mastra-harness.md` | 2026-10-27 | `@mastra/core@1.79.0` | `createTool` API with Zod/StandardSchema input & output |
| https://mastra.ai/docs/storage | `mastra-harness.md` | 2026-10-27 | `@mastra/pg@1.32.0` | PostgreSQL storage adapter for Mastra memory/runs |
| https://mastra.ai/docs/memory/overview | `mastra-harness.md` | 2026-10-27 | `@mastra/core@1.79.0` | Conversation thread memory and persistence |
| https://mastra.ai/blog/introducing-first-class-skills | `mastra-harness.md` | 2026-10-27 | Mastra Runtime Skills | First-class agent skills for domain reasoning |
| https://ai-sdk.dev/providers/openai-compatible-providers | `mastra-harness.md` | 2026-10-27 | `@ai-sdk/openai-compatible@3.0.79` | Custom OpenAI-compatible endpoint with custom baseURL |
| https://docs.sarvam.ai/voice-agents/introduction | `sarvam-provider-contract.md` | 2026-10-27 | Sarvam Voice Agents | Overview of voice agents, telephony connections |
| https://docs.sarvam.ai/voice-agents/api/instant-outbound/create | `sarvam-provider-contract.md` | 2026-10-27 | REST POST API | `POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds` |
| https://docs.sarvam.ai/voice-agents/api/instant-outbound/webhook-payload | `sarvam-provider-contract.md` | 2026-10-27 | Webhook v1 | Ingress fields: `attempt_id`, `status`, `duration`, `transcript` |
| https://docs.sarvam.ai/voice-agents/api/analytics/overview | `sarvam-provider-contract.md` | 2026-10-27 | Analytics REST API | Analytics retrieval and call records |
| https://docs.sarvam.ai/voice-agents/pricing | `sarvam-provider-contract.md` | 2026-10-27 | Pricing Matrix | Voice Agents per-minute rates; simulation ₹0 |
| https://docs.flutter.dev/app-architecture/guide | `mobile-ui-spec.md` | 2026-10-27 | Flutter 3.44.9 / Dart 3.12.2 | Official feature-first, repository-service pattern |
| https://riverpod.dev/docs/introduction/why_riverpod | `mobile-ui-spec.md` | 2026-10-27 | `flutter_riverpod@2.6.1` | StateNotifier / AsyncNotifier provider architecture |
| https://pub.dev/packages/hugeicons | `mobile-ui-spec.md` | 2026-10-27 | `hugeicons@1.2.0` | Verified HugeIcons Flutter icon package |
| https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html | `auth-security.md` | 2026-10-27 | OWASP Guidelines | Credential validation, lockout, secure session storage |
| https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html | `auth-security.md` | 2026-10-27 | OWASP MFA Guidelines | RFC 6238 TOTP, single-use hashed recovery codes |
| https://docs.bullmq.io/guide/going-to-production | `data-queues-reliability.md` | 2026-10-27 | `bullmq@5.81.5` | Production Redis settings (`noeviction`, AOF persistence) |
| https://orm.drizzle.team/docs/get-started/postgresql-new | `data-queues-reliability.md` | 2026-10-27 | `drizzle-orm@0.45.4` | Relational schema definitions and type safety |
| https://docs.docker.com/compose/how-tos/startup-order/ | `devops-testing.md` | 2026-10-27 | Docker Compose v2 | Healthcheck-conditioned service startup |
