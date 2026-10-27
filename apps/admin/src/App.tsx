import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users as UsersIcon,
  Layers,
  Bot,
  FileText,
  Activity,
  LogOut,
  Lock,
  RefreshCw
} from 'lucide-react';
import { apiRequest, getAuthToken, clearAuthToken } from './lib/api';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Users } from './pages/Users';
import { Queues } from './pages/Queues';
import { Agents } from './pages/Agents';
import { Audit } from './pages/Audit';

export function App() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'queues' | 'agents' | 'audit'>('overview');
  const [overviewData, setOverviewData] = useState<any | null>(null);

  async function checkSession() {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiRequest('/api/v1/auth/me');
      if (res && res.user) {
        setUser(res.user);
        loadOverview();
      } else {
        clearAuthToken();
        setUser(null);
      }
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadOverview() {
    try {
      const res = await apiRequest('/api/v1/admin/overview');
      setOverviewData(res);
    } catch (e) {
      console.error('Failed to load overview data', e);
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  async function handleLogout() {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } catch {}
    clearAuthToken();
    setUser(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={(u) => { setUser(u); loadOverview(); }} />;
  }

  const isKillSwitchActive = overviewData?.killSwitch?.active ?? false;

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-neutral-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#141414]/90 backdrop-blur-md border-b border-[#262626]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Lock className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-white">Outreach Intern</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block -mt-0.5">
                  Admin Console
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <UsersIcon className="w-3.5 h-3.5" />
                <span>Users</span>
              </button>
              <button
                onClick={() => setActiveTab('queues')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'queues'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Queues</span>
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'agents'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Agent Harness</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Audit Log</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Kill Switch Indicator Pill */}
            {isKillSwitchActive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>KILL-SWITCH ENGAGED</span>
              </div>
            )}

            {/* Operator Info & Logout */}
            <div className="flex items-center gap-3 pl-2 border-l border-[#262626]">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white">{user.name}</div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{user.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 transition-colors cursor-pointer"
                title="End Operator Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-[#262626] overflow-x-auto px-4 py-2 gap-2">
          {(['overview', 'users', 'queues', 'agents', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                activeTab === tab ? 'bg-neutral-800 text-white' : 'text-neutral-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <Overview overview={overviewData} onRefresh={loadOverview} />}
        {activeTab === 'users' && <Users />}
        {activeTab === 'queues' && <Queues />}
        {activeTab === 'agents' && <Agents />}
        {activeTab === 'audit' && <Audit />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-4 bg-[#0B0B0B]">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-neutral-400">
          Outreach Intern Admin Console • Superadmin Session Verified • TOTP Enforced
        </div>
      </footer>
    </div>
  );
}
