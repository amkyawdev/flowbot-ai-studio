import { NODE_REGISTRY } from '@flowbot/shared';
import {
  Hand, Webhook, Send, MessageCircle, Bot, Sparkles, Sparkle, Globe, GitBranch,
  Split, Code2, Timer, Search, Database, ShieldAlert, X,
} from 'lucide-react';
import { Drawer } from '@/components/ui';
import { useWorkflow } from '@/store/workflow';

const icons: Record<string, any> = {
  hand: Hand, webhook: Webhook, send: Send, 'message-circle': MessageCircle, bot: Bot,
  sparkles: Sparkles, sparkle: Sparkle, globe: Globe, 'git-branch': GitBranch, split: Split,
  'code-2': Code2, timer: Timer, search: Search, database: Database, 'shield-alert': ShieldAlert,
};

const CATEGORY_ORDER = ['trigger', 'ai', 'action', 'logic', 'data', 'vector', 'error'];

export function NodeLibrary() {
  const open = useWorkflow((s) => s.libraryOpen);
  const close = useWorkflow((s) => s.toggleLibrary);
  const addNode = useWorkflow((s) => s.addNode);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, defs: NODE_REGISTRY.filter((n) => n.category === cat) }))
    .filter((g) => g.defs.length > 0);

  return (
    <Drawer open={open} onClose={close}>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2>Add node</h2>
        <button className="btn-icon btn-ghost" onClick={close} aria-label="Close"><X size={20} /></button>
      </div>
      {grouped.map(({ cat, defs }) => (
        <div key={cat}>
          <div className="section-title" style={{ marginTop: 8 }}>{cat}</div>
          {defs.map((def) => {
            const Icon = icons[def.icon] ?? Bot;
            return (
              <button
                key={def.type}
                className="row"
                style={{ width: '100%', textAlign: 'left', minHeight: 52 }}
                onClick={() => addNode(def.type, { x: 80 + Math.random() * 120, y: 80 + Math.random() * 160 })}
              >
                <div className="row-avatar" style={{ background: `${def.color}1e`, color: def.color }}>
                  <Icon size={18} />
                </div>
                <div className="row-body">
                  <div className="row-title">{def.name}</div>
                  <div className="row-sub">{def.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </Drawer>
  );
}