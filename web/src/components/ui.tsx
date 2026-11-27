import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Workflow } from 'lucide-react';
import { useApp } from '@/store/app';

function useDialog(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => {
      const root = ref.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
    };
    const raf = requestAnimationFrame(() => {
      const list = focusables();
      (list[0] ?? ref.current)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, ref]);
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex-between">
          {title ? <div className="sheet-title">{title}</div> : <div />}
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="sheet-scrim" onClick={onClose} style={{ alignItems: 'stretch', justifyContent: 'flex-start' }}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label="Panel" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return createPortal(
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function Empty({ icon, title, sub, action }: { icon: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {sub && <p className="small dim mt-8">{sub}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function Loading() {
  return (
    <div className="loading-inline" role="status" aria-live="polite">
      <div className="loading-logo"><span className="loading-ring" /><Workflow size={22} /></div>
      <p className="small dim">Loading…</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'badge-success', connected: 'badge-success', success: 'badge-success',
    inactive: 'badge', pending: 'badge-warn', running: 'badge-info', queued: 'badge-info',
    error: 'badge-error', failed: 'badge-error', stopped: 'badge-warn', draft: 'badge-purple',
  };
  return <span className={`badge ${map[status] ?? 'badge'}`}>{status}</span>;
}
