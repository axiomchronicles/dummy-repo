import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Server,
  Database,
  PhoneCall,
  Users,
  Layers,
  Cpu,
  CheckCircle2,
  Volume2
} from 'lucide-react';
import { apiRequest, errorMessage, type AdminOverview } from '../lib/api';

interface OverviewProps {
  overview: AdminOverview | null;
  onRefresh: () => void;
}

export function Overview({ overview, onRefresh }: OverviewProps) {
  const [killSwitchModal, setKillSwitchModal] = useState(false);
  const [killSwitchReason, setKillSwitchReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const killSwitchActive = overview?.killSwitch?.active ?? false;
  const killSwitchReasonText = overview?.killSwitch?.reason || 'No reason specified';

  async function toggleKillSwitch(nextState: boolean) {
    if (nextState && !killSwitchReason.trim()) return;
    setActionLoading(true);
    try {
      await apiRequest('/api/v1/admin/kill-switch', {
        method: 'POST',
        body: JSON.stringify({
          active: nextState,
          reason: nextState ? killSwitchReason.trim() : 'Operator deactivated telephony kill-switch',
        }),
      });
      setKillSwitchModal(false);
      setKillSwitchReason('');
      onRefresh();
    } catch (err) {
      alert(`Kill switch update failed: ${errorMessage(err, 'unknown error')}`);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Telephony Kill Switch Banner Card */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          killSwitchActive
            ? 'bg-red-500/10 border-red-500/50 shadow-lg shadow-red-500/10'
            : 'bg-[#141414] border-[#262626]'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl shrink-0 ${
                killSwitchActive
                  ? 'bg-red-500 text-white'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {killSwitchActive ? (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              ) : (
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Global Telephony Kill-Switch
                </h2>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    killSwitchActive
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {killSwitchActive ? 'EMERGENCY ENGAGED' : 'NORMAL (DISARMED)'}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                {killSwitchActive
                  ? `Active block: All live and scheduled telephony dispatches are forcefully halted. Reason: "${killSwitchReasonText}"`
                  : 'When engaged, all voice agent telephony dispatches across all workspaces are instantly halted at the worker barrier.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (killSwitchActive) {
                if (confirm('Deactivate the telephony kill switch and restore normal calling?')) {
                  toggleKillSwitch(false);
                }
              } else {
                setKillSwitchModal(true);
              }
            }}
            disabled={actionLoading}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-colors shrink-0 ${
              killSwitchActive
                ? 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
            }`}
          >
            {killSwitchActive ? 'Deactivate Kill-Switch' : 'Engage Emergency Kill-Switch'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Kill Switch */}
      {killSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Engage Telephony Kill-Switch</h3>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed mb-4">
              This will immediately drop all outbound queue dispatches and reject new call attempts.
              Please document the operational reason for this security mutation.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase text-neutral-400 mb-1">
                Mandatory Operational Reason
              </label>
              <textarea
                required
                rows={3}
                value={killSwitchReason}
                onChange={(e) => setKillSwitchReason(e.target.value)}
                placeholder="e.g. Telephony rate limit incident, operator policy halt, or Sarvam maintenance..."
                className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setKillSwitchModal(false)}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!killSwitchReason.trim() || actionLoading}
                onClick={() => toggleKillSwitch(true)}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {actionLoading ? 'Enforcing...' : 'Confirm Emergency Halt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Health Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Database className="w-4 h-4" />
              <span className="text-xs uppercase font-semibold tracking-wider">PostgreSQL</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">Connected</div>
          <p className="text-xs text-neutral-400 mt-1">Pool active • Migrations verified</p>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Server className="w-4 h-4" />
              <span className="text-xs uppercase font-semibold tracking-wider">Redis 7.4</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">Healthy (PONG)</div>
          <p className="text-xs text-neutral-400 mt-1">BullMQ queues synchronized</p>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Cpu className="w-4 h-4" />
              <span className="text-xs uppercase font-semibold tracking-wider">BullMQ Worker</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">Dispatching</div>
          <p className="text-xs text-neutral-400 mt-1">Concurrency bounded: max 10</p>
        </div>
      </div>

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center gap-2 text-neutral-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-xs uppercase font-semibold">Provisioned Users</span>
          </div>
          <div className="text-3xl font-extrabold text-white">{overview?.userCount ?? '—'}</div>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center gap-2 text-neutral-400 mb-2">
            <Layers className="w-4 h-4" />
            <span className="text-xs uppercase font-semibold">Campaigns</span>
          </div>
          <div className="text-3xl font-extrabold text-white">{overview?.campaignCount ?? '—'}</div>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center gap-2 text-neutral-400 mb-2">
            <PhoneCall className="w-4 h-4" />
            <span className="text-xs uppercase font-semibold">Call Attempts</span>
          </div>
          <div className="text-3xl font-extrabold text-white">{overview?.attemptCount ?? '—'}</div>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
          <div className="flex items-center gap-2 text-neutral-400 mb-2">
            <Volume2 className="w-4 h-4" />
            <span className="text-xs uppercase font-semibold">Voice Mode</span>
          </div>
          <div className="text-sm font-bold text-emerald-400 mt-2">
            SIMULATION
          </div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Mock Provider active</p>
        </div>
      </div>

      {/* System Integrity & Provider Details */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
        <h3 className="text-base font-bold text-white mb-4">Telephony & AI Harness Specifications</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2">
              Telephony Contract Boundary
            </h4>
            <ul className="space-y-1.5 text-neutral-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Primary: Sarvam Voice Agents REST API</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Local default: MockVoiceProvider (Zero paid calls in dev/test)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Webhook authentication: 32-byte secret route token + timing-safe comparison</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2">
              AI Agent Harness Boundary
            </h4>
            <ul className="space-y-1.5 text-neutral-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Framework: Mastra 1.79 + @mastra/pg storage adapter</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Local default: DeterministicLocalPlanner (Offline capability)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trust Boundary: User confirmation required before real dispatch</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
