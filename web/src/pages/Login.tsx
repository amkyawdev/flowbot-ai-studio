import { useEffect, useState } from 'react';
import {
  Workflow, Mail, Lock, Eye, EyeOff, ShieldCheck, UserRound, Download, Smartphone, ArrowLeft,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { authApi } from '@/api/client';
import type { OtpStatus } from '@/api/client';

const APP_DOWNLOAD_URL = (import.meta.env.VITE_APP_DOWNLOAD_URL as string | undefined)
  || 'https://github.com/amkyawdev/flowbot-ai-studio/releases/download/v1.2.1/app-debug.apk';

type Mode = 'login' | 'register';
type SignInMethod = 'password' | 'code';
type OtpStep = { email: string; purpose: 'login' | 'register'; devCode?: string };

export function LoginPage() {
  const { login, register, toast, completeAuth } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otpStatus, setOtpStatus] = useState<OtpStatus | null>(null);
  const [otp, setOtp] = useState<OtpStep | null>(null);
  const [code, setCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    authApi.otpStatus()
      .then(setOtpStatus)
      .catch(() => setOtpStatus({ available: false, mode: 'optional' }));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const otpAvailable = otpStatus?.available === true;

  function resetOtp() {
    setOtp(null);
    setCode('');
    setOtpError(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSignInMethod('password');
    resetOtp();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        const outcome = await login(email, password);
        if (outcome.otpRequired) {
          setOtp({ email: outcome.email || email, purpose: 'login', devCode: outcome.devCode });
          setCode('');
          setOtpError(null);
          setResendIn(30);
        }
      } else {
        const outcome = await register(email, password, displayName || undefined);
        if (outcome.warning) toast(outcome.warning, 'info');
        if (outcome.otpRequired) {
          setOtp({ email, purpose: 'register', devCode: outcome.devCode });
          setCode('');
          setOtpError(null);
          setResendIn(30);
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(targetEmail: string, purpose: 'login' | 'register') {
    const clean = targetEmail.trim().toLowerCase();
    if (!clean) { setOtpError('Enter your email first'); return; }
    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await authApi.requestOtp({ email: clean, purpose });
      setOtp({ email: clean, purpose, devCode: res.devCode });
      setCode('');
      setResendIn(30);
      toast('Code sent. Check your email.', 'success');
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setOtpBusy(false);
    }
  }

  async function verify() {
    if (!otp) return;
    if (!/^\d{6}$/.test(code)) { setOtpError('Enter the 6-digit code'); return; }
    setOtpBusy(true);
    setOtpError(null);
    try {
      const session = await authApi.verifyOtp({ email: otp.email, code, purpose: otp.purpose });
      completeAuth(session.token, session.user);
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-orb one" />
      <div className="login-orb two" />

      <div className="login-stage">
        <div className="login-mark"><Workflow size={30} /></div>
        <h1 className="login-title">FlowBot AI Studio</h1>
        <p className="login-subtitle">Design automations. Connect Telegram. Ship on Cloudflare.</p>

        <div className="login-card">
          {otp ? (
            <div>
              <div className="otp-head">
                <div className="login-mark" style={{ width: 54, height: 54, margin: '0 auto 12px' }}><ShieldCheck size={24} /></div>
                <h2>{otp.purpose === 'register' ? 'Verify your email' : 'Enter your sign-in code'}</h2>
                <p>We sent a 6-digit code to <b>{otp.email}</b>.</p>
              </div>

              <div className="field">
                <label htmlFor="otp-code">Verification code</label>
                <input
                  id="otp-code"
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                />
              </div>

              {otp.devCode && <div className="hint" style={{ textAlign: 'center' }}>Dev code: {otp.devCode}</div>}
              {otpError && <div className="chat-error" role="alert" style={{ marginBottom: 10 }}>{otpError}</div>}

              <button className="auth-submit" onClick={() => void verify()} disabled={otpBusy}>
                {otpBusy ? <span className="spinner" style={{ borderColor: 'rgba(5,18,28,0.3)', borderTopColor: '#05121c' }} /> : 'Verify & continue'}
              </button>

              <div className="otp-actions">
                <button className="btn btn-ghost" onClick={() => void sendCode(otp.email, otp.purpose)} disabled={otpBusy || resendIn > 0}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
                <button className="btn btn-ghost" onClick={resetOtp}><ArrowLeft size={15} /> Back</button>
              </div>
            </div>
          ) : (
            <>
              <div className="auth-switch">
                <span className={`glider ${mode === 'register' ? 'right' : ''}`} />
                <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
                <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button>
              </div>

              {mode === 'login' && signInMethod === 'code' ? (
                <form onSubmit={(e) => { e.preventDefault(); void sendCode(email, 'login'); }}>
                  <div className="login-field" style={{ marginBottom: 14 }}>
                    <label htmlFor="otp-email">Email</label>
                    <div className="login-input-wrap">
                      <Mail size={17} />
                      <input
                        id="otp-email"
                        className="login-input"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  {otpError && <div className="chat-error" role="alert" style={{ marginBottom: 10 }}>{otpError}</div>}
                  <button className="auth-submit" disabled={otpBusy} type="submit">
                    {otpBusy ? <span className="spinner" style={{ borderColor: 'rgba(5,18,28,0.3)', borderTopColor: '#05121c' }} /> : 'Send code'}
                  </button>
                  <div className="auth-alt">
                    <button type="button" onClick={() => { setSignInMethod('password'); setOtpError(null); }}>Use password instead</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={submit}>
                  {mode === 'register' && (
                    <div className="login-field" style={{ marginBottom: 14 }}>
                      <label htmlFor="auth-name">Display name</label>
                      <div className="login-input-wrap">
                        <UserRound size={17} />
                        <input id="auth-name" className="login-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane" autoComplete="name" />
                      </div>
                    </div>
                  )}
                  <div className="login-field" style={{ marginBottom: 14 }}>
                    <label htmlFor="auth-email">Email</label>
                    <div className="login-input-wrap">
                      <Mail size={17} />
                      <input id="auth-email" className="login-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                    </div>
                  </div>
                  <div className="login-field" style={{ marginBottom: 18 }}>
                    <label htmlFor="auth-password">Password</label>
                    <div className="login-input-wrap">
                      <Lock size={17} />
                      <input id="auth-password" className="login-input" type={showPw ? 'text' : 'password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} style={{ paddingRight: 52 }} />
                      <button type="button" className="login-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <button className="auth-submit" disabled={busy} type="submit">
                    {busy ? <span className="spinner" style={{ borderColor: 'rgba(5,18,28,0.3)', borderTopColor: '#05121c' }} /> : mode === 'login' ? 'Sign in' : 'Create account'}
                  </button>

                  {mode === 'login' && otpAvailable && (
                    <div className="auth-alt">
                      <button type="button" onClick={() => { setSignInMethod('code'); setOtpError(null); }}>Sign in with an email code</button>
                    </div>
                  )}
                  {mode === 'login' && otpStatus && !otpAvailable && (
                    <div className="otp-hint">Email code sign-in is not configured.</div>
                  )}
                  {mode === 'register' && (
                    <div className="otp-hint">
                      {otpAvailable ? "We'll email you a 6-digit verification code." : 'Email verification is not configured; you can sign in with your password.'}
                    </div>
                  )}
                </form>
              )}

              {mode === 'register' && (
                <div className="auth-download">
                  <div className="auth-download-head"><Smartphone size={15} /> Get the Android app</div>
                  <a className="btn auth-download-btn" href={APP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                    <Download size={17} /> Download App
                  </a>
                  <a className="auth-download-url" href={APP_DOWNLOAD_URL} target="_blank" rel="noreferrer" title={APP_DOWNLOAD_URL}>
                    {APP_DOWNLOAD_URL}
                  </a>
                </div>
              )}

              <div className="auth-foot">
                <ShieldCheck size={15} />
                Encrypted, scoped to your workspace
              </div>
              {mode === 'login' && (
                <a className="auth-download-link" href={APP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                  <Smartphone size={14} /> Download the Android app
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
