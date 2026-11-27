import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, Bot, PlayCircle, CheckCircle2, Plus, ArrowRight, History } from 'lucide-react';
import { dashboardApi } from '@/api/client';
import { Loading, Empty, StatusBadge } from '@/components/ui';
import { useApp } from '@/store/app';
import { timeAgo } from '@flowbot/shared';

export function DashboardPage() {
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    dashboardApi.get().then(setData).catch((e) => toast(e.message, 'error'));
  }, []);

  if (!data) return <Loading />;
  const { stats, recentExecutions, recentWorkflows } = data;

  return (
    <div>
      <div className="topbar">
        <h1>Dashboard</h1>
        <Link to="/workflows" className="btn btn-primary">
          <Plus size={18} /> New workflow
        </Link>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Workflows', value: stats.workflows, icon: Workflow, c: '#38bdf8' },
          { label: 'Bots', value: stats.bots, icon: Bot, c: '#22d3ee' },
          { label: 'Executions', value: stats.executions, icon: PlayCircle, c: '#34d399' },
          { label: 'Success rate', value: `${stats.successRate}%`, icon: CheckCircle2, c: '#818cf8' },
        ].map(({ label, value, icon: Icon, c }) => (
          <div className="stat glass" key={label}>
            <div className="stat-accent" style={{ background: c }} />
            <div className="flex gap-8" style={{ marginBottom: 8 }}>
              <Icon size={18} color={c} />
              <span className="stat-label">{label}</span>
            </div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Recent workflows</div>
      {recentWorkflows.length === 0 ? (
        <Empty icon={<Workflow size={26} />} title="No workflows yet" sub="Create your first automation to get started." action={<Link className="btn btn-primary" to="/workflows"><Plus size={18} /> Create workflow</Link>} />
      ) : (
        <div className="glass">
          {recentWorkflows.map((w: any) => (
            <Link to={`/workflows/${w.id}`} key={w.id} className="row">
              <div className="row-avatar"><Workflow size={20} /></div>
              <div className="row-body">
                <div className="row-title">{w.name}</div>
                <div className="row-sub">v{w.version || 1} · {timeAgo(w.updated_at)}</div>
              </div>
              <StatusBadge status={w.status} />
              <div style={{ color: 'var(--text-faint)' }}><ArrowRight size={18} /></div>
            </Link>
          ))}
        </div>
      )}

      <div className="section-title">Recent executions</div>
      {recentExecutions.length === 0 ? (
        <div className="card small dim">No executions yet. Run a workflow from the editor to see logs here.</div>
      ) : (
        <div className="glass">
          {recentExecutions.map((ex: any) => (
            <Link to={`/executions/${ex.id}`} key={ex.id} className="row">
              <div className="row-avatar" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--green)' }}><History size={20} /></div>
              <div className="row-body">
                <div className="row-title">{ex.trigger_type} · {ex.workflow_id?.slice(0, 8) || '—'}</div>
                <div className="row-sub">{ex.status} · {timeAgo(ex.started_at)}{ex.duration_ms != null ? ` · ${ex.duration_ms}ms` : ''}</div>
              </div>
              <StatusBadge status={ex.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}