import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  LogOut,
  Smartphone,
  Shield,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { authApi, AuthApiClientError } from '../utils/authApi';
import {
  COUNTRY_DIAL_OPTIONS,
  CountryCodeSelect,
  type CountryDialOption,
} from './CountryCodeSelect';
import type { ActiveSessionInfo, AuthenticatedUser } from '../types/auth';

interface AccountSecurityPanelProps {
  authUser: AuthenticatedUser;
  isDark: boolean;
  onUserUpdated: (user: AuthenticatedUser) => void;
  onLoggedOut: () => void;
}

export const AccountSecurityPanel: React.FC<AccountSecurityPanelProps> = ({
  authUser,
  isDark,
  onUserUpdated,
  onLoggedOut,
}) => {
  // Change mobile number (username) state
  const [changingPhone, setChangingPhone] = useState(false);
  const [newCountry, setNewCountry] = useState<CountryDialOption>(COUNTRY_DIAL_OPTIONS[0]);
  const [newPhone, setNewPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  // Active sessions state
  const [sessions, setSessions] = useState<ActiveSessionInfo[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Google link state
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [securityMsg, setSecurityMsg] = useState<string | null>(null);

  // Logout & account deletion state
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Change password state
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    if (nextPassword.trim().length < 6) {
      setPasswordStatus({
        type: 'error',
        text: 'New password must be at least 6 characters.',
      });
      return;
    }
    setPasswordBusy(true);
    try {
      const res = await authApi.changePassword({
        currentPassword: currentPassword || undefined,
        newPassword: nextPassword,
      });
      onUserUpdated(res.user);
      setChangingPassword(false);
      setCurrentPassword('');
      setNextPassword('');
      setPasswordStatus({
        type: 'success',
        text: 'Password updated successfully.',
      });
    } catch (err: unknown) {
      setPasswordStatus({
        type: 'error',
        text: err instanceof AuthApiClientError ? err.message : 'Failed to update password.',
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleUpdateMobileNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneStatus(null);
    if (!newPhone.trim()) {
      setPhoneStatus({ type: 'error', text: 'Enter the new mobile number.' });
      return;
    }

    setPhoneBusy(true);
    try {
      const res = await authApi.changePhoneNumber({
        newPhone: newPhone.trim(),
        countryIso: newCountry.iso,
        dialCode: newCountry.dialCode,
      });
      onUserUpdated(res.user);
      setChangingPhone(false);
      setNewPhone('');
      setPhoneStatus({
        type: 'success',
        text: `Mobile username updated to ${res.user.phoneNormalized}.`,
      });
    } catch (err: unknown) {
      setPhoneStatus({
        type: 'error',
        text: err instanceof AuthApiClientError ? err.message : 'Failed to update mobile number.',
      });
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleLoadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await authApi.listSessions();
      setSessions(res.sessions);
    } catch {
      setSecurityMsg('Unable to load active device sessions.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    setSecurityMsg(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      const res = await authApi.linkGoogleRecovery(token);
      onUserUpdated(res.user);
      setSecurityMsg('Google account linked for safe account recovery.');
    } catch (err: unknown) {
      if (err instanceof AuthApiClientError) {
        setSecurityMsg(err.message);
      } else {
        setSecurityMsg('Google sign-in was cancelled or could not be linked.');
      }
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleLogoutCurrent = async () => {
    setLoggingOut(true);
    try {
      await authApi.logoutCurrentDevice();
      onLoggedOut();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogoutAll = async () => {
    setLoggingOut(true);
    try {
      await authApi.logoutAllDevices();
      onLoggedOut();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deletePhrase !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      await authApi.deleteAccountPermanently();
      onLoggedOut();
    } catch (err: unknown) {
      setSecurityMsg(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-5 pt-4 border-t border-slate-700/30">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Account & Session Security
      </div>

      {/* Mobile Number Username & Direct Change Flow */}
      <div
        className={`p-3.5 rounded-xl border space-y-3 ${
          isDark ? 'bg-[#202c33]/70 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-400">Mobile Number (Username)</div>
            <div className="text-sm font-semibold tabular-nums mt-0.5">
              {authUser.phoneNormalized}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setChangingPhone(!changingPhone);
              setPhoneStatus(null);
            }}
            className="text-xs font-semibold text-[#00a884] hover:underline shrink-0"
          >
            {changingPhone ? 'Cancel' : 'Change Number'}
          </button>
        </div>

        {phoneStatus && (
          <div
            className={`text-xs flex items-start gap-1.5 ${
              phoneStatus.type === 'success' ? 'text-[#00a884]' : 'text-rose-400'
            }`}
          >
            {phoneStatus.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            )}
            <span>{phoneStatus.text}</span>
          </div>
        )}

        {changingPhone && (
          <form onSubmit={handleUpdateMobileNumber} className="space-y-2.5 pt-1">
            <label htmlFor="settings-new-phone" className="block text-xs font-medium text-slate-400">
              New Mobile Number (Updates Account Username)
            </label>
            <div className="flex items-center gap-2">
              <CountryCodeSelect
                id="settings-new-country"
                selectedIso={newCountry.iso}
                onSelect={setNewCountry}
                isDark={isDark}
              />
              <input
                id="settings-new-phone"
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder={newCountry.placeholder}
                className={`flex-1 h-11 px-3 rounded-xl border text-xs tabular-nums outline-none focus:border-[#00a884] ${
                  isDark
                    ? 'bg-[#111b21] border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={phoneBusy}
              className="w-full py-2 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {phoneBusy ? 'Updating...' : 'Update Mobile Number'}
            </button>
          </form>
        )}
      </div>

      {/* Password Security Card */}
      <div
        className={`p-3.5 rounded-xl border space-y-3 ${
          isDark ? 'bg-[#202c33]/70 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-[#00a884] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold">Account Password</div>
              <div className="text-[11px] text-slate-400">
                Required with your mobile number at login
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setChangingPassword(!changingPassword);
              setPasswordStatus(null);
            }}
            className="text-xs font-semibold text-[#00a884] hover:underline shrink-0"
          >
            {changingPassword ? 'Cancel' : 'Change'}
          </button>
        </div>

        {passwordStatus && (
          <div
            className={`text-xs flex items-start gap-1.5 ${
              passwordStatus.type === 'success' ? 'text-[#00a884]' : 'text-rose-400'
            }`}
          >
            {passwordStatus.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            )}
            <span>{passwordStatus.text}</span>
          </div>
        )}

        {changingPassword && (
          <form onSubmit={handleUpdatePassword} className="space-y-2.5 pt-1">
            {authUser.hasPassword !== false && (
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className={`w-full h-10 px-3 rounded-xl border text-xs outline-none focus:border-[#00a884] ${
                  isDark
                    ? 'bg-[#111b21] border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            )}
            <input
              type="password"
              required
              minLength={6}
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              className={`w-full h-10 px-3 rounded-xl border text-xs outline-none focus:border-[#00a884] ${
                isDark
                  ? 'bg-[#111b21] border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <button
              type="submit"
              disabled={passwordBusy}
              className="w-full py-2 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {passwordBusy ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>

      {/* Google Recovery Identity Link */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
          isDark ? 'bg-[#202c33]/70 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Shield className="w-4 h-4 text-[#00a884] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs font-semibold">Recovery Identity</div>
            <div className="text-[11px] text-slate-400 truncate">
              {authUser.hasGoogleLinked
                ? `Linked: ${authUser.email || 'Google Account'}`
                : 'Link Google to recover if mobile number changes'}
            </div>
          </div>
        </div>
        {!authUser.hasGoogleLinked && (
          <button
            type="button"
            disabled={linkingGoogle}
            onClick={handleLinkGoogle}
            className="px-3 py-1.5 rounded-lg bg-[#00a884]/15 text-[#00a884] hover:bg-[#00a884]/25 text-xs font-semibold shrink-0 transition-colors"
          >
            {linkingGoogle ? 'Linking...' : 'Link Google'}
          </button>
        )}
      </div>

      {securityMsg && <p className="text-xs text-[#00a884] px-1">{securityMsg}</p>}

      {/* Active Sessions Viewer */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">Active Device Sessions</span>
          <button
            type="button"
            onClick={handleLoadSessions}
            disabled={loadingSessions}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline"
          >
            <RefreshCw className={`w-3 h-3 ${loadingSessions ? 'animate-spin' : ''}`} />
            <span>{sessions ? 'Refresh' : 'View Devices'}</span>
          </button>
        </div>

        {sessions && (
          <div className="space-y-1.5">
            {sessions.map((s) => (
              <div
                key={s.sessionId}
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  isDark ? 'bg-[#202c33]/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {s.isCurrent ? 'Current Browser Session' : 'Signed-in Device'}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      Last active {new Date(s.lastActiveAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session Logout Buttons */}
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={loggingOut}
          onClick={handleLogoutCurrent}
          className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
            isDark
              ? 'border-slate-700 bg-[#202c33] hover:bg-[#2a3942] text-white'
              : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
          }`}
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          <span>Log Out (This Device)</span>
        </button>

        <button
          type="button"
          disabled={loggingOut}
          onClick={handleLogoutAll}
          className="w-full py-2.5 px-4 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out From All Devices</span>
        </button>
      </div>

      {/* Lifetime Account Deletion */}
      <div className="pt-2 border-t border-slate-700/30">
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2 text-xs text-rose-400/80 hover:text-rose-400 font-medium transition-colors"
          >
            Request Permanent Account Deletion
          </button>
        ) : (
          <form
            onSubmit={handleDeleteAccount}
            className="p-3 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-2.5"
          >
            <p className="text-xs text-rose-200 leading-relaxed">
              This permanently removes your lifetime ZOLO account, mobile registration, and saved
              chat data. Type <span className="font-mono font-bold">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm account deletion"
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border outline-none ${
                isDark
                  ? 'bg-[#111b21] border-rose-500/40 text-white'
                  : 'bg-white border-rose-300 text-slate-900'
              }`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePhrase('');
                }}
                className="flex-1 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deletePhrase !== 'DELETE' || deletingAccount}
                className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingAccount ? 'Deleting...' : 'Delete Forever'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
