import React, { useState } from 'react';
import { Shield, KeyRound, AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<{ mfaToken: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.mfaRequired) {
        setMfaChallenge(res);
      } else if (res.accessToken) {
        setAuthToken(res.accessToken);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest('/api/v1/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({
          mfaToken: mfaChallenge.mfaToken,
          code: totpCode.trim(),
          isRecoveryCode,
        }),
      });
      if (res.accessToken) {
        setAuthToken(res.accessToken);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-[#141414] border border-[#262626] rounded-2xl p-8 shadow-2xl">
        {/* Header Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Outreach Intern</h1>
          <p className="text-xs uppercase tracking-widest text-neutral-400 mt-1 font-semibold">
            Operator Admin Console
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400 font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {!mfaChallenge ? (
          /* Step 1: Email & Password */
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Administrator Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@outreachintern.local"
                className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 transition-colors font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-red-500/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Authenticate Operator</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: TOTP MFA Challenge */
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="text-xs text-neutral-400">
                <span className="font-semibold text-neutral-200">Mandatory 2FA Active: </span>
                Enter the code from your authenticator app.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                {isRecoveryCode ? 'Single-Use Recovery Code' : '6-Digit TOTP Code'}
              </label>
              <input
                type="text"
                required
                autoFocus
                maxLength={isRecoveryCode ? 16 : 6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\s+/g, ''))}
                placeholder={isRecoveryCode ? 'abcd1234ef5678' : '123456'}
                className="w-full bg-[#0B0B0B] border border-[#262626] rounded-xl px-4 py-3 text-center text-lg tracking-widest text-white placeholder-neutral-700 focus:outline-none focus:border-red-500 transition-colors font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-red-500/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Verify & Access Console</span>
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setIsRecoveryCode(!isRecoveryCode)}
                className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
              >
                {isRecoveryCode ? 'Use 6-digit TOTP instead' : 'Use a backup recovery code'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-[#262626] text-center">
          <p className="text-[11px] text-neutral-400">
            Private Operator Surface • Self-registration disabled • Audited session
          </p>
        </div>
      </div>
    </div>
  );
}
