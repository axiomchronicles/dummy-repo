import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  CampaignPlanSchema,
  type CampaignPlan,
  type CampaignPolicy,
  type Mode,
} from '@outreach/contracts';

export interface ModelConfig {
  provider: 'local' | 'openai' | 'openai-compatible' | 'anthropic';
  baseURL?: string;
  apiKey?: string;
  modelId?: string;
  timeoutMs?: number;
}

export function createConfiguredModel(config: ModelConfig) {
  if (config.provider === 'anthropic') {
    const anthropicKey =
      config.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENAI_COMPATIBLE_API_KEY;
    const anthropicBaseURL =
      config.baseURL ||
      process.env.ANTHROPIC_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.anthropic.com/v1';
    const anthropicModelId =
      config.modelId ||
      process.env.ANTHROPIC_MODEL ||
      process.env.OPENAI_MODEL ||
      'claude-3-5-haiku-20241022';
    if (anthropicKey) {
      const customProvider = createOpenAICompatible({
        name: 'anthropic-compatible',
        baseURL: anthropicBaseURL,
        apiKey: anthropicKey,
      });
      return customProvider(anthropicModelId);
    }
    return null;
  }

  const apiKey =
    config.apiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY;
  const baseURL =
    config.baseURL ||
    process.env.OPENAI_BASE_URL ||
    process.env.OPENAI_COMPATIBLE_BASE_URL ||
    'https://api.openai.com/v1';
  const modelId =
    config.modelId ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_COMPATIBLE_MODEL_ID ||
    'gpt-4o-mini';

  if (
    (config.provider === 'openai' || config.provider === 'openai-compatible') &&
    apiKey
  ) {
    const customProvider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL,
      apiKey,
    });
    return customProvider(modelId);
  }
  return null;
}

export class DeterministicLocalPlanner {
  planOutreach(params: {
    instruction: string;
    mode: Mode;
    agentId: string;
    agentVersionId: string;
    eligibleCount: number;
    exclusions: { reason: string; count: number }[];
    policy: CampaignPolicy;
  }): CampaignPlan {
    const text = params.instruction;

    // Deterministic parsing of interview context
    const hasInterview = /interview/i.test(text);
    const hasAttendance = /confirm|attendance|attend/i.test(text);
    const hasDocs = /document|id|resume|aadhaar/i.test(text);

    const questions: string[] = [];
    if (hasAttendance)
      questions.push('Will you be able to attend this scheduled interview?');
    if (hasDocs)
      questions.push(
        'Can you bring the required government photo ID and resume?',
      );
    if (questions.length === 0)
      questions.push('Can you confirm receipt of this outreach notification?');

    const steps = [
      {
        name: 'Greeting & Verification',
        description: 'Confirm identity of the contact politely',
      },
      {
        name: 'Core Announcement',
        description: hasInterview
          ? 'Deliver interview schedule details and employer information'
          : 'Deliver key campaign notification details',
      },
      {
        name: 'Attendance Inquiry',
        description: 'Ask confirmation questions and record response',
      },
      {
        name: 'Closing & Next Steps',
        description: 'Reiterate required items and close call professionally',
      },
    ];

    const estimatedTotalMinor =
      params.mode === 'simulation'
        ? 0
        : params.eligibleCount *
          (params.policy.estimatedCostPerCallMinor || 500);

    return CampaignPlanSchema.parse({
      version: 1,
      planner: 'deterministic-local',
      model: null,
      mode: params.mode,
      objective: params.instruction.slice(0, 300),
      agentId: params.agentId,
      agentVersionId: params.agentVersionId,
      eligibleCount: params.eligibleCount,
      excludedCount: params.exclusions.reduce(
        (sum, item) => sum + item.count,
        0,
      ),
      exclusions: params.exclusions,
      steps,
      questions,
      policy: params.policy,
      cost: {
        currency: 'INR',
        estimatedTotalMinor,
        isEstimate: params.mode === 'live',
        assumptions:
          params.mode === 'simulation'
            ? [
                'Deterministic simulation: no paid provider calls and zero billed usage',
              ]
            : [
                'Configured per-call reservation estimate; actual duration and telephony tariffs may differ',
              ],
      },
      createdAt: new Date().toISOString(),
    });
  }

  analyzeTranscript(params: {
    transcript: { role: string; text: string; en_text?: string }[];
  }): {
    summary: string;
    disposition:
      | 'confirmed'
      | 'declined'
      | 'reschedule_requested'
      | 'wrong_number'
      | 'unknown';
    attendanceConfirmed: boolean;
    followUpRequired: boolean;
    confidence: number;
  } {
    const allUserSpeech = params.transcript
      .filter((t) => t.role === 'user')
      .map((t) => t.text)
      .join(' ')
      .toLowerCase();

    let disposition:
      | 'confirmed'
      | 'declined'
      | 'reschedule_requested'
      | 'wrong_number'
      | 'unknown' = 'unknown';
    let attendanceConfirmed = false;
    let followUpRequired = false;
    const confidence = 0.85;

    if (
      /haan|yes|definitely|sure|zaroor|aunga|attend|confirm/i.test(
        allUserSpeech,
      )
    ) {
      disposition = 'confirmed';
      attendanceConfirmed = true;
    } else if (/nahi|no|cannot|unable|busy|decline/i.test(allUserSpeech)) {
      disposition = 'declined';
    } else if (/reschedule|later|another time|dusre din/i.test(allUserSpeech)) {
      disposition = 'reschedule_requested';
      followUpRequired = true;
    } else if (/wrong number|galat number|wrong person/i.test(allUserSpeech)) {
      disposition = 'wrong_number';
    }

    const summary =
      params.transcript.length > 0
        ? `Outreach call completed with ${params.transcript.length} turns. User indicated: ${disposition}.`
        : 'Call terminated without turns.';

    return {
      summary,
      disposition,
      attendanceConfirmed,
      followUpRequired,
      confidence,
    };
  }
}
