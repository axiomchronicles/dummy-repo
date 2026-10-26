/**
 * scripts/trigger-live-call.ts
 *
 * One-shot live outbound call trigger for manual testing.
 * Run with:  npx tsx scripts/trigger-live-call.ts
 *
 * All values are read from .env — never hard-code secrets here.
 * Fill in SARVAM_APP_ID, SARVAM_APP_VERSION, SARVAM_CONNECTION_ID,
 * SARVAM_AGENT_PHONE_NUMBER in .env before running.
 */

import 'dotenv/config';

// ─── Required env vars ───────────────────────────────────────────────────────
const API_KEY       = process.env.SARVAM_API_KEY!;
const ORG_ID        = process.env.SARVAM_ORG_ID!;
const WORKSPACE_ID  = process.env.SARVAM_WORKSPACE_ID!;
const APP_ID        = process.env.SARVAM_APP_ID!;
const APP_VERSION   = Number(process.env.SARVAM_APP_VERSION ?? '1');
const CONNECTION_ID = process.env.SARVAM_CONNECTION_ID!;
const AGENT_PHONE   = process.env.SARVAM_AGENT_PHONE_NUMBER!;  // +918064269408
const USER_PHONE    = process.env.LIVE_DESTINATION_ALLOWLIST?.split(',')[0]?.trim()!; // +919546730793

// ─── Validation ──────────────────────────────────────────────────────────────
const missing = (
  ['API_KEY','ORG_ID','WORKSPACE_ID','APP_ID','CONNECTION_ID','AGENT_PHONE','USER_PHONE'] as const
).filter((k) => !eval(k)?.trim?.());

if (missing.length) {
  console.error('❌  Missing env vars:', missing.map((k) =>
    ({ API_KEY:'SARVAM_API_KEY', ORG_ID:'SARVAM_ORG_ID', WORKSPACE_ID:'SARVAM_WORKSPACE_ID',
       APP_ID:'SARVAM_APP_ID', CONNECTION_ID:'SARVAM_CONNECTION_ID',
       AGENT_PHONE:'SARVAM_AGENT_PHONE_NUMBER', USER_PHONE:'LIVE_DESTINATION_ALLOWLIST' }[k])
  ).join(', '));
  process.exit(1);
}

// ─── Sarvam outbound call request ────────────────────────────────────────────
const url =
  `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(ORG_ID)}/workspaces/${encodeURIComponent(WORKSPACE_ID)}/outbounds`;

const body = {
  app_config: {
    app_id:      APP_ID,
    app_version: APP_VERSION,
    connection_config: {
      connection_id:      CONNECTION_ID,
      agent_phone_number: AGENT_PHONE,   // +918064269408 (your purchased number)
    },
    // Language override: Hindi — the agent must have Hindi enabled in its
    // committed configuration on indus.sarvam.ai for this to take effect.
    app_overrides: {
      initial_language_name: 'Hindi',
    },
  },
  user_config: {
    user_phone_number: USER_PHONE,       // +919546730793 (your test number)
  },
  // Webhook is optional for a quick manual test — terminal status posted here.
  // webhook_config: { url: 'https://your-https-endpoint/api/v1/webhooks/sarvam/TOKEN' },
};

console.log('📞  Triggering outbound call...');
console.log('   From:', AGENT_PHONE, '→ To:', USER_PHONE);
console.log('   Agent app_id:', APP_ID, 'v' + APP_VERSION);
console.log('   Language: Hindi');
console.log('   URL:', url);
console.log();

const res = await fetch(url, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(15_000),
});

const text = await res.text();
let json: unknown;
try { json = JSON.parse(text); } catch { json = text; }

if (res.status === 200) {
  const { attempt_id } = json as { attempt_id: string };
  console.log('✅  Call accepted by Sarvam!');
  console.log('   attempt_id:', attempt_id);
  console.log();
  console.log('   Your phone (+919546730793) should ring shortly.');
  console.log('   The agent will speak in Hindi.');
} else {
  console.error('❌  Sarvam returned HTTP', res.status);
  // Never log raw vendor body in production — safe here for local CLI debug only.
  console.error('   Response:', JSON.stringify(json, null, 2));
}
