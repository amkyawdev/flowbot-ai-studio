import { useState } from 'react';
import { Workflow, LogIn, UserPlus } from 'lucide-react';
import { useApp } from '@/store/app';

export function LoginPage() {
  const { login, register, toast } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      <div className="login-card glass">
        <div className="login-logo"><Workflow size={28} /></div>
        <h1 style={{ textAlign: 'center' }}>FlowBot AI Studio</h1>
        <p className="small dim" style={{ textAlign: 'center', marginTop: 6 }}>
          AI automation & Telegram Bot builder
        </p>

        <div className="tabs" style={{ marginTop: 22 }}>
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">Sign in</button>
          <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')} type="button">Create account</button>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label>Display name</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane" autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit" style={{ marginTop: 8 }}>
            {busy ? <span className="spinner" style={{ borderColor: 'rgba(5,18,28,0.3)', borderTopColor: '#05121c' }} /> : mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
          Your data is encrypted and scoped to your workspace.
        </p>
      </div>
    </div>
  );
}