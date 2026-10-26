#!/usr/bin/env node
/**
 * scripts/sarvam-test-call.mjs
 *
 * Standalone ESM script to trigger a live Sarvam outbound call.
 * No build step needed. Run:
 *
 *   SARVAM_APP_ID=<id> SARVAM_CONNECTION_ID=<id> node scripts/sarvam-test-call.mjs
 *
 * Or fill all values in .env and run:
 *
 *   node -e "import('dotenv/config').then(()=>import('./scripts/sarvam-test-call.mjs'))"
 *
 * All required values and what to fill:
 *   SARVAM_API_KEY          → already set in .env
 *   SARVAM_ORG_ID           → already set in .env
 *   SARVAM_WORKSPACE_ID     → already set in .env
 *   SARVAM_APP_ID           → from indus.sarvam.ai after committing your agent
 *   SARVAM_APP_VERSION      → version number (default: 1)
 *   SARVAM_CONNECTION_ID    → from Telephony section in dashboard
 *   SARVAM_AGENT_PHONE_NUMBER → +918064269408 (your Sarvam number)
 *   CALL_DESTINATION        → number to call, overrides LIVE_DESTINATION_ALLOWLIST
 */

// ── Load env from .env if available (optional, falls back to process.env) ────
try {
  const fs = await import('fs');
  const path = await import('path');
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  }
} catch { /* optional */ }

// ── Config ────────────────────────────────────────────────────────────────────
const cfg = {
  API_KEY:       process.env.SARVAM_API_KEY,
  ORG_ID:        process.env.SARVAM_ORG_ID,
  WORKSPACE_ID:  process.env.SARVAM_WORKSPACE_ID,
  APP_ID:        process.env.SARVAM_APP_ID,
  APP_VERSION:   Number(process.env.SARVAM_APP_VERSION ?? '1'),
  CONNECTION_ID: process.env.SARVAM_CONNECTION_ID,
  AGENT_PHONE:   process.env.SARVAM_AGENT_PHONE_NUMBER ?? '+918064269408',
  USER_PHONE:    process.env.CALL_DESTINATION
                 ?? process.env.LIVE_DESTINATION_ALLOWLIST?.split(',')[0]?.trim()
                 ?? '+919546730793',
};

// ── Validate ──────────────────────────────────────────────────────────────────
const required = { API_KEY: 'SARVAM_API_KEY', ORG_ID: 'SARVAM_ORG_ID',
  WORKSPACE_ID: 'SARVAM_WORKSPACE_ID', APP_ID: 'SARVAM_APP_ID',
  CONNECTION_ID: 'SARVAM_CONNECTION_ID', AGENT_PHONE: 'SARVAM_AGENT_PHONE_NUMBER' };
const missing = Object.entries(required).filter(([k]) => !cfg[k]?.trim?.());

if (missing.length) {
  console.error('\n❌  Missing required environment variables:\n');
  for (const [, envName] of missing) console.error(`   → ${envName}`);
  console.error('\nSee the setup guide for instructions.\n');
  process.exit(1);
}

// ── Build Sarvam outbound request ─────────────────────────────────────────────
const url = [
  'https://apps.sarvam.ai/api/outbounds/v1/orgs',
  encodeURIComponent(cfg.ORG_ID),
  'workspaces',
  encodeURIComponent(cfg.WORKSPACE_ID),
  'outbounds',
].join('/');

const body = {
  app_config: {
    app_id:      cfg.APP_ID,
    app_version: cfg.APP_VERSION,
    connection_config: {
      connection_id:      cfg.CONNECTION_ID,
      agent_phone_number: cfg.AGENT_PHONE,
    },
    // Request Hindi language — must also be enabled in the committed agent config
    app_overrides: {
      initial_language_name: 'Hindi',
    },
  },
  user_config: {
    user_phone_number: cfg.USER_PHONE,
  },
  // Uncomment and set SARVAM_WEBHOOK_BASE_URL + SARVAM_WEBHOOK_TOKEN to receive
  // the terminal callback (connected/no_answer/busy/failed + transcript):
  // webhook_config: {
  //   url: `${process.env.SARVAM_WEBHOOK_BASE_URL}/api/v1/webhooks/sarvam/${process.env.SARVAM_WEBHOOK_TOKEN}`,
  //   metadata: { source: 'manual-test', timestamp: new Date().toISOString() },
  // },
};

// ── Fire call ─────────────────────────────────────────────────────────────────
console.log('\n📞  Triggering Sarvam outbound call...');
console.log(`   Caller : ${cfg.AGENT_PHONE}  (your Sarvam number)`);
console.log(`   Calling: ${cfg.USER_PHONE}`);
console.log(`   Agent  : app_id=${cfg.APP_ID}  version=${cfg.APP_VERSION}`);
console.log(`   Lang   : Hindi`);
console.log(`   URL    : ${url}\n`);

let res;
try {
  res = await fetch(url, {
    method:  'POST',
    headers: { 'X-API-Key': cfg.API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(20_000),
  });
} catch (err) {
  console.error('❌  Network error:', err.message);
  process.exit(1);
}

const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = { raw: text }; }

if (res.status === 200 && json?.attempt_id) {
  console.log('✅  Call accepted by Sarvam!');
  console.log(`   attempt_id : ${json.attempt_id}`);
  console.log(`\n   📱 Your phone (${cfg.USER_PHONE}) should ring shortly.`);
  console.log('   🗣️  The agent will speak in Hindi.\n');
} else if (res.status === 422) {
  console.error('❌  Validation error (HTTP 422). Check your app_id, connection_id and agent_phone_number.');
  // Safe subset of 422 detail — no PII or keys in this output
  if (Array.isArray(json?.detail)) {
    for (const d of json.detail) {
      console.error(`   → [${d.loc?.join('.')}] ${d.msg} (${d.type})`);
    }
  }
  process.exit(1);
} else if (res.status === 429) {
  console.error('❌  Rate limited (HTTP 429). Wait a moment and retry.');
  process.exit(1);
} else if (res.status >= 400 && res.status < 500) {
  console.error(`❌  Client error HTTP ${res.status}. Check your API key and IDs.`);
  process.exit(1);
} else {
  // 5xx or unexpected — don't log raw body (may contain sensitive vendor info)
  console.error(`❌  Unexpected HTTP ${res.status}. The call status is unknown — check Sarvam dashboard.`);
  process.exit(1);
}
