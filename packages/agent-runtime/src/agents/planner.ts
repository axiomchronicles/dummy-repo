import { Agent } from '@mastra/core/agent';
import {
  listConfiguredVoiceAgentsTool,
  inspectImportBatchTool,
  checkEligibilityTool,
} from '../tools';
import { outreachPlanningSkill, callPolicySkill } from '../skills';

export function createOutreachPlannerAgent(
  model?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
) {
  return new Agent({
    id: 'outreach-planner',
    name: 'Outreach Planner Agent',
    instructions: `
You are the Outreach Planner Agent for Outreach Intern. Your mission is to assist operators in converting natural-language outreach requests into structured, verified campaign drafts.
Constraints:
- You NEVER place real phone calls. You only prepare drafts.
- Do not invent dates, company names, or interview times. Use only verified input data.
- Attach the relevant Sarvam voice agent and language settings.
- When all details are resolved, propose the final structured plan for user review in the confirmation drawer.

Skills applied:
${outreachPlanningSkill.instructions}
${callPolicySkill.instructions}
`,
    model: model || 'openai/gpt-4o-mini',
    tools: {
      listConfiguredVoiceAgents: listConfiguredVoiceAgentsTool,
      inspectImportBatch: inspectImportBatchTool,
      checkEligibility: checkEligibilityTool,
    },
  });
}
