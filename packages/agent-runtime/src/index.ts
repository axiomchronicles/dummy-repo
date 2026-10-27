import { Mastra } from '@mastra/core';
import { createOutreachPlannerAgent } from './agents/planner';
import { createPostCallAnalysisAgent } from './agents/analyst';
import { createCampaignSupervisorAgent } from './agents/supervisor';
import {
  DeterministicLocalPlanner,
  createConfiguredModel,
  type ModelConfig,
} from './models/provider';
export * from './tools';
export * from './skills';
export * from './models/provider';
export * from './agents/planner';
export * from './agents/analyst';
export * from './agents/supervisor';

export class MastraAgentHarness {
  private readonly mastra: Mastra;
  private readonly localPlanner: DeterministicLocalPlanner;
  private readonly model: unknown;

  constructor(private readonly config: ModelConfig = { provider: 'local' }) {
    this.localPlanner = new DeterministicLocalPlanner();
    this.model = createConfiguredModel(config);

    const plannerAgent = createOutreachPlannerAgent(this.model);
    const analystAgent = createPostCallAnalysisAgent(this.model);
    const supervisorAgent = createCampaignSupervisorAgent(this.model);

    this.mastra = new Mastra({
      agents: {
        plannerAgent,
        analystAgent,
        supervisorAgent,
      },
    });
  }

  getMastra(): Mastra {
    return this.mastra;
  }

  getPlanner() {
    return this.mastra.getAgent('plannerAgent');
  }

  getAnalyst() {
    return this.mastra.getAgent('analystAgent');
  }

  getSupervisor() {
    return this.mastra.getAgent('supervisorAgent');
  }

  getLocalPlanner(): DeterministicLocalPlanner {
    return this.localPlanner;
  }
}
