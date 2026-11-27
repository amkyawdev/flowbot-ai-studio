import { useState } from 'react';
import { Workflow, Mail, Lock, Eye, EyeOff, ShieldCheck, UserRound } from 'lucide-react';
import { useApp } from '@/store/app';

export function LoginPage() {
  const { login, register, toast } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName || undefined);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
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
          <div className="auth-switch">
            <span className={`glider ${mode === 'register' ? 'right' : ''}`} />
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>

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
          </form>

          <div className="auth-foot">
            <ShieldCheck size={15} />
            Encrypted, scoped to your workspace
          </div>
        </div>
      </div>
    </div>
  );
}