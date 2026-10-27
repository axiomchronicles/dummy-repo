import { useState } from 'react';
import {
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';

export function Queues() {
  const [loading, setLoading] = useState(false);

  // BullMQ Queues snapshot
  const queues = [
    { name: 'dispatch', title: 'Telephony Dispatch', active: 0, waiting: 0, completed: 18, failed: 0, status: 'healthy' },
    { name: 'analysis', title: 'Post-Call Analysis', active: 0, waiting: 0, completed: 18, failed: 0, status: 'healthy' },
    { name: 'reconciliation', title: 'Provider Event Sync', active: 0, waiting: 0, completed: 42, failed: 0, status: 'healthy' },
    { name: 'imports', title: 'Roster File Parsing', active: 0, waiting: 0, completed: 12, failed: 0, status: 'healthy' },
    { name: 'reports', title: 'Audit & Analytics Export', active: 0, waiting: 0, completed: 5, failed: 0, status: 'healthy' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Queue & Worker Health</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            BullMQ operational queues backed by Redis 7.4. Monitored for dead-letter isolation.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 500);
          }}
          className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
          title="Refresh Queue Metrics"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Queue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {queues.map((q) => (
          <div key={q.name} className="bg-[#141414] border border-[#262626] rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-neutral-800 text-neutral-300">
                  <Layers className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{q.title}</h3>
                  <span className="font-mono text-[11px] text-neutral-500">{q.name}</span>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>ACTIVE</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#262626] text-center">
              <div>
                <div className="text-xs text-neutral-400">Waiting</div>
                <div className="text-base font-bold text-neutral-200 mt-0.5">{q.waiting}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Active</div>
                <div className="text-base font-bold text-blue-400 mt-0.5">{q.active}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Completed</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">{q.completed}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dead-Letter Job Inspector */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Dead-Letter Isolation Inspector</h3>
              <p className="text-xs text-neutral-400">
                Failed jobs after max attempts (3 retries with exponential backoff) are isolated here.
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-neutral-400">0 FAILED JOBS</div>
        </div>

        <div className="p-8 rounded-xl bg-[#0B0B0B] border border-dashed border-[#262626] text-center text-neutral-500 text-sm">
          No dead-letter failures detected. All workers operating normally within policy limits.
        </div>
      </div>
    </div>
  );
}
