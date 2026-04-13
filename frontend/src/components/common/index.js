import React, { useEffect, useRef, useState } from 'react';
import { classNames, getInitials } from '../../utils/helpers';

// ── BUTTON ────────────────────────────────────────────────────
export function Button({ children, variant = 'default', size = 'md', loading, disabled, className, ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    default: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 focus:ring-slate-300',
    primary: 'bg-violet-600 text-white hover:bg-violet-700 focus:ring-violet-400 border border-violet-600',
    danger:  'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 border border-red-500',
    ghost:   'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-400 border border-emerald-600',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs gap-1.5', md: 'px-4 py-2 text-sm gap-2', lg: 'px-5 py-2.5 text-base gap-2' };
  return (
    <button
      disabled={disabled || loading}
      className={classNames(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <Spinner size="sm" color="current" />}
      {children}
    </button>
  );
}

// ── INPUT ─────────────────────────────────────────────────────
export function Input({ label, error, prefix, suffix, className, wrapperClass, ...props }) {
  return (
    <div className={classNames('flex flex-col gap-1', wrapperClass)}>
      {label && <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>}
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-slate-400 text-sm select-none pointer-events-none">{prefix}</span>}
        <input
          className={classNames(
            'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition',
            error && 'border-red-400 focus:ring-red-400',
            prefix && 'pl-8', suffix && 'pr-8',
            className
          )}
          {...props}
        />
        {suffix && <span className="absolute right-3 text-slate-400 text-sm select-none pointer-events-none">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── SELECT ────────────────────────────────────────────────────
export function Select({ label, error, children, wrapperClass, className, ...props }) {
  return (
    <div className={classNames('flex flex-col gap-1', wrapperClass)}>
      {label && <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>}
      <select
        className={classNames(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800',
          'focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition',
          error && 'border-red-400',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── TEXTAREA ──────────────────────────────────────────────────
export function Textarea({ label, error, wrapperClass, className, ...props }) {
  return (
    <div className={classNames('flex flex-col gap-1', wrapperClass)}>
      {label && <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>}
      <textarea
        rows={3}
        className={classNames(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 resize-none',
          'focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition',
          error && 'border-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── SPINNER ───────────────────────────────────────────────────
export function Spinner({ size = 'md', color = 'violet' }) {
  const sizes = { sm: 'w-3.5 h-3.5 border-[1.5px]', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-2' };
  const colors = { violet: 'border-violet-600 border-t-transparent', white: 'border-white border-t-transparent', current: 'border-current border-t-transparent' };
  return <div className={classNames('rounded-full animate-spin', sizes[size], colors[color] || colors.violet)} />;
}

// ── BADGE ─────────────────────────────────────────────────────
export function Badge({ children, color = 'gray', size = 'sm' }) {
  const colors = {
    gray:   'bg-slate-100 text-slate-600',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-emerald-100 text-emerald-700',
    red:    'bg-red-100 text-red-700',
    amber:  'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700',
    orange: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={classNames('inline-flex items-center font-medium rounded-full px-2 py-0.5',
      size === 'sm' ? 'text-xs' : 'text-sm',
      colors[color] || colors.gray)}>
      {children}
    </span>
  );
}

// ── MODAL ─────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md', footer }) {
  const overlayRef = useRef();
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) { document.addEventListener('keydown', handleKey); document.body.style.overflow = 'hidden'; }
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={classNames('relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]', widths[size])}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ── CARD ──────────────────────────────────────────────────────
export function Card({ children, className, ...props }) {
  return (
    <div className={classNames('bg-white rounded-2xl border border-slate-100 shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'slate', icon }) {
  const colors = { slate: 'text-slate-800', green: 'text-emerald-600', red: 'text-red-500', amber: 'text-amber-600', violet: 'text-violet-600' };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={classNames('text-2xl font-semibold tabular-nums', colors[color])}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

// ── TABLE ─────────────────────────────────────────────────────
export function Table({ columns, rows, loading, empty = 'No records found', onRowClick }) {
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
  if (!rows?.length) return (
    <div className="text-center py-10 text-sm text-slate-400">{empty}</div>
  );
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-max">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={classNames(
                'text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 whitespace-nowrap',
                col.className
              )}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={classNames('border-b border-slate-50 last:border-0', onRowClick && 'cursor-pointer hover:bg-slate-50 transition-colors')}>
              {columns.map((col) => (
                <td key={col.key} className={classNames('px-3 py-3 text-slate-700 whitespace-nowrap', col.cellClass)}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── AVATAR ────────────────────────────────────────────────────
export function Avatar({ name, size = 'md' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' };
  const colors = ['bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div className={classNames('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizes[size], color)}>
      {getInitials(name)}
    </div>
  );
}

// ── TOAST ─────────────────────────────────────────────────────
export function Toast({ toasts, remove }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => remove(t.id)}
          className={classNames(
            'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
            'animate-[slideIn_0.2s_ease] cursor-pointer max-w-xs',
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            t.type === 'error'   ? 'bg-red-500 text-white' : 'bg-slate-800 text-white'
          )}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (message, type = 'info', duration = 3500) => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration);
  };
  const remove = (id) => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, remove, success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), info: (m) => add(m, 'info') };
}

// ── EMPTY STATE ───────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {icon && <div className="text-4xl mb-3 opacity-40">{icon}</div>}
      <p className="text-base font-semibold text-slate-700 mb-1">{title}</p>
      {description && <p className="text-sm text-slate-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}

// ── CONFIRM DIALOG ────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
