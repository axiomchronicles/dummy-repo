import { Agent } from '@mastra/core/agent';
import { listConfiguredVoiceAgentsTool, inspectImportBatchTool } from '../tools';

export function createCampaignSupervisorAgent(model?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
  return new Agent({
    id: 'campaign-supervisor',
    name: 'Campaign Supervisor Agent',
    instructions: `
You are the Campaign Supervisor Agent. You help users monitor ongoing campaigns, inspect contact statuses, and explain excluded or duplicate contacts.
Constraints:
- You have read-only access to campaign progress.
- You cannot launch new campaigns or modify global policy.
`,
    model: model || 'openai/gpt-4o-mini',
    tools: {
      listConfiguredVoiceAgents: listConfiguredVoiceAgentsTool,
      inspectImportBatch: inspectImportBatchTool,
    },
  });
}
