import { useEffect, useState } from 'react';
import { Info, Shield, Cpu, Database } from 'lucide-react';
import { settingsApi, zillizApi } from '@/api/client';
import { Loading, StatusBadge } from '@/components/ui';
import { useApp } from '@/store/app';

export function SettingsPage() {
  const toast = useApp((s) => s.toast);
  const user = useApp((s) => s.user);
  const [about, setAbout] = useState<any>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [runtime, setRuntime] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([settingsApi.about(), settingsApi.get()])
      .then(([a, s]) => { setAbout(a); setConfig(s.settings); setRuntime(s.runtime ?? null); setLoaded(true); })
      .catch((e) => { toast(e.message, 'error'); setLoaded(true); });
  }, []);

  if (!loaded) return <Loading />;

  return (
    <div>
      <div className="topbar"><h1>Settings</h1></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Account</div>
        <div className="row" style={{ padding: 0 }}>
          <div className="row-avatar">{user?.displayName?.[0]?.toUpperCase() || 'U'}</div>
          <div className="row-body">
            <div className="row-title">{user?.displayName}</div>
            <div className="row-sub">{user?.email}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ marginBottom: 10 }}><Shield size={18} color="var(--brand-bright)" /><h3>Security</h3></div>
        <ul style={{ paddingLeft: 18, color: 'var(--text-dim)', fontSize: 13.5, display: 'grid', gap: 6 }}>
          <li>Credentials encrypted with AES-256-GCM; master key is a Worker secret.</li>
          <li>Passwords hashed with PBKDF2 + per-user salt. No raw secrets in D1.</li>
          <li>Telegram webhooks validated by secret_token — tokens never reach your browser.</li>
          <li>Workflow execution runs on Cloudflare Workers, never in the browser.</li>
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ marginBottom: 10 }}><Database size={18} color="var(--brand-bright)" /><h3>Zilliz vector store</h3></div>
        <div className="flex gap-8" style={{ marginBottom: 8 }}>
          <StatusBadge status={runtime?.zillizConfigured ? 'connected' : 'inactive'} />
          <span className="small dim">
            {runtime?.zillizConfigured
              ? `Configured · collection ${runtime?.zillizCollection || 'flowbot_chunks'}`
              : 'Not configured — vector nodes degrade gracefully'}
          </span>
        </div>
        {runtime?.zillizConfigured && runtime?.zillizEndpointHost && (
          <div className="hint" style={{ marginBottom: 8 }}>Endpoint host: {runtime.zillizEndpointHost}</div>
        )}
        <button
          className="btn"
          onClick={async () => {
            try {
              const r = await zillizApi.test();
              toast(r.message || (r.ok ? 'Connected to Zilliz' : 'Zilliz test failed'), r.ok ? 'success' : 'error');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Zilliz test failed', 'error');
            }
          }}
        >
          Test connection
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ marginBottom: 10 }}><Cpu size={18} color="var(--green)" /><h3>Runtime feature flags</h3></div>
        <div className="flex gap-8" style={{ marginBottom: 6 }}>
          <StatusBadge status={runtime?.cloudflareAiAvailable ? 'connected' : 'inactive'} />
          <span className="small dim">{runtime?.cloudflareAiAvailable ? 'Cloudflare Workers AI binding available' : 'Cloudflare Workers AI not available'}</span>
        </div>
        <div className="flex gap-8">
          <StatusBadge status={runtime?.zillizConfigured ? 'connected' : 'inactive'} />
          <span className="small dim">{runtime?.zillizConfigured ? 'Zilliz configured' : 'Zilliz not configured'}</span>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-8" style={{ marginBottom: 10 }}><Info size={18} color="var(--cyan)" /><h3>About</h3></div>
        <ConnectionRow label="Developer" value={about?.developer || '—'} />
        <ConnectionRow label="Brand" value={about?.brand || '—'} />
        <ConnectionRow label="Email" value={about?.email || '—'} />
        <ConnectionRow label="Location" value={about?.location || '—'} />
        {about?.tiktok && (
          <div className="row" style={{ padding: '6px 0' }}>
            <div className="row-body"><div className="row-sub">TikTok</div></div>
            <a className="btn btn-ghost" style={{ minHeight: 38, fontSize: 13 }} href={about.tiktok} target="_blank" rel="noreferrer">Open profile</a>
          </div>
        )}
        <ConnectionRow label="Version" value={about?.version || '1.0.0'} />
      </div>
    </div>
  );
}

function ConnectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ padding: '6px 0' }}>
      <div className="row-body">
        <div className="row-sub">{label}</div>
        <div className="row-title" style={{ fontSize: 14 }}>{value}</div>
      </div>
    </div>
  );
}