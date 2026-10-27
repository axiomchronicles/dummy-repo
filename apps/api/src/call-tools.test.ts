import { it, expect, vi, describe, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { pool } from '@outreach/database';
import {
  createCallTools,
  executeCallTool,
  toolFailure,
  simulationKey,
  redact,
  type ToolDefinition,
} from './call-tools';
import { requestedMode, targetName } from './chat';
import type { CampaignsService } from './campaigns';

const WS = '00000000-0000-4000-8000-000000000001';
const THREAD = '00000000-0000-4000-8000-000000000002';
const CAMPAIGN = '00000000-0000-4000-8000-000000000003';
const VERSION = '00000000-0000-4000-8000-000000000004';
const ATTEMPT = '00000000-0000-4000-8000-000000000005';
const PAWAN = '00000000-0000-4000-8000-0000000000a1';
const ALICE = '00000000-0000-4000-8000-0000000000a2';
const PAWAN2 = '00000000-0000-4000-8000-0000000000a3';
const identity = {
  workspaceId: WS,
  userId: '00000000-0000-4000-8000-000000000009',
  role: 'owner' as const,
  name: 'Operator',
  email: 'test@invalid.local',
};
const person = (id: string, name: string, phone: string, consent = true) => ({
  id,
  name,
  phone,
  consent,
  synthetic: false,
  suppressed: false,
  evidence_granted: consent,
  evidence_source: consent ? 'import' : null,
  evidence_scope: consent ? 'interview' : null,
  evidence_at: consent ? new Date('2026-10-01T00:00:00Z') : null,
});
type Db = {
  contacts: ReturnType<typeof person>[];
  campaign?: { mode: 'live' | 'simulation'; status: string; launch_key: null };
  members?: string[];
  version?: boolean;
  attempt?: Record<string, unknown>;
};
let db: Db;
let sql: { text: string; values: unknown[] }[];
const result = (rows: unknown[]) => ({
  rows,
  rowCount: rows.length,
  command: '',
  oid: 0,
  fields: [],
});
function route(text: string, values: unknown[] = []): unknown[] {
  if (text.includes('INSERT INTO tool_executions')) return [{ id: 'exec-1' }];
  if (text.includes('SELECT settings FROM workspaces'))
    return [{ settings: { defaultRegion: 'IN' } }];
  if (text.includes('INSERT INTO contacts')) {
    const newId = '00000000-0000-4000-8000-000000000999';
    db.contacts.push(
      person(newId, String(values[2] ?? 'Direct Contact'), String(values[1] ?? '')),
    );
    return [{ id: newId }];
  }
  if (text.includes('INSERT INTO consent_records')) return [];
  if (text.includes('SELECT id FROM imports')) return [{ id: 'import-1' }];
  if (text.includes('INSERT INTO imports')) return [{ id: 'import-1' }];
  if (text.includes('SELECT COALESCE(MAX(source_row)')) return [{ next_row: 1 }];
  if (text.includes('INSERT INTO import_rows')) return [];
  if (text.includes('SELECT import_id FROM import_rows')) return [{ import_id: 'import-1' }];
  if (text.includes('FROM contacts c LEFT JOIN LATERAL'))
    return db.contacts.filter((c) => !values[1] || c.id === values[1]);
  if (text.includes('SELECT campaign_id FROM chat_threads'))
    return [{ campaign_id: CAMPAIGN }];
  if (text.includes('SELECT mode,status,plan,launch_key FROM campaigns'))
    return db.campaign ? [{ ...db.campaign, plan: { target: null } }] : [];
  if (text.includes('SELECT mode FROM campaigns'))
    return db.campaign ? [db.campaign] : [];
  if (text.includes('SELECT contact_id FROM campaign_contacts'))
    return (db.members ?? []).map((contact_id) => ({ contact_id }));
  if (text.includes('FROM agents a JOIN agent_versions'))
    return db.version ? [{ id: VERSION }] : [];
  if (text.includes('provider_agent_bindings')) return [];
  if (text.includes('FROM call_attempts c LEFT JOIN analyses'))
    return db.attempt ? [db.attempt] : [];
  return [];
}
const draft = (contactId: string, mode: 'live' | 'simulation') => ({
  campaignId: CAMPAIGN,
  objective: 'x',
  mode,
  eligibleCount: 1,
  excludedCount: 0,
  planSnapshotHash: 'hash',
  agentName: 'Agent',
  agentLanguage: 'en-IN',
  agentVersionId: VERSION,
  target: null,
  steps: [],
  questions: [],
  estimatedCostMinor: 0,
  contactId,
});
function service() {
  return {
    prepareSingle: vi.fn(
      async (
        _: unknown,
        input: { contactId: string; mode: 'live' | 'simulation' },
      ) => draft(input.contactId, input.mode),
    ),
    launch: vi.fn(async () => ({ status: 'running' })),
    action: vi.fn(async () => ({ status: 'paused' })),
  };
}
function harness(objective: string, role: 'owner' | 'viewer' = 'owner') {
  const campaigns = service();
  const tools = createCallTools({
    identity: { ...identity, role },
    threadId: THREAD,
    objective,
    mode: requestedMode(objective),
    campaigns: campaigns as unknown as CampaignsService,
    onDraft: () => {},
  });
  const run = (name: string, args: unknown) =>
    executeCallTool(
      tools,
      name,
      args,
      { identity: { ...identity, role }, threadId: THREAD },
      async () => {},
    );
  return { tools, run, campaigns };
}
beforeEach(() => {
  sql = [];
  db = {
    contacts: [
      person(PAWAN, 'Pawan Kumar', '+919876543210'),
      person(ALICE, 'Alice', '+919876543211'),
    ],
  };
  vi.spyOn(pool, 'query').mockImplementation((async (
    text: string,
    values?: unknown[],
  ) => {
    sql.push({ text, values: values ?? [] });
    return result(route(text, values));
  }) as unknown as typeof pool.query);
});
afterEach(() => vi.restoreAllMocks());
const PROMPT =
  'Call Pawan Kumar on the supplied contact number to ask whether he will attend the CyberCube interview scheduled for 27 October 2026.';
const launchModes = (c: ReturnType<typeof service>) =>
  c.launch.mock.calls.map((call) => (call as unknown[])[4]);
describe('recipient resolution', () => {
  it('one named person resolves to one contact, never the cohort', async () => {
    expect(targetName(PROMPT, ['Pawan Kumar', 'Alice', 'Pawan'])).toBe(
      'Pawan Kumar',
    );
    const { run, campaigns } = harness(PROMPT);
    const resolved = await run('resolve_contact', { name: 'Pawan Kumar' });
    expect(resolved).toMatchObject({ result: { contactId: PAWAN } });
    await run('prepare_call_plan', { contactId: PAWAN });
    expect(campaigns.prepareSingle).toHaveBeenCalledTimes(1);
    expect(campaigns.prepareSingle.mock.calls[0]![1]).toMatchObject({
      contactId: PAWAN,
      mode: 'live',
    });
  });
  it('ambiguity is a deterministic error, never a guess', async () => {
    db.contacts.push(person(PAWAN2, 'Pawan Kumar', '+919876543212'));
    const { run, campaigns } = harness(PROMPT);
    for (let i = 0; i < 2; i++)
      expect(await run('resolve_contact', { name: 'Pawan Kumar' })).toEqual({
        error: expect.objectContaining({ code: 'CONTACT_AMBIGUOUS' }),
      });
    expect(await run('prepare_call_plan', { contactId: PAWAN })).toMatchObject({
      error: { code: 'CONTACT_NOT_RESOLVED' },
    });
    expect(campaigns.prepareSingle).not.toHaveBeenCalled();
  });
  it('rejects names absent from the request and invalid numbers', async () => {
    const { run } = harness(PROMPT);
    expect(await run('resolve_contact', { name: 'Alice' })).toMatchObject({
      error: { code: 'UNREQUESTED_RECIPIENT' },
    });
    const bad = harness('Call Pawan Kumar on 12345678901 about the interview');
    expect(
      await bad.run('resolve_contact', { name: 'Pawan Kumar' }),
    ).toMatchObject({
      error: { code: 'INVALID_PHONE', category: 'validation' },
    });
  });
  it("another contact's consent cannot satisfy the gate", async () => {
    db.contacts[0] = person(PAWAN, 'Pawan Kumar', '+919876543210', false);
    const { run } = harness(PROMPT);
    expect(await run('get_eligibility', { contactId: ALICE })).toMatchObject({
      error: { code: 'CONTACT_NOT_RESOLVED' },
    });
    await run('resolve_contact', { name: 'Pawan Kumar' });
    const own = await run('get_eligibility', { contactId: PAWAN });
    expect(own).toMatchObject({ result: { eligible: false } });
    expect(
      (own as { result: { blockers: string[] } }).result.blockers,
    ).toContain('consent_missing_or_revoked');
  });
  it('resolves direct destination number and creates contact when not previously saved', async () => {
    const prompt =
      'hey call darshan +91 97390 49385 and tell him that his interview is scheduled on Tommorow 9AM sharp and ask that is he coming Tommorow';
    expect(targetName(prompt, [])).toBe('darshan');
    const { run } = harness(prompt);
    const resolved = await run('resolve_contact', {
      name: 'Darshan',
      phone: '+91 97390 49385',
    });
    expect(resolved).toMatchObject({
      result: {
        name: 'Darshan',
        eligible: true,
        consent: { granted: true },
      },
    });
  });
});
describe('execution modes', () => {
  it('simulation launches only via the simulation path with a deterministic key', async () => {
    db.campaign = { mode: 'simulation', status: 'planned', launch_key: null };
    db.members = [PAWAN];
    const prompt = 'Simulate a call to Pawan Kumar about the interview';
    const first = harness(prompt);
    const second = harness(prompt);
    expect(
      await first.run('run_simulation', { campaignId: CAMPAIGN }),
    ).toMatchObject({
      result: { operationId: CAMPAIGN, status: 'running', mode: 'simulation' },
    });
    await second.run('run_simulation', { campaignId: CAMPAIGN });
    const key = simulationKey(THREAD, CAMPAIGN);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    for (const c of [first.campaigns, second.campaigns]) {
      expect(c.launch).toHaveBeenCalledTimes(1);
      expect(c.launch.mock.calls[0]).toEqual([
        expect.anything(),
        CAMPAIGN,
        { confirmed: true, planSnapshotHash: expect.any(String) },
        key,
        'simulation',
      ]);
    }
  });
  it('live intent is never rewritten and never launched by the model', async () => {
    db.campaign = { mode: 'live', status: 'planned', launch_key: null };
    db.members = [PAWAN];
    db.version = true;
    expect(requestedMode(PROMPT)).toBe('live');
    const { run, campaigns } = harness(PROMPT);
    expect(await run('run_simulation', { campaignId: CAMPAIGN })).toMatchObject(
      { error: { code: 'SIMULATION_NOT_REQUESTED' } },
    );
    const live = await run('request_live_launch', { campaignId: CAMPAIGN });
    expect(live).toMatchObject({ result: { confirmationRequired: true } });
    expect(
      await run('control_operation', {
        campaignId: CAMPAIGN,
        action: 'resume',
      }),
    ).toMatchObject({ error: { code: 'LIVE_CONFIRMATION_REQUIRED' } });
    expect(campaigns.launch).not.toHaveBeenCalled();
    expect(campaigns.action).not.toHaveBeenCalled();
  });
  it('a simulation plan is never turned into a live request', async () => {
    db.campaign = { mode: 'simulation', status: 'planned', launch_key: null };
    const { run, campaigns } = harness('Simulate a call to Pawan Kumar');
    expect(
      await run('request_live_launch', { campaignId: CAMPAIGN }),
    ).toMatchObject({ error: { code: 'LIVE_NOT_REQUESTED' } });
    expect(launchModes(campaigns)).not.toContain('live');
  });
});
describe('precise blockers', () => {
  it('reports missing agent, caller ID, credentials and consent for a live plan', async () => {
    db.contacts[0] = person(PAWAN, 'Pawan Kumar', '+919876543210', false);
    db.campaign = { mode: 'live', status: 'planned', launch_key: null };
    db.members = [PAWAN];
    db.version = false;
    const { run } = harness(PROMPT);
    const checked = (await run('validate_call_plan', {
      campaignId: CAMPAIGN,
    })) as {
      result: {
        blockers: string[];
        targets: { reasons: string[] }[];
        eligibleCount: number;
        excludedCount: number;
        confirmationRequired: boolean;
        destinationRole: string;
        callerIdRole: string;
        provider: string;
      };
    };
    expect(checked.result.blockers).toEqual(
      expect.arrayContaining([
        'AGENT_MISSING',
        'SARVAM_AGENT_PHONE_NUMBER',
        'SARVAM_API_KEY',
        'LIVE_CALLS_ENABLED',
      ]),
    );
    expect(checked.result.targets[0]!.reasons).toContain(
      'consent_missing_or_revoked',
    );
    expect(checked.result).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      confirmationRequired: true,
      destinationRole: 'recipient',
      callerIdRole: 'outbound_caller_id',
      provider: 'sarvam',
    });
    const live = (await run('request_live_launch', {
      campaignId: CAMPAIGN,
    })) as { result: { blockers: string[] } };
    expect(live.result.blockers).toEqual(
      expect.arrayContaining(['AGENT_MISSING', 'consent_missing_or_revoked']),
    );
  });
  it('an invalid stored destination is a per-target reason', async () => {
    db.contacts[0] = person(PAWAN, 'Pawan Kumar', '+10000000000');
    db.campaign = { mode: 'simulation', status: 'planned', launch_key: null };
    db.members = [PAWAN];
    const { run } = harness('Simulate a call to Pawan Kumar');
    expect(
      await run('validate_call_plan', { campaignId: CAMPAIGN }),
    ).toMatchObject({
      result: {
        provider: 'mock',
        targets: [{ reasons: ['invalid_destination'] }],
      },
    });
  });
});
describe('artifacts are persisted facts only', () => {
  const attempt = (over: Record<string, unknown>) => ({
    id: ATTEMPT,
    campaign_id: CAMPAIGN,
    status: 'completed',
    outcome: 'connected',
    mode: 'live',
    analysis_status: 'completed',
    summary: 'Will attend.',
    transcript: [{ role: 'user', text: 'Yes' }],
    synthetic: false,
    transcript_status: 'available',
    recording_status: 'processing',
    ...over,
  });
  it('never surfaces conversation content for a not-connected attempt', async () => {
    for (const outcome of ['no_answer', 'busy', 'failed']) {
      db.attempt = attempt({
        outcome,
        status: outcome === 'failed' ? 'failed' : 'completed',
      });
      const { run } = harness(PROMPT);
      expect(
        await run('get_call_artifacts', { attemptId: ATTEMPT }),
      ).toMatchObject({
        result: {
          conversation: false,
          transcript: [],
          summary: null,
          transcriptStatus: 'unavailable',
          recordingStatus: 'unavailable',
          summaryStatus: 'unavailable',
        },
      });
    }
  });
  it('reports processing truthfully and returns persisted content when ready', async () => {
    db.attempt = attempt({ analysis_status: 'processing', summary: null });
    const { run } = harness(PROMPT);
    expect(
      await run('get_call_artifacts', { attemptId: ATTEMPT }),
    ).toMatchObject({
      result: {
        conversation: true,
        recordingStatus: 'processing',
        summaryStatus: 'processing',
        summary: null,
      },
    });
    db.attempt = attempt({});
    expect(
      await run('get_call_artifacts', { attemptId: ATTEMPT }),
    ).toMatchObject({
      result: { summary: 'Will attend.', transcriptStatus: 'available' },
    });
  });
  it('ringing is not a connected interaction', async () => {
    db.attempt = attempt({ status: 'accepted', outcome: null });
    const { run } = harness(PROMPT);
    expect(
      await run('get_call_artifacts', { attemptId: ATTEMPT }),
    ).toMatchObject({ result: { state: 'ringing', conversation: false } });
  });
});
describe('harness contract', () => {
  const registry = (
    mode: ToolDefinition['mode'],
    execute = vi.fn(async () => ({ count: 'invented' })),
  ) => ({
    execute,
    tools: {
      test: {
        description: 'test',
        mode,
        schema: z.strictObject({}),
        output: z.object({ count: z.number() }),
        execute,
      },
    } as Record<string, ToolDefinition>,
  });
  const exec = (tools: Record<string, ToolDefinition>, role = identity.role) =>
    executeCallTool(
      tools,
      'test',
      {},
      { identity: { ...identity, role }, threadId: THREAD },
      async () => {},
    );
  it('does not swallow output validation failures and audits them', async () => {
    expect(await exec(registry('read').tools)).toMatchObject({
      error: { code: 'TOOL_VALIDATION', category: 'validation' },
    });
    const failed = sql.find((q) => q.text.includes("status='failed'"));
    expect(failed?.values).toEqual(['exec-1', 'TOOL_VALIDATION', 'validation']);
  });
  it('requires write permission for every non-read mode', async () => {
    for (const mode of ['draft', 'simulation', 'side_effect'] as const) {
      const { tools, execute } = registry(mode);
      expect(await exec(tools, 'viewer' as never)).toMatchObject({
        error: { code: 'FORBIDDEN', category: 'auth' },
      });
      expect(execute).not.toHaveBeenCalled();
    }
  });
  it('stores redacted input/output on tool_executions', async () => {
    const execute = vi.fn(async () => ({ count: 1 }));
    const { tools } = registry('read', execute as never);
    tools.test!.schema = z.object({ phone: z.string() });
    await executeCallTool(
      tools,
      'test',
      { phone: '+919876543210' },
      { identity, threadId: THREAD },
      async () => {},
    );
    const insert = sql.find((q) =>
      q.text.includes('INSERT INTO tool_executions'),
    );
    expect(String(insert?.values[5])).not.toContain('9876543210');
    expect(
      JSON.stringify(redact({ transcript: [{ text: 'secret answer' }] })),
    ).not.toContain('secret answer');
  });
  it('categorizes errors per the brief and hides raw exception text', () => {
    expect(
      JSON.stringify(toolFailure(new Error('api-key=secret-value'))),
    ).not.toContain('secret-value');
    expect(toolFailure({ status: 429 }).category).toBe('rate limit');
    expect(toolFailure({ status: 401 }).category).toBe('auth');
    expect(toolFailure({ status: 500 }).category).toBe('provider');
    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    expect(toolFailure(timeout).category).toBe('timeout');
  });
});
