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

function NodeCardComponent({ data, selected, id }: NodeProps & { data: any }) {
  const type = (data?.nodeType as string) || 'set';
  const def = getNodeDefinition(type);
  const Icon = icons[def?.icon ?? ''] ?? Bot;
  const color = def?.color ?? '#38bdf8';

  return (
    <div style={{ width: 180 }} className="glass" onClick={(e) => e.stopPropagation()}>
      {def?.inputs?.map((p) => (
        <Handle key={p.id} type="target" position={Position.Left} id={p.id} style={{ top: 50 }} />
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
      {def?.outputs?.map((p) => (
        <Handle key={p.id} type="source" position={Position.Right} id={p.id} style={{ top: 50 }} />
      ))}
    </div>
  );
}

export const NodeCard = memo(NodeCardComponent);