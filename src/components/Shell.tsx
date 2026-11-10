import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Icon, Modal } from './ui'
import { clsx } from '../lib/clsx'
import { roleLabel, timeOnly } from '../lib/utils'
import { useInstallPrompt } from '../App'

interface NavEntry { to: string; label: string; icon: string; badge?: number }

export default function Shell() {
  const { user, db, logout, markAllRead, markNotificationRead } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const { canInstall, install } = useInstallPrompt()
  const [notifOpen, setNotifOpen] = useState(false)
  const role = user?.profile.role || 'participante'

  const myNotifs = db.notifications.filter((n) => n.profile_id === user?.profile.id)
  const unread = myNotifs.filter((n) => !n.read).length

  const adminNav: NavEntry[] = [
    { to: '/admin', label: 'Dashboard', icon: 'chart' },
    { to: '/admin/participantes', label: 'Participantes', icon: 'users' },
    { to: '/admin/inscripciones', label: 'Inscripciones', icon: 'user', badge: db.participants.filter((p) => p.status === 'pendiente').length },
    { to: '/admin/pagos', label: 'Pagos', icon: 'cash' },
    { to: '/admin/validacion', label: 'Validar comprobantes', icon: 'check', badge: db.payments.filter((p) => p.status === 'pendiente').length },
    { to: '/admin/escaner', label: 'Escáner QR', icon: 'scan' },
    { to: '/admin/eventos', label: 'Eventos', icon: 'calendar' },
    { to: '/admin/asistencias', label: 'Asistencias', icon: 'clock' },
    { to: '/admin/faltas', label: 'Faltas', icon: 'alert' },
    { to: '/admin/documentos', label: 'Documentación', icon: 'book' },
    { to: '/admin/comunicados', label: 'Comunicados', icon: 'megaphone' },
    { to: '/admin/reportes', label: 'Reportes', icon: 'download' },
    { to: '/admin/usuarios', label: 'Usuarios y roles', icon: 'shield' },
    { to: '/admin/configuracion', label: 'Configuración', icon: 'settings' },
    { to: '/admin/auditoria', label: 'Historial de operaciones', icon: 'history' },
  ]

  const controlNav: NavEntry[] = [
    { to: '/admin/escaner', label: 'Escáner QR', icon: 'scan' },
    { to: '/admin/asistencias', label: 'Asistencias', icon: 'clock' },
    { to: '/admin/faltas', label: 'Faltas y justificaciones', icon: 'alert' },
    { to: '/admin/participantes', label: 'Consultar participantes', icon: 'users' },
  ]

  const partNav: NavEntry[] = [
    { to: '/app', label: 'Inicio', icon: 'home' },
    { to: '/app/perfil', label: 'Mi perfil', icon: 'user' },
    { to: '/app/inscripcion', label: 'Mi inscripción', icon: 'card' },
    { to: '/app/pagos', label: 'Mis pagos', icon: 'cash' },
    { to: '/app/pagos/nuevo', label: 'Enviar comprobante', icon: 'upload' },
    { to: '/app/qr', label: 'Mi código QR', icon: 'qr' },
    { to: '/app/asistencias', label: 'Mis asistencias', icon: 'clock' },
    { to: '/app/documentos', label: 'Documentación', icon: 'book' },
    { to: '/app/comunicados', label: 'Comunicados', icon: 'megaphone' },
    { to: '/app/eventos', label: 'Eventos', icon: 'calendar' },
  ]

  const items = role === 'participante' ? partNav : role === 'controlador' ? controlNav : adminNav
  const crumb = items.find((i) => i.to === loc.pathname)?.label || (role === 'participante' ? 'Mi cuenta' : 'Administración')

  const mobileItems =
    role === 'participante'
      ? [
          { to: '/app', label: 'Inicio', icon: 'home' },
          { to: '/app/pagos', label: 'Pagos', icon: 'cash' },
          { to: '/app/qr', label: 'Mi QR', icon: 'qr' },
          { to: '/app/documentos', label: 'Docs', icon: 'book' },
          { to: '/app/perfil', label: 'Perfil', icon: 'user' },
        ]
      : role === 'controlador'
        ? [
            { to: '/admin/escaner', label: 'Escáner', icon: 'scan' },
            { to: '/admin/asistencias', label: 'Asist.', icon: 'clock' },
            { to: '/admin/faltas', label: 'Faltas', icon: 'alert' },
            { to: '/admin/participantes', label: 'Lista', icon: 'users' },
            { to: '/admin', label: 'Inicio', icon: 'home' },
          ]
        : [
            { to: '/admin', label: 'Inicio', icon: 'home' },
            { to: '/admin/participantes', label: 'Padrón', icon: 'users' },
            { to: '/admin/validacion', label: 'Validar', icon: 'check' },
            { to: '/admin/escaner', label: 'QR', icon: 'scan' },
            { to: '/admin/reportes', label: 'Reportes', icon: 'download' },
          ]

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="sb-brand">
          <img src={`${import.meta.env.BASE_URL}img/logo.png`} alt="Comparsa San Miguel Arcángel 2004" />
        </div>
        <div className="sb-scroll">
          <div className="sb-group">{role === 'participante' ? 'Mi cuenta' : role === 'controlador' ? 'Control de asistencia' : 'Panel administrativo'}</div>
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/admin' || it.to === '/app'}
              className={({ isActive }) => clsx('nav-item', isActive && 'active')}>
              <Icon name={it.icon} size={17} />
              <span>{it.label}</span>
              {!!it.badge && <span className="count">{it.badge}</span>}
            </NavLink>
          ))}
        </div>
        <div className="sb-foot">
          <div className="sb-user">
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12 }}>
              {user?.profile.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.profile.full_name}</strong>
              <span>{roleLabel[role]}</span>
            </div>
            <button className="icon-btn" style={{ background: 'transparent', border: 0, color: '#fff', width: 30, height: 30 }}
              onClick={async () => { await logout(); nav('/login') }} title="Cerrar sesión">
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <div className="crumb">{crumb}</div>
          <div className="actions">
            {canInstall && (
              <button className="btn btn-sm" onClick={install}><Icon name="install" size={15} /> Instalar app</button>
            )}
            <button className="icon-btn" style={{ position: 'relative' }} onClick={() => setNotifOpen(true)} aria-label="Notificaciones">
              <Icon name="bell" size={17} />
              {unread > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 999, background: 'var(--orange)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 3px' }}>
                  {unread}
                </span>
              )}
            </button>
            <button className="icon-btn" onClick={async () => { await logout(); nav('/login') }} aria-label="Salir" title="Cerrar sesión">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>

        <Outlet />

        <nav className="mobile-nav no-print">
          {mobileItems.map((m) => (
            <button key={m.to} className={clsx(loc.pathname === m.to && 'active')} onClick={() => nav(m.to)}>
              <Icon name={m.icon} size={19} />
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="Notificaciones"
        footer={<>
          <button className="btn" onClick={() => { markAllRead(); setNotifOpen(false) }}>Marcar todas como leídas</button>
          <button className="btn btn-primary" onClick={() => setNotifOpen(false)}>Cerrar</button>
        </>}>
        <div className="stack">
          {myNotifs.length === 0 && <p className="muted tiny">Todavía no tienes notificaciones.</p>}
          {myNotifs.slice(0, 30).map((n) => (
            <div key={n.id} className={clsx('notif', !n.read && 'unread')} onClick={() => markNotificationRead(n.id)} role="button">
              <Icon name={n.type === 'pago' ? 'cash' : n.type === 'documento' ? 'book' : n.type === 'evento' ? 'calendar' : 'bell'} size={17} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.83rem', display: 'block' }}>{n.title}</strong>
                <span className="tiny muted">{n.body}</span>
                <div className="tiny" style={{ color: 'var(--muted)', marginTop: 3 }}>{timeOnly(n.created_at)} · {new Date(n.created_at).toLocaleDateString('es-PE')}</div>
              </div>
              {!n.read && <span className="notice-dot" />}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
