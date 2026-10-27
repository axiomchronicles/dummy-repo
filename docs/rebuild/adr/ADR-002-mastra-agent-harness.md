# ADR-002: AI Agent Architecture — Mastra Agent Harness

**Status:** Accepted  
**Date:** 2026-10-27  
**Context:**  
The V2 codebase utilized direct ad-hoc calls to the `sarvamai` SDK for content planning and summarization, without formal agent decomposition, typed tool schemas, runtime skills, or configurable model provider abstraction.
V3 mandates:
"Mastra for agents, tools, skills, prompts, workflows, memory and supported schedules/background tasks... configurable OpenAI-compatible LLM through a base URL, API key and model ID... deterministic local planner/mock model path for development when no paid key exists."

**Decision:**
1. Introduce `@mastra/core` (v1.79.0) and `@mastra/pg` (v1.32.0) within `packages/agent-runtime`.
2. Construct 5 bounded agent roles: Outreach Planner Agent, Contact Resolution & Validation Agent, Campaign Supervisor Agent, Post-Call Analysis Agent, and Report/QA Workflow.
3. Expose strictly typed tools using Mastra's `createTool` API with Zod validation. Telephony execution tools (`dialPhone`) are strictly forbidden; call dispatch is handled exclusively by BullMQ workers.
4. Support arbitrary OpenAI-compatible model endpoints using `@ai-sdk/openai-compatible`.
5. Provide a deterministic offline local planner (`DeterministicLocalPlanner`) when running in simulation mode or when no paid key is provided, guaranteeing 100% CI pass rates without external billing.

**Consequences:**
- Modular, observable agent architecture with run tracing and auditability.
- Safe authorization boundary: model outputs are proposals; deterministic application policy authorizes persistence and dispatch.
