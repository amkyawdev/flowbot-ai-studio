import { Workflow } from 'lucide-react';

/** Full-screen boot/splash loader used while the session is resolved. */
export function LoadingScreen({ label = 'Preparing your workspace…' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label="Loading FlowBot AI Studio">
      <div className="loading-grid" />
      <div className="loading-orb one" />
      <div className="loading-orb two" />
      <div className="loading-stage">
        <div className="loading-logo">
          <span className="loading-ring" />
          <Workflow size={34} />
        </div>
        <h1 className="loading-title">FlowBot AI Studio</h1>
        <p className="loading-sub">Design automations. Connect Telegram. Ship on Cloudflare.</p>
        <div className="loading-bar"><span /></div>
        <p className="loading-hint">{label}</p>
      </div>
    </div>
  );
}
