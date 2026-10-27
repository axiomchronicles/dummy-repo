# Outreach Intern V3 — Mastra Harness, Skills, Workflows, Schedules and Storage Research

**Document:** `docs/rebuild/research/mastra-harness.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent B)  
**Author:** AI Agent Harness & Runtime Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Mastra Framework Architecture & Version Baseline

Official documentation verified:
- Mastra Documentation: https://mastra.ai/docs
- Mastra Agents: https://mastra.ai/docs/agents/overview
- Mastra Tools: https://mastra.ai/docs/agents/tools
- Mastra Storage: https://mastra.ai/docs/storage
- Mastra Memory: https://mastra.ai/docs/memory/overview
- Mastra Agent Skills: https://mastra.ai/blog/introducing-first-class-skills
- AI SDK OpenAI-Compatible Providers: https://ai-sdk.dev/providers/openai-compatible-providers

### Verified Package Ecosystem
- `@mastra/core`: **1.79.0** (verified in npm registry)
- `@mastra/pg`: **1.32.0** (PostgreSQL storage adapter for Mastra memory and workflow state)
- `@ai-sdk/openai-compatible`: **3.0.79** (custom OpenAI-compatible endpoint wrapper)
- `zod`: **4.6.7** / Standard Schema spec compatibility

---

## 2. Agent Harness Topology & Ownership

Rather than a monolithic prompt with unbounded permissions, the harness is composed of 5 specialized agents with bounded scopes and trusted server-injected execution contexts.

```
                                  ┌───────────────────────────────┐
                                  │      Client Request (API)     │
                                  └──────────────┬────────────────┘
                                                 │
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │     Mastra Runtime Engine     │
                                  └───────┬───────────────┬───────┘
                                          │               │
                 ┌────────────────────────┴────┐     ┌────┴────────────────────────┐
                 ▼                             ▼     ▼                             ▼
   ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
   │   Outreach Planner Agent  │ │    Campaign Supervisor    │ │   Post-Call Analyst Agent │
   │ (Chat & Campaign Drafts)  │ │   (Monitoring & Guidance) │ │ (Transcript Turn Analysis)│
   └─────────────┬─────────────┘ └───────────────────────────┘ └─────────────┬─────────────┘
                 │                                                           │
                 ▼                                                           ▼
   ┌───────────────────────────┐                               ┌───────────────────────────┐
   │ Contact Resolution & Tool │                               │  Report & QA Workflow     │
   │  (Deterministic Normalizer│                               │ (Aggregate Validation)    │
   └───────────────────────────┘                               └───────────────────────────┘
```

### 2.1 The 5 Agent Roles

1. **Outreach Planner Agent**
   - **Role:** Interprets conversational instructions and uploaded attachments, extracts intent, maps parameters, and synthesizes a structured campaign draft.
   - **Constraints:** Cannot execute calls, confirm campaigns, modify billing, or bypass confirmation.
   - **Model Output Schema:** Strictly validated `CampaignDraftProposalSchema`.

2. **Contact Resolution & Validation Capability**
   - **Role:** Deterministic tool pipeline for parsing raw files (CSV, XLSX, TSV, TXT, vCard), mapping columns, normalizing phone numbers to E.164 (using workspace default region), detecting duplicates, and flagging row errors.
   - **LLM Boundary:** LLM is invoked only for ambiguous header mapping (e.g. mapping "Contact Cell" -> "phone"), with explicit confidence reporting.

3. **Campaign Supervisor Agent**
   - **Role:** Assists user in inquiring about running campaigns, explaining exclusion reasons, and calculating completion velocity.
   - **Constraints:** Read-only access to campaign metrics. Cannot alter policies or launch new tasks without user confirmation.

4. **Post-Call Analysis Agent**
   - **Role:** Ingests raw conversation transcript turns, classifies call outcome (e.g., `confirmed`, `declined`, `reschedule_requested`, `unreachable`), produces an executive summary, and extracts structured response variables.
   - **Constraints:** Operates under strict prompt hygiene: untrusted user speech cannot issue commands or alter campaign records. Unknown fields remain `unknown`.

5. **Report & QA Workflow**
   - **Role:** Aggregates campaign-level statistics, compares planned commitments against actual phone responses, and produces audit-ready structured metrics.

---

## 3. Mastra Tools Registry (`createTool`)

Tools are constructed using Mastra's typed `createTool` API with Zod input/output schemas:

```typescript
import { createTool } from '@mastra/core';
import { z } from 'zod';

export const parseContactRosterTool = createTool({
  id: 'parse-contact-roster',
  description: 'Parses uploaded contact file and validates telephone formats',
  inputSchema: z.object({
    importId: z.string().uuid(),
    defaultCountryCode: z.string().length(2).default('IN'),
  }),
  outputSchema: z.object({
    totalRows: z.number(),
    validRows: z.number(),
    invalidRows: z.number(),
    sampleEligible: z.array(z.object({ name: z.string(), phoneMasked: z.string() })),
  }),
  execute: async ({ context, mastra }) => {
    // Trusted execution using server-side injected workspace context
    return await resolveContactsService(context.importId, context.defaultCountryCode);
  },
});
```

### Complete Tool Inventory
- `listConfiguredVoiceAgents`: Retrieves available Sarvam agents and voice options configured in workspace.
- `inspectImportBatch`: Returns summary of uploaded contacts, headers, and detected issues.
- `validateContactRow`: Normalizes single phone number and validates parameter substitutions.
- `generateCampaignDraft`: Validates and structures draft plan for confirmation drawer.
- `checkEligibilityAndBudget`: Verifies calling window, concurrency limit, and estimate bounds.
- `getCampaignAnalytics`: Summarizes live attempt statistics for supervisor agent.

**Hard Security Boundary:** No tool is registered for `dialPhone`, `startCampaign`, `executeRawSQL`, or `accessSecrets`. Telephony dispatch is strictly a background BullMQ worker responsibility gated by confirmed database state.

---

## 4. Mastra Runtime Skills

Mastra first-class agent skills are organized as version-controlled domain instruction modules attached to specific agent personas:
1. `outreach-planning`: Rules for eliciting missing interview dates, venue, and required documents.
2. `contact-import-and-resolution`: Guidelines for E.164 phone formatting and disambiguating headers.
3. `call-policy-and-disclosure`: Mandates AI identity disclosure ("This is an automated call from...") and opt-out recognition.
4. `sarvam-agent-configuration`: Provider configuration constraints (Hindi/English languages, TTS voices).
5. `post-call-analysis`: Rules for objective disposition categorization without hallucination.
6. `failure-recovery`: Recovery heuristics for disconnected, busy, and unanswered attempts.

---

## 5. Model Configuration & Local Simulation Fallback

### 5.1 Configurable OpenAI-Compatible Provider
The backend supports arbitrary OpenAI-compatible endpoints configured via environment or admin console:
- `OPENAI_COMPATIBLE_BASE_URL`: (e.g. `https://api.groq.com/openai/v1`, `https://api.together.xyz/v1`, or local `http://ollama:11434/v1`)
- `OPENAI_COMPATIBLE_API_KEY`: Server-side secret (redacted in admin logs and responses).
- `OPENAI_COMPATIBLE_MODEL_ID`: Configured model identifier (e.g. `llama-3.3-70b`, `gpt-4o-mini`).

Integration uses `@ai-sdk/openai-compatible`:
```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function createModelProvider(config: ModelConfig) {
  if (config.provider === 'mock' || !config.apiKey) {
    return new DeterministicLocalPlanner();
  }
  return createOpenAICompatible({
    name: 'custom-llm',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.customHeaders,
  })(config.modelId);
}
```

### 5.2 Deterministic Local Planner (Zero-Key Simulation)
When running locally without paid API keys (`MODEL_PROVIDER=local` or `VOICE_PROVIDER=mock`), the harness utilizes a deterministic rule-based planner:
- Inspects input text with regex heuristics for dates, times, and venue keywords.
- Maps contacts deterministically.
- Generates fully schema-compliant `CampaignPlan` objects labeled with `planner: "deterministic-local"` and `model: null`.
- Ensures 100% of local integration tests and Docker Compose workflows execute cleanly without external network access or billing.

---

## 6. Storage & Observability

- **PostgreSQL Storage Adapter**: `@mastra/pg` is initialized pointing to the application database using an isolated schema (`mastra_system`) to ensure application Drizzle domain tables remain the authoritative source of truth.
- **Run Correlation**: Every agent execution generates a unique `mastraRunId` persisted in `chat_messages.metadata`, `campaigns.plan.mastraRunId`, and `analyses.mastra_run_id`.
- **Secret Redaction**: Mastra tracing and logger wrappers intercept all payload outputs and redact phone numbers (`+91 ••••• ••793`), bearer tokens, and API credentials.
