import { useEffect, useMemo, useState } from 'react';
import { NODE_REGISTRY } from '@flowbot/shared';
import type { NodeDefinition } from '@flowbot/shared';
import {
  Hand, Webhook, Send, MessageCircle, Bot, Sparkles, Sparkle, Globe, GitBranch,
  Split, Code2, Timer, Search, Database, ShieldAlert, X, Plus, Wand2,
} from 'lucide-react';
import { Drawer } from '@/components/ui';
import { useWorkflow } from '@/store/workflow';

const icons: Record<string, any> = {
  hand: Hand, webhook: Webhook, send: Send, 'message-circle': MessageCircle, bot: Bot,
  sparkles: Sparkles, sparkle: Sparkle, globe: Globe, 'git-branch': GitBranch, split: Split,
  'code-2': Code2, timer: Timer, search: Search, database: Database, 'shield-alert': ShieldAlert,
};

const CATEGORY_ORDER = ['trigger', 'ai', 'action', 'logic', 'data', 'vector', 'error'];
const QUICK_TYPES = ['manualTrigger', 'aiAgent', 'telegramSend', 'httpRequest'];
const RECENT_KEY = 'flowbot_recent_nodes';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(types: string[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(types.slice(0, 6))); } catch { /* ignore */ }
}

function defOf(type: string): NodeDefinition | undefined {
  return NODE_REGISTRY.find((n) => n.type === type);
}

export function NodeLibrary() {
  const open = useWorkflow((s) => s.libraryOpen);
  const close = useWorkflow((s) => s.toggleLibrary);
  const addNode = useWorkflow((s) => s.addNode);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  function add(type: string) {
    addNode(type, { x: 80 + Math.random() * 120, y: 80 + Math.random() * 160 });
    setRecent((r) => {
      const next = [type, ...r.filter((t) => t !== type)].slice(0, 6);
      saveRecent(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NODE_REGISTRY.filter((n) => {
      if (category !== 'all' && n.category !== category) return false;
      if (!q) return true;
      return n.name.toLowerCase().includes(q)
        || n.description.toLowerCase().includes(q)
        || n.category.includes(q);
    });
  }, [query, category]);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, defs: filtered.filter((n) => n.category === cat) }))
    .filter((g) => g.defs.length > 0);

  const quickDefs = QUICK_TYPES.map(defOf).filter(Boolean) as NodeDefinition[];
  const recentDefs = recent.map(defOf).filter(Boolean) as NodeDefinition[];

  return (
    <Drawer open={open} onClose={close}>
      <div className="flex-between node-lib-head">
        <div>
          <h2>Add node</h2>
          <p className="hint">Tap a block to add it and open its settings.</p>
        </div>
        <button className="btn-icon btn-ghost" onClick={close} aria-label="Close"><X size={22} /></button>
      </div>

      <div className="chat-search node-lib-search">
        <Search size={16} aria-hidden />
        <input
          className="chat-search-input"
          placeholder="Search nodes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search nodes"
        />
      </div>

      <div className="section-title" style={{ marginTop: 4 }}>Quick add</div>
      <div className="node-lib-quick-grid">
        {quickDefs.map((def) => {
          const Icon = icons[def.icon] ?? Bot;
          return (
            <button key={def.type} className="node-quick" onClick={() => add(def.type)}>
              <span className="node-quick-icon" style={{ background: `${def.color}22`, color: def.color }}><Icon size={18} /></span>
              <span>{def.name}</span>
            </button>
          );
        })}
      </div>

      {recentDefs.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 14 }}>Recently used</div>
          <div className="node-lib-chips">
            {recentDefs.map((def) => {
              const Icon = icons[def.icon] ?? Bot;
              return (
                <button key={def.type} className="chip" onClick={() => add(def.type)}>
                  <Icon size={13} /> {def.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title" style={{ marginTop: 14 }}>Categories</div>
      <div className="node-lib-chips">
        {['all', ...CATEGORY_ORDER].map((cat) => (
          <button
            key={cat}
            className={`chip ${category === cat ? 'active' : ''}`}
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
          >
            {cat}
          </button>
        ))}
      </div>

      {grouped.length === 0 && <div className="small dim" style={{ padding: '10px 4px' }}>No matching nodes.</div>}

      {grouped.map(({ cat, defs }) => (
        <div key={cat}>
          <div className="section-title" style={{ marginTop: 14 }}>{cat}</div>
          {defs.map((def) => {
            const Icon = icons[def.icon] ?? Bot;
            return (
              <div
                key={def.type}
                className="row node-lib-row"
                role="button"
                tabIndex={0}
                onClick={() => add(def.type)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(def.type); } }}
              >
                <div className="row-avatar node-lib-avatar" style={{ background: `${def.color}1e`, color: def.color }}>
                  <Icon size={22} />
                </div>
                <div className="row-body">
                  <div className="row-title">{def.name}</div>
                  <div className="row-sub">{def.description}</div>
                </div>
                <span className="node-lib-add"><Plus size={18} /></span>
              </div>
            );
          })}
        </div>
      ))}

      <div className="node-lib-foot">
        <Wand2 size={14} /> {filtered.length} of {NODE_REGISTRY.length} nodes
      </div>
    </Drawer>
  );
}
