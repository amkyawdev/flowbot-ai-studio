import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Workflow, Plus, Trash2, PlayCircle } from 'lucide-react';
import { workflowsApi } from '@/api/client';
import { Empty, StatusBadge, Loading } from '@/components/ui';
import { useApp } from '@/store/app';
import { timeAgo } from '@flowbot/shared';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const [workflows, setWorkflows] = useState<any[] | null>(null);

  async function load() {
    try {
      const res = await workflowsApi.list();
      setWorkflows(res.workflows);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load', 'error');
      setWorkflows([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createWorkflow() {
    try {
      const res = await workflowsApi.create({ name: 'Untitled workflow' });
      toast('Workflow created', 'success');
      navigate(`/workflows/${res.workflow.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Create failed', 'error');
    }
  }

  async function removeWorkflow(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    try {
      await workflowsApi.remove(id);
      toast('Workflow deleted', 'success');
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  }

  async function runWorkflow(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await workflowsApi.run(id, { async: true });
      toast('Workflow queued for execution', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Run failed', 'error');
    }
  }

  if (workflows === null) return <Loading />;

  return (
    <div>
      <div className="topbar">
        <h1>Workflows</h1>
        <button className="btn btn-primary" onClick={createWorkflow}><Plus size={18} /> Create</button>
      </div>

      {workflows.length === 0 ? (
        <Empty icon={<Workflow size={26} />} title="No workflows yet" sub="Automations are node graphs that run on Cloudflare's edge." action={<button className="btn btn-primary" onClick={createWorkflow}><Plus size={18} /> Create workflow</button>} />
      ) : (
        <div className="glass">
          {workflows.map((w: any) => (
            <Link to={`/workflows/${w.id}`} key={w.id} className="row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="row-avatar"><Workflow size={20} /></div>
              <div className="row-body">
                <div className="row-title">{w.name}</div>
                <div className="row-sub">{w.graph?.nodes?.length ?? 0} nodes · v{w.version ?? 1} · {timeAgo(w.updatedAt || w.updated_at)}</div>
              </div>
              <StatusBadge status={w.status || 'draft'} />
              <button className="btn-icon btn-ghost" onClick={(e) => runWorkflow(w.id, e)} aria-label="Run"><PlayCircle size={19} /></button>
              <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={(e) => removeWorkflow(w.id, e)} aria-label="Delete"><Trash2 size={18} /></button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}