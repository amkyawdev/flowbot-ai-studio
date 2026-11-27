import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Hand, Webhook, Send, MessageCircle, Bot, Sparkles, Sparkle, Globe, GitBranch,
  Split, Code2, Timer, Search, Database, ShieldAlert,
} from 'lucide-react';
import { getNodeDefinition } from '@flowbot/shared';
import type { NodeProps } from '@xyflow/react';

const icons: Record<string, any> = {
  hand: Hand, webhook: Webhook, send: Send, 'message-circle': MessageCircle, bot: Bot,
  sparkles: Sparkles, sparkle: Sparkle, globe: Globe, 'git-branch': GitBranch, split: Split,
  'code-2': Code2, timer: Timer, search: Search, database: Database, 'shield-alert': ShieldAlert,
};

function NodeCardComponent({ type, data, selected }: NodeProps & { data: any }) {
  const nodeType = (data?.nodeType as string) || (type && type !== 'default' ? type : '') || 'set';
  const def = getNodeDefinition(nodeType);
  const Icon = icons[def?.icon ?? ''] ?? Bot;
  const color = def?.color ?? '#38bdf8';
  const inputs = def?.inputs ?? [];
  const outputs = def?.outputs ?? [];
  // Distribute handles down the node edge so multi-output nodes (IF, Switch,
  // Telegram trigger, HTTP request) remain individually connectable.
  const slot = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`;

  return (
    <div style={{ width: 180 }} className="glass" onClick={(e) => e.stopPropagation()}>
      {inputs.map((p, i) => (
        <Handle key={p.id} type="target" position={Position.Left} id={p.id} title={p.label} style={{ top: slot(i, inputs.length) }} />
      ))}
      <div className="flex" style={{ padding: 10, gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {String(data?.label || def?.name || 'Node')}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{def?.category}</div>
        </div>
        {selected && <span style={{ marginLeft: 'auto', color: 'var(--brand)', fontSize: 11 }}>●</span>}
      </div>
      {outputs.map((p, i) => (
        <Handle key={p.id} type="source" position={Position.Right} id={p.id} title={p.label} style={{ top: slot(i, outputs.length) }} />
      ))}
    </div>
  );
}

export const NodeCard = memo(NodeCardComponent);