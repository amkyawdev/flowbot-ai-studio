import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Workflow, Bot, Puzzle, BotMessageSquare, KeyRound, History,
  Settings, Workflow as WorkflowIcon, LogOut, UserRound, MoreHorizontal,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { Sheet } from '@/components/ui';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/chat', label: 'Chat', icon: BotMessageSquare },
  { to: '/bots', label: 'Bots', icon: Bot },
  { to: '/integrations', label: 'Integrations', icon: Puzzle },
  { to: '/agents', label: 'AI Agents', icon: BotMessageSquare },
  { to: '/credentials', label: 'Credentials', icon: KeyRound },
  { to: '/executions', label: 'Executions', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const PRIMARY = ['/', '/workflows', '/chat', '/bots'];
const primaryItems = items.filter((i) => PRIMARY.includes(i.to));
const moreItems = items.filter((i) => !PRIMARY.includes(i.to));

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const logout = useApp((s) => s.logout);
  const user = useApp((s) => s.user);
  const moreActive = moreItems.some((i) => location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to)));

  return (
    <>
      <nav className="bottom-nav" aria-label="Primary">
        {primaryItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={22} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`nav-item ${moreActive || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        {moreItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => setMoreOpen(false)}
            style={{ marginBottom: 2 }}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
        <div className="divider" />
        <div className="nav-link" style={{ color: 'var(--text-faint)' }}>
          <UserRound size={18} /> {user?.displayName || user?.email}
        </div>
        <button className="nav-link" onClick={() => { setMoreOpen(false); void logout(); }} style={{ color: 'var(--red)', width: '100%' }}>
          <LogOut size={18} /> Sign out
        </button>
      </Sheet>
    </>
  );
}

export function SideNav() {
  const user = useApp((s) => s.user);
  const logout = useApp((s) => s.logout);
  return (
    <nav className="side-nav" aria-label="Primary">
      <div className="brand">
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,var(--brand-deep),var(--cyan))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <WorkflowIcon size={17} color="#04121c" />
        </span>
        FlowBot AI Studio
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Icon size={18} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
      <div style={{ flex: 1 }} />
      <div className="nav-link" style={{ color: 'var(--text-faint)' }}>
        <UserRound size={18} /> {user?.displayName || user?.email}
      </div>
      <button className="nav-link" onClick={logout} style={{ color: 'var(--red)', width: '100%' }}>
        <LogOut size={18} /> Sign out
      </button>
    </nav>
  );
}
