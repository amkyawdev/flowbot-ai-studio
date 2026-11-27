import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
}

/** Searchable, keyboard-accessible select used for provider/model/credential lists. */
export function Combobox({
  value, options, onChange, placeholder = 'Select…', id, disabled,
  allowEmpty = true, emptyLabel = 'Select…', ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
    : options;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    inputRef.current?.focus();
    // Only reset when the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[active]) commit(filtered[active].value);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={rootRef}>
      <div className={`combo-control ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
        <input
          id={id}
          ref={inputRef}
          className="combo-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        <ChevronDown size={16} className="combo-caret" aria-hidden />
      </div>
      {open && (
        <ul className="combo-list" role="listbox" id={listId}>
          {allowEmpty && (
            <li
              role="option"
              aria-selected={value === ''}
              className={`combo-option ${value === '' ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit('')}
            >
              {emptyLabel}
            </li>
          )}
          {filtered.length === 0 && <li className="combo-empty">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`combo-option ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o.value)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
