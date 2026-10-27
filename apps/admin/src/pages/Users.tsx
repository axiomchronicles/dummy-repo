import { useState, useEffect } from 'react';
import {
  UserPlus,
  Shield,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';
import { apiRequest } from '../lib/api';

export function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite Modal
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('operator');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset MFA Modal
  const [resetMfaUser, setResetMfaUser] = useState<any | null>(null);
  const [resetMfaReason, setResetMfaReason] = useState('');
  const [resetMfaLoading, setResetMfaLoading] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/api/v1/admin/users');
      setUsers(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load user directory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const res = await apiRequest('/api/v1/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          name: inviteName.trim(),
          role: inviteRole,
        }),
      });
      setInviteResult(res);
      loadUsers();
    } catch (err: any) {
      alert(`Invitation failed: ${err.message}`);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleResetMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetMfaUser) return;
    setResetMfaLoading(true);
    try {
      await apiRequest(`/api/v1/admin/users/${resetMfaUser.id}/reset-mfa`, {
        method: 'POST',
        body: JSON.stringify({
          reason: resetMfaReason.trim() || 'Admin-initiated security reset',
        }),
      });
      alert(`MFA reset successful for ${resetMfaUser.email}. User must re-enroll on next sign-in.`);
      setResetMfaUser(null);
      setResetMfaReason('');
      loadUsers();
    } catch (err: any) {
      alert(`MFA reset failed: ${err.message}`);
    } finally {
      setResetMfaLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">User Directory & Provisioning</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Admin-only provisioning. Self-registration is disabled across all interfaces.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadUsers}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
            title="Refresh users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setInviteResult(null);
              setInviteModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-red-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision User</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="bg-[#1A1A1A] border-b border-[#262626] text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Operator / User</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">MFA State</th>
                <th className="py-3.5 px-4">User ID</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500">
                    Loading users directory...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-900/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-white">{u.name}</div>
                      <div className="text-xs text-neutral-400">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                          u.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {u.mfaEnabled ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>TOTP Active</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          <span>Pending Setup</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-neutral-500">
                      {u.id.substring(0, 8)}...
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setResetMfaUser(u);
                          setResetMfaReason('');
                        }}
                        className="text-xs text-neutral-400 hover:text-red-400 transition-colors cursor-pointer underline"
                      >
                        Reset MFA
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite User Modal */}
      {inviteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#262626] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Provision New Operator</h3>
            <p className="text-xs text-neutral-400 mb-6">
              Create an operator invitation. Upon first sign-in, mandatory TOTP setup will be enforced.
            </p>

            {inviteResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                  Invitation generated successfully!
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1">
                    Invitation Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteResult.invitation?.token || 'INVITE_GENERATED'}
                      className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-3 py-2 text-xs text-neutral-300 font-mono"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteResult.invitation?.token || '');
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white"
                      title="Copy Token"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setInviteModal(false);
                      setInviteResult(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1">
                    Full Name
                  </label>
                  <input
                    required
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1">
                    Corporate Email
                  </label>
                  <input
                    required
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="jane@outreachintern.local"
                    className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="operator">Operator (Calls, Compose, Review)</option>
                    <option value="admin">Admin (User Provisioning)</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setInviteModal(false)}
                    className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {inviteLoading ? 'Creating...' : 'Create Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset MFA Modal */}
      {resetMfaUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Reset User Two-Factor MFA</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              Resetting MFA for <span className="font-semibold text-white">{resetMfaUser.email}</span> will
              clear their current TOTP secret. They will be mandated to scan a new QR code on next login.
            </p>
            <form onSubmit={handleResetMfaSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase mb-1">
                  Security Reason Log
                </label>
                <textarea
                  required
                  rows={2}
                  value={resetMfaReason}
                  onChange={(e) => setResetMfaReason(e.target.value)}
                  placeholder="e.g. Lost device verified by IT helpdesk ticket #4092..."
                  className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetMfaUser(null)}
                  className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetMfaLoading}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-sm font-bold disabled:opacity-50"
                >
                  {resetMfaLoading ? 'Resetting...' : 'Confirm MFA Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
