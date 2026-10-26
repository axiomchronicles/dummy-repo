import { describe, it, expect, vi } from 'vitest';
import {
  CampaignContentPlanner,
  ModelSummaryService,
  type ModelConfiguration,
} from './models';
const config: ModelConfiguration = {
  MODEL_PROVIDER: 'sarvam',
  SARVAM_MODEL_API_KEY: 'test-model-key',
  SARVAM_MODEL_NAME: 'sarvam-105b',
  MODEL_TIMEOUT_MS: 1000,
};
const plan = {
  mode: 'live' as const,
  objective: 'Gather product feedback',
  personaPrompt: 'Ask neutral questions and respect opt-outs.',
  questions: ['How was your experience?'],
};
const content = {
  steps: [
    {
      name: 'Introduction',
      description: 'Ask permission to discuss the product.',
    },
  ],
  questions: ['What could improve?'],
};
const transcript = [
  { role: 'agent' as const, text: 'Would you like a follow-up?' },
  { role: 'user' as const, text: 'Yes. I have not selected a preferred time.' },
];
function completion(
  value: unknown,
  finish = 'stop',
  message: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      id: 'model-test-1',
      created: 1700000000,
      model: 'sarvam-105b',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          finish_reason: finish,
          message: {
            role: 'assistant',
            content: JSON.stringify(value),
            ...message,
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    { status: 200 },
  );
}
describe('official Sarvam SDK content boundary', () => {
  it('uses the actual SDK V1 request/auth/strict JSON schema through injected fetch', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion(content));
    const result = await new CampaignContentPlanner(config, transport).propose(
      plan,
    );
    expect(result).toEqual({
      ...content,
      source: 'sarvam',
      model: 'sarvam-105b',
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe('https://api.sarvam.ai/v1/chat/completions');
    expect(options?.method).toBe('POST');
    expect(new Headers(options?.headers).get('api-subscription-key')).toBe(
      'test-model-key',
    );
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      model: 'sarvam-105b',
      temperature: 0.2,
      max_tokens: 2048,
      n: 1,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'outreach_plan_content',
          strict: true,
          schema: {
            additionalProperties: false,
            required: ['steps', 'questions'],
          },
        },
      },
    });
    expect(JSON.parse(body.messages[1].content)).toEqual({
      objective: plan.objective,
      personaPrompt: plan.personaPrompt,
      questions: plan.questions,
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it('keeps all simulation and local-provider planning/summary free even when credentials exist', async () => {
    const transport = vi.fn<typeof fetch>();
    const simulated = await new CampaignContentPlanner(
      config,
      transport,
    ).propose({ ...plan, mode: 'simulation' });
    expect(simulated.source).toBe('local');
    expect(
      (
        await new CampaignContentPlanner(
          { ...config, MODEL_PROVIDER: 'local' },
          transport,
        ).propose(plan)
      ).source,
    ).toBe('local');
    expect(
      await new ModelSummaryService(config, transport).summarize({
        mode: 'simulation',
        outcome: 'connected',
        transcript,
        localSummary: 'SIMULATION: Local summary.',
      }),
    ).toMatchObject({
      summarySource: 'local',
      summary: 'SIMULATION: Local summary.',
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it('never sends a nonconnected or missing transcript for model summarization', async () => {
    const transport = vi.fn<typeof fetch>();
    for (const input of [
      { outcome: 'no_answer' as const, transcript },
      { outcome: 'connected' as const, transcript: null },
    ])
      expect(
        (
          await new ModelSummaryService(config, transport).summarize({
            mode: 'live',
            localSummary: 'No fabricated conversation.',
            ...input,
          })
        ).summarySource,
      ).toBe('local');
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    'malformed',
    'length',
    'refusal',
    'tool',
    'empty',
    'unknown_fields',
  ] as const)(
    'rejects %s model output without authorizing policy changes',
    async (kind) => {
      const response =
        kind === 'malformed'
          ? completion(content, 'stop', { content: 'not JSON' })
          : kind === 'length'
            ? completion(content, 'length')
            : kind === 'refusal'
              ? completion(content, 'stop', { refusal: 'Unable' })
              : kind === 'tool'
                ? completion(content, 'tool_calls', {
                    tool_calls: [
                      {
                        id: 'x',
                        type: 'function',
                        function: { name: 'launch', arguments: '{}' },
                      },
                    ],
                  })
                : kind === 'empty'
                  ? completion(content, 'stop', { content: null })
                  : completion({ ...content, policy: { authorized: true } });
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        new CampaignContentPlanner(config, transport).propose(plan),
      ).rejects.toMatchObject({ code: 'MODEL_OUTPUT_INVALID' });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each([429, 500])('disables SDK retries on HTTP%s', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'private vendor body' } }),
          { status },
        ),
      );
    await expect(
      new CampaignContentPlanner(config, transport).propose(plan),
    ).rejects.toMatchObject({
      code: status === 429 ? 'MODEL_RATE_LIMITED' : 'MODEL_REQUEST_FAILED',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('maps transport timeout without retry or secret/transcript logs', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new DOMException('private transcript and test-model-key', 'AbortError'),
      );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}),
      error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        new CampaignContentPlanner(config, transport).propose(plan),
      ).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
  it('fails missing model credentials without network', async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      new CampaignContentPlanner(
        { ...config, SARVAM_MODEL_API_KEY: undefined },
        transport,
      ).propose(plan),
    ).rejects.toMatchObject({ code: 'MODEL_CONFIGURATION_MISSING' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('returns only summary and explicit SDK provenance, leaving answers to authoritative provider data', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      completion({
        summary:
          'The caller requested a follow-up; preferred time remains unknown.',
      }),
    );
    const result = await new ModelSummaryService(config, transport).summarize({
      mode: 'live',
      outcome: 'connected',
      transcript,
      localSummary: 'Local known summary.',
    });
    expect(result).toEqual({
      summary:
        'The caller requested a follow-up; preferred time remains unknown.',
      summarySource: 'sarvam-sdk',
      summaryModel: 'sarvam-105b',
      summaryFailureCode: null,
    });
    expect(result).not.toHaveProperty('extractedFields');
    expect(result).not.toHaveProperty('transcript');
    const body = JSON.parse(transport.mock.calls[0]![1]?.body as string);
    expect(JSON.parse(body.messages[1].content)).toEqual({ transcript });
  });
  it('retains truthful local summary on SDK failure without inventing extracted fields', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        completion({ summary: 'Unsafe', extractedFields: { consent: true } }),
      );
    const result = await new ModelSummaryService(config, transport).summarize({
      mode: 'live',
      outcome: 'connected',
      transcript,
      localSummary: 'Known local summary.',
    });
    expect(result).toEqual({
      summary: 'Known local summary.',
      summarySource: 'local',
      summaryModel: null,
      summaryFailureCode: 'MODEL_OUTPUT_INVALID',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
