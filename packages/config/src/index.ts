import { z } from 'zod';
const BooleanSchema = z.preprocess(
  (value) =>
    value === undefined
      ? undefined
      : value === 'true' || value === true
        ? true
        : value === 'false' || value === false
          ? false
          : value,
  z.boolean(),
);
export const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://outreach:outreach@localhost:5432/outreach'),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PUBLIC_BASE_URL: z.url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default(''),
  DEV_AUTH: BooleanSchema.default(true),
  VOICE_PROVIDER: z.enum(['mock', 'sarvam']).default('mock'),
  MODEL_PROVIDER: z
    .enum(['local', 'sarvam', 'openai', 'openai-compatible'])
    .default('local'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_MODEL_ID: z.string().optional(),
  SARVAM_MODEL_API_KEY: z.string().optional(),
  SARVAM_MODEL_NAME: z
    .enum(['sarvam-105b', 'sarvam-105b-conversations'])
    .default('sarvam-105b'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  LIVE_CALLS_ENABLED: BooleanSchema.default(false),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_ORG_ID: z.string().optional(),
  SARVAM_WORKSPACE_ID: z.string().optional(),
  SARVAM_APP_ID: z.string().optional(),
  SARVAM_APP_VERSION: z.coerce.number().int().min(1).optional(),
  SARVAM_CONNECTION_ID: z.string().optional(),
  SARVAM_AGENT_PHONE_NUMBER: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  SARVAM_WEBHOOK_BASE_URL: z.url().optional(),
  SARVAM_WEBHOOK_TOKEN: z.string().optional(),
  SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED: BooleanSchema.default(false),
  LIVE_DESTINATION_ALLOWLIST: z.string().default(''),
  PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(10000),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(10000).default(150),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
});
export type Environment = z.infer<typeof EnvironmentSchema>;
export function loadConfig(
  env: Record<string, unknown> = process.env,
): Environment {
  const result = EnvironmentSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = result.data;
  if (config.NODE_ENV === 'production' && config.DEV_AUTH)
    throw new Error('Development authentication is forbidden in production');
  if (
    config.MODEL_PROVIDER === 'sarvam' &&
    !config.SARVAM_MODEL_API_KEY?.trim()
  )
    throw new Error('Model configuration incomplete: SARVAM_MODEL_API_KEY');
  if (
    (config.MODEL_PROVIDER === 'openai' ||
      config.MODEL_PROVIDER === 'openai-compatible') &&
    config.NODE_ENV === 'production' &&
    !config.OPENAI_API_KEY?.trim() &&
    !config.OPENAI_COMPATIBLE_API_KEY?.trim()
  )
    throw new Error('Model configuration incomplete: OPENAI_API_KEY');
  if (config.LIVE_CALLS_ENABLED && liveConfigurationIssues(config).length)
    throw new Error(
      `Live configuration incomplete: ${liveConfigurationIssues(config).join(', ')}`,
    );
  return config;
}
export function liveConfigurationIssues(config: Environment): string[] {
  const issues: string[] = [];
  if (config.VOICE_PROVIDER !== 'sarvam') issues.push('VOICE_PROVIDER');
  for (const field of [
    'SARVAM_API_KEY',
    'SARVAM_ORG_ID',
    'SARVAM_WORKSPACE_ID',
    'SARVAM_APP_ID',
    'SARVAM_APP_VERSION',
    'SARVAM_CONNECTION_ID',
    'SARVAM_AGENT_PHONE_NUMBER',
  ] as const)
    if (!config[field]) issues.push(field);
  if (!config.SARVAM_WEBHOOK_BASE_URL?.startsWith('https://'))
    issues.push('SARVAM_WEBHOOK_BASE_URL_HTTPS');
  if (
    !config.SARVAM_WEBHOOK_TOKEN ||
    !/^[A-Za-z0-9_-]{43,}$/.test(config.SARVAM_WEBHOOK_TOKEN)
  )
    issues.push('SARVAM_WEBHOOK_TOKEN_32_BYTES_ENTROPY');
  if (!config.SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED)
    issues.push('SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED');
  const destinations = allowedLiveDestinations(config);
  if (
    !destinations.length ||
    destinations.some((number) => !/^\+[1-9]\d{7,14}$/.test(number))
  )
    issues.push('LIVE_DESTINATION_ALLOWLIST');
  return issues;
}
export function allowedLiveDestinations(config: Environment): string[] {
  return config.LIVE_DESTINATION_ALLOWLIST.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
export function liveReady(config: Environment): boolean {
  return (
    config.LIVE_CALLS_ENABLED && liveConfigurationIssues(config).length === 0
  );
}
