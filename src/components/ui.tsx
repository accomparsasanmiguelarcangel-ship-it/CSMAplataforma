import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { clsx } from '../lib/clsx'

/* ── Iconos (SVG inline, sin dependencias) ───────────────────────────────── */
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20',
  qr: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18',
  calendar: 'M8 2v4M16 2v4M3 6h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  file: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h2',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  chart: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  megaphone: 'm3 11 18-5v12L3 13zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  menu: 'M3 12h18M3 6h18M3 18h18',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  install: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
}

export function Icon({ name, size = 18, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  const d = P[name] || P.info
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/* ── Toasts ──────────────────────────────────────────────────────────────── */
type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'warn' }
const ToastCtx = createContext<{ push: (msg: string, kind?: Toast['kind']) => void }>({ push: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((msg: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, msg, kind }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div key={t.id} className={clsx('toast', t.kind === 'err' && 'err', t.kind === 'warn' && 'warn')}>
            <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'x' : 'alert'} size={16} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ── Primitivas ──────────────────────────────────────────────────────────── */
export function Badge({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; children: React.ReactNode }) {
  return <span className={clsx('badge', tone)}>{children}</span>
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: string | number; hint?: string; icon?: string; tone?: 'o' | 'y' | 'i' }) {
  return (
    <div className={clsx('stat', tone)}>
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      {hint && <div className="hint">{hint}</div>}
      {icon && <div className="ico"><Icon name={icon} size={26} /></div>}
    </div>
  )
}

export function Avatar({ src, first, last, size }: { src?: string | null; first: string; last: string; size?: 'lg' | 'xl' }) {
  const ini = `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase()
  return (
    <div className={clsx('avatar', size)}>
      {src ? <img src={src} alt={`${first} ${last}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ini}
    </div>
  )
}

export function Empty({ icon = 'info', title, text, action }: { icon?: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={22} /></div>
      <strong>{title}</strong>
      {text && <span className="tiny" style={{ maxWidth: '46ch' }}>{text}</span>}
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={clsx('modal', wide && 'wide')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, required, error, hint, children, full }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; full?: boolean
}) {
  return (
    <div className={clsx('field', full && 'full')}>
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
      {error ? <span className="err-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Spinner({ dark }: { dark?: boolean }) {
  return <span className={clsx('loader', dark && 'dark')} />
}

export function Progress({ value, orange }: { value: number; orange?: boolean }) {
  const v = Math.max(0, Math.min(100, value))
  return <div className={clsx('progress', orange && 'o')}><span style={{ width: `${v}%` }} /></div>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={clsx('tab', value === t.id && 'active')} onClick={() => onChange(t.id)}>
          {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  )
}

export function Banner({ tone = 'info', title, children, icon }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; title?: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className={clsx('banner', tone)}>
      <Icon name={icon || (tone === 'bad' ? 'alert' : tone === 'ok' ? 'check' : 'info')} size={18} />
      <div>{title && <strong>{title}</strong>}{children}</div>
    </div>
  )
}

export function SectionCard({ title, sub, right, children, pad0 }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; pad0?: boolean }) {
  return (
    <section className={clsx('card', pad0 && 'pad-0')}>
      {(title || right) && (
        <div className="card-head" style={pad0 ? { padding: '16px 18px 0' } : undefined}>
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {right}
        </div>
      )}
      {children}
    </section>
  )
}
