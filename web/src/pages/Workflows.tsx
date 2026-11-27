import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Workflow, Plus, Trash2, PlayCircle, Copy, Search, Sparkles, Clock, Layers, Activity,
} from 'lucide-react';
import { workflowsApi } from '@/api/client';
import { Empty, StatusBadge, Loading } from '@/components/ui';
import { useApp } from '@/store/app';
import { timeAgo } from '@flowbot/shared';

const ACCENTS = ['#38bdf8', '#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];

function accentFor(id: string): string {
  const hash = Array.from(id || 'wf').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ACCENTS[hash % ACCENTS.length];
}

export function WorkflowsPage() {
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const [workflows, setWorkflows] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');

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

  async function duplicateWorkflow(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const src = await workflowsApi.get(id);
      const created = await workflowsApi.create({ name: `${src.workflow.name} (copy)` });
      await workflowsApi.save(created.workflow.id, { graph: src.workflow.graph });
      toast('Workflow duplicated', 'success');
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Duplicate failed', 'error');
    }
  }

  const list = workflows ?? [];
  const filtered = useMemo(
    () => list.filter((w) => (w.name || '').toLowerCase().includes(query.trim().toLowerCase())),
    [list, query],
  );
  const totalNodes = list.reduce((n, w) => n + (w.graph?.nodes?.length ?? 0), 0);
  const activeCount = list.filter((w) => w.status === 'active').length;

  if (workflows === null) return <Loading />;

  return (
    <div className="wf-page">
      <div className="topbar">
        <div className="wf-page-title">
          <h1>Workflows</h1>
          <p className="hint">Build, test, and ship automations on Cloudflare&apos;s edge.</p>
        </div>
        <button className="btn btn-primary" onClick={createWorkflow}><Plus size={18} /> New workflow</button>
      </div>

      <div className="wf-hero">
        <div className="wf-hero-text">
          <span className="badge badge-info"><Sparkles size={13} /> Studio</span>
          <h2>{list.length} workflow{list.length === 1 ? '' : 's'}</h2>
          <p className="small dim">Design node graphs, connect AI providers, and run them from anywhere.</p>
        </div>
        <div className="wf-hero-stats">
          <div><Layers size={16} /><b>{totalNodes}</b><span>nodes</span></div>
          <div><Activity size={16} /><b>{activeCount}</b><span>active</span></div>
          <div><Workflow size={16} /><b>{list.length}</b><span>total</span></div>
        </div>
      </div>

      <div className="wf-toolbar">
        <div className="chat-search wf-search">
          <Search size={16} aria-hidden />
          <input
            className="chat-search-input"
            placeholder="Search workflows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search workflows"
          />
        </div>
        <span className="small faint">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <Empty
          icon={<Workflow size={28} />}
          title={list.length === 0 ? 'No workflows yet' : 'No matching workflows'}
          sub={list.length === 0 ? 'Create your first automation and connect it to Telegram or an AI provider.' : 'Try a different search term.'}
          action={<button className="btn btn-primary" onClick={createWorkflow}><Plus size={18} /> Create workflow</button>}
        />
      ) : (
        <div className="wf-grid">
          {filtered.map((w: any) => {
            const accent = accentFor(w.id);
            const nodeCount = w.graph?.nodes?.length ?? 0;
            return (
              <div className="wf-card" key={w.id} style={{ '--wf-accent': accent } as React.CSSProperties}>
                <div className="wf-card-top">
                  <div className="wf-icon" style={{ background: `${accent}22`, color: accent }}>
                    <Workflow size={22} />
                  </div>
                  <div className="wf-card-title">
                    <Link to={`/workflows/${w.id}`}>{w.name}</Link>
                    <span>{nodeCount} node{nodeCount === 1 ? '' : 's'} · v{w.version ?? 1}</span>
                  </div>
                  <StatusBadge status={w.status || 'draft'} />
                </div>
                <div className="wf-meta">
                  <Clock size={13} /> Updated {timeAgo(w.updatedAt || w.updated_at)}
                </div>
                <div className="wf-actions">
                  <Link className="btn btn-primary" to={`/workflows/${w.id}`}>Open</Link>
                  <button className="btn" onClick={(e) => runWorkflow(w.id, e)}><PlayCircle size={16} /> Run</button>
                  <button className="btn-icon btn-ghost" onClick={(e) => duplicateWorkflow(w.id, e)} aria-label="Duplicate"><Copy size={17} /></button>
                  <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={(e) => removeWorkflow(w.id, e)} aria-label="Delete"><Trash2 size={17} /></button>
                </div>
              </div>
            );
          })}
          <button className="wf-card wf-new" onClick={createWorkflow}>
            <Plus size={28} />
            <b>New workflow</b>
            <span>Start from a blank canvas</span>
          </button>
        </div>
      )}
    </div>
  );
}
