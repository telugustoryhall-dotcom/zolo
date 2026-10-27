import React, { useState, useRef } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  Camera,
  Trash2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Copy,
  Download,
  Check,
  Sun,
  Moon,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { ZoloLogo } from './ZoloLogo';
import {
  COUNTRY_DIAL_OPTIONS,
  CountryCodeSelect,
  type CountryDialOption,
} from './CountryCodeSelect';
import { AvatarCropperModal } from './AvatarCropperModal';
import { UserAvatar } from './UserAvatar';
import { authApi, AuthApiClientError } from '../utils/authApi';
import type { AuthenticatedUser, PersistedChatBundle } from '../types/auth';

interface AuthScreenProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAuthenticated: (payload: {
    user: AuthenticatedUser;
    chatState: PersistedChatBundle | null;
  }) => void;
}

type AuthMode = 'login' | 'signup' | 'recover';
type FlowStep = 'form' | 'recovery_key_issued';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  onToggleTheme,
  onAuthenticated,
}) => {
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<FlowStep>('form');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState<CountryDialOption>(COUNTRY_DIAL_OPTIONS[0]); // Default India +91
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Avatar upload & crop state
  const [rawCropFile, setRawCropFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  // Recovery mode fields
  const [oldCountry, setOldCountry] = useState<CountryDialOption>(COUNTRY_DIAL_OPTIONS[0]);
  const [oldPhone, setOldPhone] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [linkedGoogleToken, setLinkedGoogleToken] = useState<string | null>(null);
  const [linkedGoogleEmail, setLinkedGoogleEmail] = useState<string | null>(null);

  // Issued recovery key post-signup / post-recovery
  const [issuedRecoveryKey, setIssuedRecoveryKey] = useState<string | null>(null);
  const [pendingAuthResult, setPendingAuthResult] = useState<{
    user: AuthenticatedUser;
    chatState: PersistedChatBundle | null;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Feedback & errors
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  const clearErrors = () => {
    setErrorMsg(null);
    setErrorCode(undefined);
  };

  const switchMode = (nextMode: AuthMode, keepPhone = false) => {
    clearErrors();
    setMode(nextMode);
    setStep('form');
    if (!keepPhone) {
      setErrorCode(undefined);
    }
  };

  const handleAvatarFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearErrors();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Profile picture must be 5 MB or smaller.');
      return;
    }
    setRawCropFile(file);
  };

  const handleConfirmCroppedAvatar = async (blob: Blob, previewDataUrl: string) => {
    setRawCropFile(null);
    setAvatarPreviewUrl(previewDataUrl);
    setUploadingAvatar(true);
    clearErrors();
    try {
      const res = await authApi.uploadAvatar(blob, 'profile_avatar.webp');
      setUploadedAvatarUrl(res.url);
    } catch (err: unknown) {
      setAvatarPreviewUrl(null);
      setUploadedAvatarUrl(null);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreviewUrl(null);
    setUploadedAvatarUrl(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (mode !== 'recover' && !phone.trim()) {
      setErrorMsg('Please enter your mobile number.');
      return;
    }

    if (mode === 'login') {
      if (password.length < 6) {
        setErrorMsg('Please enter your password (at least 6 characters).');
        return;
      }
    }

    if (mode === 'signup') {
      if (fullName.trim().length < 2) {
        setErrorMsg('Please enter your full name (at least 2 characters).');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter.');
        return;
      }
      if (uploadingAvatar) {
        setErrorMsg('Please wait for your profile picture upload to finish.');
        return;
      }
    }

    if (mode === 'recover') {
      if (!oldPhone.trim()) {
        setErrorMsg('Enter your registered mobile number.');
        return;
      }
      if (!recoveryKeyInput.trim() && !linkedGoogleToken) {
        setErrorMsg('Provide your ZOLO Recovery Key or verify your linked Google account.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Please enter a new password (at least 6 characters).');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await authApi.loginWithMobile({
          phone: phone.trim(),
          countryIso: country.iso,
          dialCode: country.dialCode,
          password,
        });
        onAuthenticated({ user: res.user, chatState: res.chatState });
        return;
      }

      if (mode === 'signup') {
        const created = await authApi.signupWithMobile({
          fullName: fullName.trim(),
          phone: phone.trim(),
          countryIso: country.iso,
          dialCode: country.dialCode,
          password,
          avatarUrl: uploadedAvatarUrl,
        });

        setIssuedRecoveryKey(created.recoveryKey);
        setPendingAuthResult({ user: created.user, chatState: created.chatState });
        setStep('recovery_key_issued');
        return;
      }

      if (mode === 'recover') {
        const effectiveNewPhone = phone.trim() ? phone.trim() : oldPhone.trim();
        const effectiveNewCountry = phone.trim() ? country : oldCountry;
        const recovered = await authApi.recoverAccount({
          oldPhone: oldPhone.trim(),
          oldCountryIso: oldCountry.iso,
          oldDialCode: oldCountry.dialCode,
          recoveryKey: recoveryKeyInput.trim() || undefined,
          firebaseIdToken: linkedGoogleToken || undefined,
          newPhone: effectiveNewPhone,
          newCountryIso: effectiveNewCountry.iso,
          newDialCode: effectiveNewCountry.dialCode,
          newPassword: password,
        });

        setIssuedRecoveryKey(recovered.recoveryKey);
        setPendingAuthResult({ user: recovered.user, chatState: recovered.chatState });
        setStep('recovery_key_issued');
      }
    } catch (err: unknown) {
      if (err instanceof AuthApiClientError) {
        setErrorMsg(err.message);
        setErrorCode(err.code);
      } else {
        setErrorMsg('Authentication request failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleRecoveryVerify = async () => {
    clearErrors();
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setLinkedGoogleToken(idToken);
      setLinkedGoogleEmail(cred.user.email || 'Google account verified');
    } catch {
      setErrorMsg('Google sign-in was cancelled or could not be completed.');
    }
  };

  const handleDownloadRecoveryKey = () => {
    if (!issuedRecoveryKey || !pendingAuthResult) return;
    const text = [
      'ZOLO Chat - Lifetime Account Recovery Key',
      '=========================================',
      `Account Name: ${pendingAuthResult.user.fullName}`,
      `Mobile Username: ${pendingAuthResult.user.phoneNormalized}`,
      `Recovery Key: ${issuedRecoveryKey}`,
      '',
      'Store this key in a safe place. You can use it if you ever need to move your account to a new mobile number.',
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ZOLO_Recovery_Key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewCleanDigits = phone.replace(/\D/g, '').replace(/^0+/, '');
  const formattedMobileHandle = previewCleanDigits
    ? `${country.dialCode}${previewCleanDigits}`
    : `${country.dialCode}${country.placeholder.replace(/\D/g, '')}`;

  return (
    <div
      className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-200 ${
        isDark ? 'bg-[#0c1317] text-white' : 'bg-[#e8ecef] text-slate-900'
      }`}
    >
      {/* Top Accent Bar matching ZOLO Desktop Header */}
      <div className="w-full h-2 bg-[#00a884] shrink-0" />

      {/* Top Utility Bar */}
      <header className="w-full max-w-[1160px] mx-auto px-6 pt-5 pb-2 flex items-center justify-between">
        <ZoloLogo variant="full" theme={theme} className="h-9 w-auto" />
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
            isDark
              ? 'bg-[#111b21] border-slate-800 text-slate-300 hover:bg-[#202c33]'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
          }`}
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-700" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
      </header>

      {/* Main Split Content Container */}
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-6 lg:py-10 flex items-center">
        <div
          className={`w-full rounded-2xl border shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 ${
            isDark ? 'bg-[#111b21] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Left Editorial Overview Column (Desktop) */}
          <div
            className={`hidden lg:flex lg:col-span-5 p-10 flex-col justify-between border-r ${
              isDark
                ? 'bg-[#182229] border-slate-800/80 text-slate-200'
                : 'bg-[#f7f9fa] border-slate-200 text-slate-800'
            }`}
          >
            <div className="space-y-6">
              <ZoloLogo variant="icon" theme={theme} className="w-14 h-14" />
              <div className="space-y-3">
                <h1 className="text-2xl xl:text-3xl font-bold tracking-tight leading-snug">
                  Your mobile number is your lifetime ZOLO username.
                </h1>
                <p
                  className={`text-sm leading-relaxed ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Create your account once with your mobile number and profile photo, and pick up
                  your conversations, voice notes, polls, and calls seamlessly whenever you sign in.
                </p>
              </div>

              <div
                className={`pt-6 border-t space-y-5 text-sm ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="font-semibold mb-0.5">01. Mobile Number Username</div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Every account is uniquely bound to one normalized E.164 mobile number—no codes
                    or passwords to juggle.
                  </p>
                </div>
                <div>
                  <div className="font-semibold mb-0.5">02. Cloud Synced Profile & Chats</div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Your profile picture, display name, and chat history stay persistently stored
                    across sessions.
                  </p>
                </div>
                <div>
                  <div className="font-semibold mb-0.5">03. Protected Device Sessions</div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Manage active logins with instant single-device or all-device sign-out and
                    recovery key protection.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-[#00a884] shrink-0" />
              <span>End-to-end encrypted messaging architecture</span>
            </div>
          </div>

          {/* Right Interactive Auth Form Column */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            {step === 'recovery_key_issued' && issuedRecoveryKey && pendingAuthResult ? (
              /* Post-Signup / Post-Recovery Key Confirmation */
              <div className="max-w-md w-full mx-auto space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    Account Ready — Save Your Recovery Key
                  </h2>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Your lifetime ZOLO account for{' '}
                    <span className="font-semibold text-[#00a884] tabular-nums">
                      {pendingAuthResult.user.phoneNormalized}
                    </span>{' '}
                    is active. Keep this recovery key safe in case you ever switch mobile numbers.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl border font-mono text-base sm:text-lg font-bold tracking-wider text-center select-all ${
                    isDark
                      ? 'bg-[#202c33] border-slate-700 text-emerald-300'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {issuedRecoveryKey}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(issuedRecoveryKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      isDark
                        ? 'border-slate-700 bg-[#202c33] hover:bg-[#2a3942] text-white'
                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    {copiedKey ? (
                      <>
                        <Check className="w-4 h-4 text-[#00a884]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Key</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadRecoveryKey}
                    className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      isDark
                        ? 'border-slate-700 bg-[#202c33] hover:bg-[#2a3942] text-white'
                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Download .txt</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onAuthenticated(pendingAuthResult)}
                  className="w-full py-3 px-5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  <span>Open ZOLO Chat</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="max-w-md w-full mx-auto space-y-6">
                {/* Mode Segmented Control */}
                {mode !== 'recover' && (
                  <div
                    role="tablist"
                    aria-label="Authentication mode"
                    className={`grid grid-cols-2 p-1 rounded-xl border ${
                      isDark
                        ? 'bg-[#182229] border-slate-800'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'login'}
                      onClick={() => switchMode('login', true)}
                      className={`py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                        mode === 'login'
                          ? isDark
                            ? 'bg-[#2a3942] text-white shadow-sm'
                            : 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Log In
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'signup'}
                      onClick={() => switchMode('signup', true)}
                      className={`py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                        mode === 'signup'
                          ? isDark
                            ? 'bg-[#2a3942] text-white shadow-sm'
                            : 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>
                )}

                {/* Heading */}
                <div className="space-y-1">
                  {mode === 'signup' ? (
                    <>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                        Create your lifetime account
                      </h2>
                      <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Enter your full name and mobile number—your mobile number becomes your
                        unique ZOLO username.
                      </p>
                    </>
                  ) : mode === 'recover' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00a884] hover:underline mb-2"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Log In</span>
                      </button>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                        Account Recovery
                      </h2>
                      <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Verify ownership with your Recovery Key or linked Google account and move
                        your account to a new mobile number.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                        Welcome back to ZOLO
                      </h2>
                      <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Enter your registered mobile number username to sign in instantly.
                      </p>
                    </>
                  )}
                </div>

                {/* Error & Actionable Duplicate / Account-Not-Found Banners */}
                {errorMsg && (
                  <div
                    role="alert"
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-2.5 ${
                      isDark
                        ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <p className="font-medium flex-1">{errorMsg}</p>
                    </div>

                    {errorCode === 'PHONE_ALREADY_REGISTERED' && mode === 'signup' && (
                      <button
                        type="button"
                        onClick={() => switchMode('login', true)}
                        className="w-full py-2 px-3 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>Log in with {country.dialCode} {phone} instead</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {errorCode === 'ACCOUNT_NOT_FOUND' && mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          switchMode('signup', true);
                          setConfirmPassword(password);
                        }}
                        className="w-full py-2.5 px-3 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                      >
                        <span>Create an account with {country.dialCode} {phone}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Test Accounts for Instant 1-Click Login */}
                {mode === 'login' && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      isDark
                        ? 'bg-[#182229]/60 border-slate-700/60 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <span>Quick Test Accounts</span>
                      <span className="text-[#00a884] font-medium">Tap to fill &amp; test</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearErrors();
                          setCountry(COUNTRY_DIAL_OPTIONS[0]); // India +91
                          setPhone('7032594025');
                          setPassword('password123');
                        }}
                        className={`p-2 rounded-lg border text-left transition-colors flex flex-col ${
                          isDark
                            ? 'bg-[#202c33] border-slate-700 hover:border-[#00a884]'
                            : 'bg-white border-slate-300 hover:border-[#008069]'
                        }`}
                      >
                        <span className="font-bold text-xs truncate">Pravin Kampelly</span>
                        <span className="text-[11px] text-slate-400 font-mono">+91 70325 94025</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearErrors();
                          setCountry(COUNTRY_DIAL_OPTIONS[0]); // India +91
                          setPhone('7032592832');
                          setPassword('password123');
                        }}
                        className={`p-2 rounded-lg border text-left transition-colors flex flex-col ${
                          isDark
                            ? 'bg-[#202c33] border-slate-700 hover:border-[#00a884]'
                            : 'bg-white border-slate-300 hover:border-[#008069]'
                        }`}
                      >
                        <span className="font-bold text-xs truncate">Viplav Kampelly</span>
                        <span className="text-[11px] text-slate-400 font-mono">+91 70325 92832</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* DIRECT MOBILE NUMBER FORM */}
                <form onSubmit={handleSubmitForm} className="space-y-4">
                  {/* Signup Profile Picture Upload + Preview */}
                  {mode === 'signup' && (
                    <div className="flex items-center gap-4 pb-1">
                      <div className="relative group">
                        <button
                          type="button"
                          onClick={() => avatarFileInputRef.current?.click()}
                          aria-label="Upload profile picture"
                          className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]"
                        >
                          <UserAvatar
                            src={avatarPreviewUrl || uploadedAvatarUrl}
                            name={fullName}
                            className="w-16 h-16 border-2 border-[#00a884]"
                            textClassName="text-lg"
                          />
                          <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow">
                            {uploadingAvatar ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Camera className="w-3.5 h-3.5" />
                            )}
                          </span>
                        </button>
                        <input
                          ref={avatarFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarFileChosen}
                          className="hidden"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">Profile Picture (Optional)</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          JPG, PNG, or WebP up to 5 MB. Drag to crop before upload.
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <button
                            type="button"
                            onClick={() => avatarFileInputRef.current?.click()}
                            className="text-xs font-semibold text-[#00a884] hover:underline"
                          >
                            {avatarPreviewUrl ? 'Change photo' : 'Upload photo'}
                          </button>
                          {avatarPreviewUrl && (
                            <button
                              type="button"
                              onClick={handleRemoveAvatar}
                              className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Signup Full Name */}
                  {mode === 'signup' && (
                    <div>
                      <label
                        htmlFor="signup-full-name"
                        className="block text-xs font-semibold mb-1.5"
                      >
                        Full Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="signup-full-name"
                        type="text"
                        required
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => {
                          clearErrors();
                          setFullName(e.target.value);
                        }}
                        placeholder="e.g. Aarav Sharma"
                        className={`w-full h-11 px-3.5 rounded-xl border text-sm outline-none transition-colors focus:border-[#00a884] ${
                          isDark
                            ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                            : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  )}

                  {/* Recovery Mode: Old Phone + Recovery Key / Google */}
                  {mode === 'recover' && (
                    <>
                      <div>
                        <label
                          htmlFor="recover-old-phone"
                          className="block text-xs font-semibold mb-1.5"
                        >
                          Previously Registered Mobile Number
                        </label>
                        <div className="flex items-center gap-2">
                          <CountryCodeSelect
                            id="recover-old-country"
                            selectedIso={oldCountry.iso}
                            onSelect={setOldCountry}
                            isDark={isDark}
                          />
                          <input
                            id="recover-old-phone"
                            type="tel"
                            inputMode="tel"
                            required
                            value={oldPhone}
                            onChange={(e) => {
                              clearErrors();
                              setOldPhone(e.target.value);
                            }}
                            placeholder={oldCountry.placeholder}
                            className={`flex-1 h-11 px-3.5 rounded-xl border text-sm tabular-nums outline-none transition-colors focus:border-[#00a884] ${
                              isDark
                                ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="recover-key-input"
                          className="block text-xs font-semibold"
                        >
                          Account Recovery Key
                        </label>
                        <input
                          id="recover-key-input"
                          type="text"
                          value={recoveryKeyInput}
                          onChange={(e) => {
                            clearErrors();
                            setRecoveryKeyInput(e.target.value);
                          }}
                          placeholder="ZOLO-XXXX-XXXX-XXXX"
                          className={`w-full h-11 px-3.5 rounded-xl border font-mono text-sm uppercase outline-none transition-colors focus:border-[#00a884] ${
                            isDark
                              ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-400">
                            {linkedGoogleEmail
                              ? `Verified Google: ${linkedGoogleEmail}`
                              : 'Or verify with your linked Google recovery identity:'}
                          </span>
                          <button
                            type="button"
                            onClick={handleGoogleRecoveryVerify}
                            className="text-xs font-semibold text-[#00a884] hover:underline"
                          >
                            {linkedGoogleToken ? 'Re-verify Google' : 'Use Google'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Mobile Number = Username Input (Default India +91) */}
                  <div>
                    <label htmlFor="auth-phone-input" className="block text-xs font-semibold mb-1.5">
                      {mode === 'recover'
                        ? 'New Mobile Number (Leave blank to keep same number)'
                        : 'Mobile Number (Username)'}{' '}
                      {mode !== 'recover' && <span className="text-rose-400">*</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      <CountryCodeSelect
                        id="auth-country-select"
                        selectedIso={country.iso}
                        onSelect={(c) => {
                          clearErrors();
                          setCountry(c);
                        }}
                        isDark={isDark}
                      />
                      <input
                        id="auth-phone-input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        required={mode !== 'recover'}
                        value={phone}
                        onChange={(e) => {
                          clearErrors();
                          setPhone(e.target.value);
                        }}
                        placeholder={
                          mode === 'recover'
                            ? 'Optional — enter only if changing number'
                            : country.placeholder
                        }
                        className={`flex-1 h-11 px-3.5 rounded-xl border text-sm tabular-nums outline-none transition-colors focus:border-[#00a884] ${
                          isDark
                            ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                            : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {mode === 'signup' ? (
                        <>
                          Account username:{' '}
                          <span className="font-semibold text-[#00a884] tabular-nums">
                            {formattedMobileHandle}
                          </span>
                        </>
                      ) : mode === 'recover' ? (
                        'Reset your password or transfer your account to a new mobile number.'
                      ) : (
                        'Enter your registered ZOLO mobile number.'
                      )}
                    </p>
                  </div>

                  {/* Password Input (Required for Signup, Login & Recovery) */}
                  <div>
                    <label
                      htmlFor="auth-password-input"
                      className="block text-xs font-semibold mb-1.5"
                    >
                      {mode === 'signup'
                        ? 'Create Password'
                        : mode === 'recover'
                        ? 'New Password'
                        : 'Password'}{' '}
                      <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                      <input
                        id="auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => {
                          clearErrors();
                          setPassword(e.target.value);
                        }}
                        placeholder={
                          mode === 'login'
                            ? 'Enter your password'
                            : 'Minimum 6 characters'
                        }
                        className={`w-full h-11 pl-10 pr-10 rounded-xl border text-sm outline-none transition-colors focus:border-[#00a884] ${
                          isDark
                            ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                            : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 p-1 text-slate-400 hover:text-[#00a884] transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password on Signup */}
                  {mode === 'signup' && (
                    <div>
                      <label
                        htmlFor="signup-confirm-password"
                        className="block text-xs font-semibold mb-1.5"
                      >
                        Confirm Password <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                        <input
                          id="signup-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => {
                            clearErrors();
                            setConfirmPassword(e.target.value);
                          }}
                          placeholder="Re-enter your password"
                          className={`w-full h-11 pl-10 pr-4 rounded-xl border text-sm outline-none transition-colors focus:border-[#00a884] ${
                            isDark
                              ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || uploadingAvatar}
                    className="w-full h-11 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {mode === 'signup'
                            ? 'Creating Account...'
                            : mode === 'recover'
                            ? 'Recovering Account...'
                            : 'Signing In...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          {mode === 'signup'
                            ? 'Create Account'
                            : mode === 'recover'
                            ? 'Reset Password & Recover'
                            : 'Log In'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {mode === 'login' && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => switchMode('recover', true)}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#00a884] transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Forgot password or changed mobile number? Recover account</span>
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Avatar Drag-to-Crop Modal */}
      {rawCropFile && (
        <AvatarCropperModal
          imageFile={rawCropFile}
          isDark={isDark}
          onCancel={() => setRawCropFile(null)}
          onConfirmCrop={handleConfirmCroppedAvatar}
        />
      )}
    </div>
  );
};
