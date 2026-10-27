import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
export const base = process.env.API_URL ?? 'http://localhost:3000';
export const workerBase = process.env.WORKER_URL ?? 'http://localhost:3001';
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Entity = { id: string; status: string; [key: string]: unknown };
export type Identity = { userId: string; workspaceId: string; name: string };
export const policy = {
  timezone: 'UTC',
  windowStart: '00:00',
  windowEnd: '23:59',
  concurrency: 2,
  budgetMinor: 10000,
  currency: 'INR',
  estimatedCostPerCallMinor: 500,
};
export const sample = [
  'name,phone,consent,outcome',
  'Alice,+12025550101,true,connected',
  'Benoit,+12025550102,true,no_answer',
  'Carmen,+12025550103,true,busy',
  'Dev,+12025550104,true,failed',
].join('\n');
export class Client {
  cookie = '';
  async response(path: string, body?: unknown, key?: string, method?: string) {
    return fetch(base + '/api/v1' + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async json<T>(
    path: string,
    body?: unknown,
    key?: string,
    method?: string,
  ): Promise<T> {
    const response = await this.response(path, body, key, method);
    if (!response.ok)
      throw new Error(
        path + ': ' + response.status + ' ' + (await response.text()),
      );
    return response.json() as Promise<T>;
  }
  async signIn() {
    const response = await this.response('/auth/demo', {
      email: randomUUID() + '@demo.invalid',
      name: 'Integration operator',
    });
    if (!response.ok) throw new Error('Sign-in failed: ' + response.status);
    this.cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    return response.json() as Promise<Identity>;
  }
  async imported(csv = sample) {
    const imported = await this.json<Entity>('/imports', {
      filename: 'synthetic.csv',
      contentBase64: Buffer.from(csv).toString('base64'),
      mapping: {
        phone: 'phone',
        name: 'name',
        consent: 'consent',
        outcome: 'outcome',
      },
      synthetic: true,
    });
    return until(async () => {
      const row = await this.json<Entity>('/imports/' + imported.id);
      return ['ready', 'needs_correction', 'failed'].includes(row.status)
        ? row
        : undefined;
    });
  }
  async campaign(importId: string, agentId: string, mode = 'simulation') {
    return this.json<Entity>('/campaigns', {
      name: 'Integration campaign',
      objective: 'Gather explicitly synthetic feedback',
      importId,
      agentId,
      mode,
      policy,
    });
  }
}
export async function until<T>(
  probe: () => Promise<T | undefined>,
  timeout = 45000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result !== undefined) return result;
    await delay(150);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for persisted workflow state');
}
