import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { History } from 'lucide-react';
import { executionsApi } from '@/api/client';
import { Empty, StatusBadge, Sheet, Loading } from '@/components/ui';
import { useApp } from '@/store/app';
import { timeAgo } from '@flowbot/shared';

export function ExecutionsPage() {
  const { id } = useParams();
  const toast = useApp((s) => s.toast);
  const [executions, setExecutions] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any | null>(id ? { id } : null);

  async function load() {
    try { const res = await executionsApi.list(); setExecutions(res.executions); }
    catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); setExecutions([]); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (id) void executionsApi.get(id).then((r) => setDetail({ ...r.execution, logs: r.logs })).catch(() => setDetail(null)); }, [id]);

  if (executions === null) return <Loading />;

  return (
    <div>
      <div className="topbar"><h1>Executions</h1></div>
      {executions.length === 0 ? (
        <Empty icon={<History size={26} />} title="No executions yet" sub="Every workflow run — manual, webhook or Telegram — is recorded here with full logs." />
      ) : (
        <div className="glass">
          {executions.map((ex: any) => (
            <div key={ex.id} className="row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => void executionsApi.get(ex.id).then((r) => setDetail({ ...r.execution, logs: r.logs }))}>
              <div className="row-avatar" style={{ background: 'rgba(56,189,248,0.12)', color: 'var(--brand-bright)' }}><History size={18} /></div>
              <div className="row-body">
                <div className="row-title">{ex.trigger_type} run</div>
                <div className="row-sub">{ex.id.slice(0, 14)}… · {timeAgo(ex.started_at)}{ex.duration_ms != null ? ` · ${ex.duration_ms}ms` : ''}</div>
              </div>
              <StatusBadge status={ex.status} />
            </div>
          ))}
        </div>
      )}
      {detail && <ExecutionDetail execution={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ExecutionDetail({ execution, onClose }: { execution: any; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={`Execution ${execution.id?.slice(0, 12)}…`}>
      <div className="flex gap-8" style={{ marginBottom: 12 }}>
        <StatusBadge status={execution.status} />
        <span className="small dim">Trigger: {execution.trigger_type}</span>
        <span className="small dim">{execution.duration_ms != null ? `${execution.duration_ms}ms` : ''}</span>
      </div>
      {execution.error_message && <div className="card" style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--red)', marginBottom: 12 }}>{execution.error_message}</div>}
      <div className="section-title">Logs</div>
      <div className="glass" style={{ padding: 8 }}>
        {(execution.logs || []).map((log: any, i: number) => (
          <div key={i} className="flex" style={{ gap: 8, padding: '6px 8px', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
            <span className={`badge ${log.level === 'error' ? 'badge-error' : log.level === 'warn' ? 'badge-warn' : 'badge-info'}`} style={{ height: 20, flexShrink: 0 }}>{log.level}</span>
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ wordBreak: 'break-word' }}>{log.message}</div>
              {log.node_type && <div className="small faint">{log.node_type}{log.node_id ? ` · ${log.node_id.slice(0, 10)}` : ''}</div>}
            </div>
          </div>
        ))}
        {(execution.logs || []).length === 0 && <div className="small dim" style={{ padding: 12 }}>No logs recorded.</div>}
      </div>
    </Sheet>
  );
}