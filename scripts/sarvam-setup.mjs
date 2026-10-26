#!/usr/bin/env node
/**
 * scripts/sarvam-setup.mjs
 *
 * Full Sarvam Voice Agent setup automation.
 *
 * Runs 3 phases:
 *   Phase 1 — Validate Sarvam credentials + fetch existing state
 *   Phase 2 — Create inbound deployment (Step 3 from the guide)
 *   Phase 3 — Trigger instant outbound test call to +919546730793
 *
 * Usage:
 *   node scripts/sarvam-setup.mjs             # full run
 *   node scripts/sarvam-setup.mjs --check     # phase 1 only (validate + list)
 *   node scripts/sarvam-setup.mjs --call      # phase 3 only (outbound call)
 *
 * Environment (reads from .env automatically):
 *   SARVAM_API_KEY           ← required
 *   SARVAM_ORG_ID            ← required
 *   SARVAM_WORKSPACE_ID      ← required
 *   SARVAM_APP_ID            ← required for phase 2+3 (from dashboard after agent commit)
 *   SARVAM_APP_VERSION       ← default 1
 *   SARVAM_CONNECTION_ID     ← required for phase 2+3 (from Telephony section in dashboard)
 *   SARVAM_AGENT_PHONE_NUMBER← default +918064269408
 *   LIVE_DESTINATION_ALLOWLIST ← default +919546730793
 */

// ── Load .env ────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const API_KEY    = process.env.SARVAM_API_KEY        ?? '';
const ORG_ID     = process.env.SARVAM_ORG_ID         ?? '';
const WS_ID      = process.env.SARVAM_WORKSPACE_ID   ?? '';
const APP_ID     = process.env.SARVAM_APP_ID         ?? '';
const APP_VER    = Number(process.env.SARVAM_APP_VERSION ?? '1');
const CONN_ID    = process.env.SARVAM_CONNECTION_ID  ?? '';
const AGENT_PH   = process.env.SARVAM_AGENT_PHONE_NUMBER ?? '+918064269408';
const USER_PH    = (process.env.LIVE_DESTINATION_ALLOWLIST ?? '+919546730793').split(',')[0].trim();

const AUTH_BASE  = `https://apps.sarvam.ai/api/app-authoring/v1/orgs/${encodeURIComponent(ORG_ID)}/workspaces/${encodeURIComponent(WS_ID)}`;
const OUTBOUND_URL = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(ORG_ID)}/workspaces/${encodeURIComponent(WS_ID)}/outbounds`;

const HEADERS = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
const TIMEOUT  = 20_000;

const args = process.argv.slice(2);
const MODE_CHECK = args.includes('--check');
const MODE_CALL  = args.includes('--call');

// ── Utilities ─────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function err(msg)  { console.log(`  ❌  ${msg}`); }
function info(msg) { console.log(`  ℹ️   ${msg}`); }
function head(msg) { console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`); }

// ── Phase 1: Validate credentials + list current state ────────────────────────
async function phase1() {
  head('Phase 1 — Credential & Workspace Validation');

  const missing = [];
  if (!API_KEY) missing.push('SARVAM_API_KEY');
  if (!ORG_ID)  missing.push('SARVAM_ORG_ID');
  if (!WS_ID)   missing.push('SARVAM_WORKSPACE_ID');
  if (missing.length) {
    err(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  ok(`API key present (${API_KEY.slice(0,12)}...)`);
  ok(`Org ID: ${ORG_ID}`);
  ok(`Workspace ID: ${WS_ID}`);

  // Test auth by listing deployments
  const { status, body } = await api('GET', `${AUTH_BASE}/deployments`);
  if (status !== 200) {
    err(`Auth check failed (HTTP ${status}). Is your API key a Voice Agents key from indus.sarvam.ai?`);
    process.exit(1);
  }
  ok(`API key authenticated ✓`);

  const count = body?.total ?? 0;
  if (count === 0) {
    warn(`No deployments found in this workspace.`);
    info(`You need to create an agent in the Sarvam dashboard first.`);
    info(`See: https://indus.sarvam.ai/samvaad/agents`);
  } else {
    ok(`Found ${count} deployment(s):`);
    for (const dep of (body?.items ?? [])) {
      console.log(`     • ${dep.deployment_id}  app=${dep.app_id} v${dep.app_version}  status=${dep.status}`);
      console.log(`       numbers: ${dep.phone_numbers?.join(', ')}`);
    }
  }

  // Env var status
  console.log('\n  Current .env state:');
  const vars = [
    ['SARVAM_APP_ID',            APP_ID,   'needed for deployment + outbound'],
    ['SARVAM_APP_VERSION',       APP_VER,  ''],
    ['SARVAM_CONNECTION_ID',     CONN_ID,  'needed for deployment + outbound'],
    ['SARVAM_AGENT_PHONE_NUMBER',AGENT_PH, ''],
    ['LIVE_DESTINATION_ALLOWLIST',USER_PH, 'test call destination'],
  ];
  for (const [name, val, hint] of vars) {
    const set = val && String(val).trim() && val !== '1' || name === 'SARVAM_APP_VERSION';
    const icon = (name==='SARVAM_APP_ID'||name==='SARVAM_CONNECTION_ID') && !val ? '  ⚠️  ' : (val ? '  ✅ ' : '  ⚠️  ');
    console.log(`${icon} ${name}=${val || '(not set)'}${hint ? '  ← '+hint : ''}`);
  }

  if (!APP_ID || !CONN_ID) {
    console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │  NEXT STEPS — Complete these in the Sarvam dashboard    │
  ├─────────────────────────────────────────────────────────┤
  │  1. Create & commit Hindi agent:                        │
  │     https://indus.sarvam.ai/samvaad/agents              │
  │     → Copy the App ID → set SARVAM_APP_ID in .env      │
  │                                                         │
  │  2. Get Connection ID for +918064269408:                │
  │     https://indus.sarvam.ai/samvaad/connections         │
  │     → Copy Connection ID → set SARVAM_CONNECTION_ID    │
  │                                                         │
  │  3. Re-run: node scripts/sarvam-setup.mjs               │
  └─────────────────────────────────────────────────────────┘`);
  }
}

// ── Phase 2: Create inbound deployment ────────────────────────────────────────
async function phase2() {
  head('Phase 2 — Create Inbound Deployment');

  if (!APP_ID)  { err('SARVAM_APP_ID not set. Complete Phase 1 first.'); return false; }
  if (!CONN_ID) { err('SARVAM_CONNECTION_ID not set. Complete Phase 1 first.'); return false; }

  info(`Creating deployment for app_id=${APP_ID} v${APP_VER}`);
  info(`Phone: ${AGENT_PH}  connection: ${CONN_ID}`);

  const { status, body } = await api('POST', `${AUTH_BASE}/deployments`, {
    name: 'Hindi Outreach Agent',
    description: 'Hindi voice agent for outbound calling — deployed via API',
    app_id: APP_ID,
    app_version: APP_VER,
    connection_configs: [
      { connection_id: CONN_ID, agent_phone_number: AGENT_PH }
    ],
    inbound_config: {
      start_time: '00:00',
      end_time: '23:59',
      allowed_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      timezone: 'Asia/Kolkata',
    },
  });

  if (status === 200 && body?.deployment_id) {
    ok(`Deployment created!`);
    ok(`deployment_id: ${body.deployment_id}`);
    ok(`status: ${body.status}`);
    ok(`channel_direction: ${body.channel_direction}`);
    info(`Phone numbers active: ${body.connection_configs?.map(c => c.agent_phone_number).join(', ')}`);
    return true;
  }

  if (status === 422) {
    err(`Validation error (HTTP 422):`);
    if (Array.isArray(body?.detail)) {
      for (const d of body.detail) console.log(`     → [${d.loc?.join('.')}] ${d.msg}`);
    } else {
      // ErrorResponse format
      console.log(`     → ${JSON.stringify(body)}`);
    }
    return false;
  }

  err(`Unexpected HTTP ${status}`);
  return false;
}

// ── Phase 3: Trigger outbound test call ───────────────────────────────────────
async function phase3() {
  head('Phase 3 — Instant Outbound Call to ' + USER_PH);

  if (!APP_ID)  { err('SARVAM_APP_ID not set.'); return; }
  if (!CONN_ID) { err('SARVAM_CONNECTION_ID not set.'); return; }

  info(`Caller   : ${AGENT_PH}  (your Sarvam number)`);
  info(`Calling  : ${USER_PH}`);
  info(`Agent    : app_id=${APP_ID}  version=${APP_VER}`);
  info(`Language : Hindi`);

  const reqBody = {
    app_config: {
      app_id:      APP_ID,
      app_version: APP_VER,
      connection_config: {
        connection_id:      CONN_ID,
        agent_phone_number: AGENT_PH,
      },
      app_overrides: {
        initial_language_name: 'Hindi',
      },
    },
    user_config: {
      user_phone_number: USER_PH,
    },
  };

  const { status, body } = await api('POST', OUTBOUND_URL, reqBody);

  if (status === 200 && body?.attempt_id) {
    ok(`Call accepted by Sarvam!`);
    ok(`attempt_id: ${body.attempt_id}`);
    console.log(`
  📱  Your phone (${USER_PH}) should ring within a few seconds.
  🗣️   The agent will speak in Hindi.
  📊  Check call status at: https://indus.sarvam.ai/samvaad/analytics`);
    return;
  }

  if (status === 422) {
    err(`Validation error (HTTP 422) — check app_id, connection_id and phone numbers:`);
    if (Array.isArray(body?.detail)) {
      for (const d of body.detail) console.log(`     → [${d.loc?.join('.')}] ${d.msg} (${d.type})`);
    }
    return;
  }

  if (status === 429) { err('Rate limited. Wait a moment and retry.'); return; }
  if (status >= 400 && status < 500) { err(`Client error HTTP ${status}. Check credentials.`); return; }
  err(`HTTP ${status} — call status unknown. Check Sarvam dashboard.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n🚀  Sarvam Voice Agent Setup\n');

try {
  await phase1();

  if (!MODE_CHECK) {
    if (APP_ID && CONN_ID) {
      if (!MODE_CALL) {
        await phase2();
      }
      await phase3();
    } else {
      warn('Skipping deployment + call (APP_ID or CONNECTION_ID not set).');
      info('Fill them in .env then re-run: node scripts/sarvam-setup.mjs');
    }
  }

  console.log('\nDone.\n');
} catch (e) {
  console.error('\n❌  Fatal error:', e.message);
  process.exit(1);
}
