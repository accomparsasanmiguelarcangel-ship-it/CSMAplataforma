import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import {
  Avatar, Badge, Banner, Empty, Icon, Modal, Progress, SectionCard, Stat, Tabs, useToast,
} from '../components/ui'
import {
  accountStatusLabel, attendanceStatusLabel, dateTime, enrollmentStatusLabel, fullName, money,
  shortDate, statusTone, timeOnly, roleLabel,
} from '../lib/utils'
import { exportExcel, exportPdf } from '../lib/export'
import type { Participant } from '../lib/types'
import { useQr } from './Participant'

/* ── DASHBOARD ──────────────────────────────────────────────────────────── */
export function AdminDashboard() {
  const { stats, db, account, reviewPayment } = useStore()
  const toast = useToast()
  const pend = db.payments.filter((p) => p.status === 'pendiente')
  const pendingParticipants = db.participants.filter((p) => p.status === 'pendiente')
  const lastEvent = [...db.events].sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))[0]
  const lastAtt = lastEvent ? db.attendance.filter((a) => a.event_id === lastEvent.id) : []
  const present = lastAtt.filter((a) => a.status === 'presente' || a.status === 'tardanza').length

  const groups = useMemo(() => {
    const map = new Map<string, { total: number; paid: number }>()
    db.participants.forEach((p) => {
      const acc = account(p.id)
      const g = map.get(p.group_name) || { total: 0, paid: 0 }
      g.total += 1
      g.paid += acc.total_paid
      map.set(p.group_name, g)
    })
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [db.participants, account])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Panel general</h1>
          <p className="lead">Supervisión integral de la asociación: inscripciones, recaudación, asistencia y documentación.</p>
        </div>
        <div className="spacer" />
        <Link to="/admin/validacion" className="btn btn-primary"><Icon name="check" size={16} /> Validar comprobantes</Link>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Participantes inscritos" value={stats.total_participants} hint={`${stats.active_participants} activos`} icon="users" />
        <Stat label="Inscripciones por revisar" value={stats.pending_enrollments} hint="Pendientes de la directiva" icon="user" tone="o" />
        <Stat label="Total recaudado" value={money(stats.total_collected)} hint="Solo pagos aprobados" icon="cash" />
        <Stat label="Deuda pendiente" value={money(stats.total_debt)} hint={`${stats.with_pending_payments} con saldo`} icon="card" tone="y" />
      </div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Comprobantes por validar" value={stats.payments_to_validate} hint="Requieren revisión" icon="file" tone="o" />
        <Stat label="Pagos completos" value={stats.fully_paid} hint="Cuenta al día" icon="check" />
        <Stat label="Asistencias último evento" value={present} hint={lastEvent?.name || '—'} icon="clock" tone="i" />
        <Stat label="Habilitados para documentos" value={stats.docs_enabled} hint="Inscritos con pago" icon="book" tone="y" />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Comprobantes pendientes" sub={`${pend.length} en espera de validación`}
          right={<Link to="/admin/validacion" className="btn btn-sm">Abrir bandeja</Link>} pad0>
          {pend.length === 0 ? <Empty icon="check" title="Nada por validar" text="Todos los comprobantes fueron revisados." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Participante</th><th>Monto</th><th>Enviado</th><th></th></tr></thead>
                <tbody>
                  {pend.slice(0, 5).map((p) => {
                    const part = db.participants.find((x) => x.id === p.participant_id)
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="who">
                            <Avatar src={part?.photo_url} first={part?.first_names || '?'} last={part?.last_names || ''} />
                            <div><strong>{part ? fullName(part) : '—'}</strong><span>{part?.code}</span></div>
                          </div>
                        </td>
                        <td className="num">{money(p.amount)}</td>
                        <td className="tiny">{shortDate(p.created_at)}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={async () => {
                            const result = await reviewPayment(p.id, 'validado', 'Validado desde el dashboard.')
                            toast.push(result.ok ? 'Pago validado y guardado.' : result.error || 'No se pudo validar el pago.', result.ok ? 'ok' : 'err')
                          }}>
                            Aprobar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="stack">
          <SectionCard title="Inscripciones recientes" sub={`${pendingParticipants.length} pendientes de revisión`}
            right={<Link to="/admin/inscripciones" className="btn btn-sm">Revisar</Link>}>
            <div className="stack">
              {pendingParticipants.slice(0, 4).map((p) => (
                <div key={p.id} className="row">
                  <Avatar src={p.photo_url} first={p.first_names} last={p.last_names} />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.84rem' }}>{fullName(p)}</strong>
                    <div className="tiny muted">{p.code} · {p.group_name}</div>
                  </div>
                  <Link to={`/admin/participantes/${p.id}`} className="btn btn-sm">Ficha</Link>
                </div>
              ))}
              {pendingParticipants.length === 0 && <p className="tiny muted">Sin inscripciones pendientes.</p>}
            </div>
          </SectionCard>

          <SectionCard title="Participantes por grupo" sub="Distribución del padrón">
            <div className="stack">
              {groups.map(([g, v]) => (
                <div key={g}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="tiny" style={{ fontWeight: 700 }}>{g}</span>
                    <span className="tiny muted">{v.total} · {money(v.paid)}</span>
                  </div>
                  <Progress value={(v.total / Math.max(1, db.participants.length)) * 100} />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <SectionCard title="Últimas operaciones registradas" sub="Auditoría resumida" pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro</th></tr></thead>
            <tbody>
              {db.audit.slice(0, 6).map((a) => (
                <tr key={a.id}>
                  <td className="tiny">{dateTime(a.created_at)}</td>
                  <td className="tiny">{a.actor_email}</td>
                  <td><Badge tone="info">{a.action}</Badge></td>
                  <td className="mono tiny">{a.record_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}

/* ── PARTICIPANTES ──────────────────────────────────────────────────────── */
export function AdminParticipants() {
  const { db, account } = useStore()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('todos')
  const [group, setGroup] = useState('todos')

  const groups = Array.from(new Set(db.participants.map((p) => p.group_name)))
  const rows = db.participants.filter((p) => {
    const s = `${p.code} ${p.first_names} ${p.last_names} ${p.dni} ${p.group_name} ${p.phone}`.toLowerCase()
    return (!q || s.includes(q.toLowerCase())) && (status === 'todos' || p.status === status) && (group === 'todos' || p.group_name === group)
  })

  const cols = [
    { header: 'Código', value: (p: Participant) => p.code },
    { header: 'Nombres y apellidos', value: (p: Participant) => fullName(p) },
    { header: 'DNI', value: (p: Participant) => p.dni },
    { header: 'Celular', value: (p: Participant) => p.phone },
    { header: 'Grupo', value: (p: Participant) => p.group_name },
    { header: 'Inscripción', value: (p: Participant) => shortDate(p.created_at) },
    { header: 'Pagado', value: (p: Participant) => money(account(p.id).total_paid) },
    { header: 'Saldo', value: (p: Participant) => money(account(p.id).balance) },
    { header: 'Estado', value: (p: Participant) => enrollmentStatusLabel[p.status] },
    { header: 'Acceso docs.', value: (p: Participant) => (account(p.id).total_paid > 0 ? 'Habilitado' : 'Bloqueado') },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Participantes</h1><p className="lead">Padrón completo con estado de cuenta y acceso.</p></div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportExcel('padron_participantes', 'Participantes', cols, rows)}>
          <Icon name="download" size={15} /> Excel
        </button>
        <button className="btn" onClick={() => exportPdf({ title: 'Padrón de participantes', subtitle: `${rows.length} registro(s)`, filename: 'padron_participantes' }, cols, rows)}>
          <Icon name="download" size={15} /> PDF
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <input className="input" placeholder="Buscar por código, nombre, DNI o grupo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
            <span style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }}><Icon name="search" size={16} /></span>
          </div>
          <select className="select" style={{ maxWidth: 190 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {Object.entries(enrollmentStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 210 }} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="todos">Todos los grupos</option>
            {groups.map((g) => <option key={g}>{g}</option>)}
          </select>
          <Badge tone="neutral">{rows.length} resultado(s)</Badge>
        </div>
      </div>

      <SectionCard pad0>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Participante</th><th>DNI</th><th>Grupo</th>
                <th className="num">Pagado</th><th className="num">Saldo</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const acc = account(p.id)
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td>
                      <div className="who">
                        <Avatar src={p.photo_url} first={p.first_names} last={p.last_names} />
                        <div><strong>{fullName(p)}</strong><span>{p.phone}</span></div>
                      </div>
                    </td>
                    <td className="mono tiny">{p.dni}</td>
                    <td className="tiny">{p.group_name}</td>
                    <td className="num">{money(acc.total_paid)}</td>
                    <td className="num" style={{ color: acc.balance > 0 ? 'var(--danger)' : 'var(--ok)' }}>{money(acc.balance)}</td>
                    <td><Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge></td>
                    <td><Link className="btn btn-sm" to={`/admin/participantes/${p.id}`}>Ficha</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="users" title="Sin resultados" text="Ajusta los filtros o el término de búsqueda." />}
      </SectionCard>
    </div>
  )
}

/* ── FICHA INDIVIDUAL ───────────────────────────────────────────────────── */
export function AdminParticipantDetail() {
  const { id } = useParams()
  const { db, account, paymentsOf, attendanceOf, reviewsOf, setEnrollmentStatus, updateParticipant } = useStore()
  const p = db.participants.find((x) => x.id === id)
  const [tab, setTab] = useState<'resumen' | 'pagos' | 'asistencias' | 'qr'>('resumen')
  const [statusModal, setStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<Participant['status']>('activo')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const qr = useQr(p?.qr_token, 220)

  if (!p) return <div className="page"><Banner tone="bad" title="No encontrado">El participante solicitado no existe.</Banner></div>
  const acc = account(p.id)
  const pays = paymentsOf(p.id)
  const att = attendanceOf(p.id)
  const pct = acc.total_amount ? Math.round((acc.total_paid / acc.total_amount) * 100) : 0

  return (
    <div className="page">
      <div className="page-head">
        <Link to="/admin/participantes" className="icon-btn"><Icon name="arrowLeft" size={17} /></Link>
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>{fullName(p)}</h1>
          <p className="lead">Expediente digital · <span className="mono">{p.code}</span></p>
        </div>
        <div className="spacer" />
        <Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge>
        <button className="btn" onClick={() => { setNewStatus(p.status); setNote(p.notes || ''); setStatusModal(true) }}>
          <Icon name="edit" size={15} /> Cambiar estado
        </button>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Total pagado" value={money(acc.total_paid)} hint={`${acc.fees_paid} pago(s)`} icon="check" />
        <Stat label="Saldo pendiente" value={money(acc.balance)} hint={accountStatusLabel[acc.status]} icon="cash" tone="o" />
        <Stat label="Asistencias" value={att.filter((a) => a.status === 'presente' || a.status === 'tardanza').length} icon="clock" tone="y" />
        <Stat label="Faltas injustificadas" value={att.filter((a) => a.status === 'falta_injustificada').length} icon="alert" tone="i" />
      </div>

      <div className="grid g3" style={{ alignItems: 'start' }}>
        <SectionCard title="Fotografía selfie" sub="Referencia para verificación visual">
          <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
            {p.photo_url ? (
              <img src={p.photo_url} alt={`Selfie de ${fullName(p)}`} style={{ width: '100%', borderRadius: 14, border: '1px solid var(--line)' }} />
            ) : (
              <div className="empty" style={{ padding: 24 }}>
                <div className="ico"><Icon name="camera" size={22} /></div>
                <strong>Sin vista previa</strong>
                <span className="tiny">Archivo en Drive: <span className="mono">{p.photo_drive_id || '—'}</span></span>
              </div>
            )}
            <span className="tiny muted mono">{p.photo_drive_id}</span>
          </div>
        </SectionCard>

        <div className="stack" style={{ gridColumn: 'span 2' }}>
          <SectionCard title="Datos personales">
            <dl className="kv">
              <dt>DNI</dt><dd className="mono">{p.dni}</dd>
              <dt>Celular</dt><dd>{p.phone}</dd>
              <dt>Correo</dt><dd style={{ wordBreak: 'break-all' }}>{p.email || db.profiles.find((x) => x.id === p.profile_id)?.email || '—'}</dd>
              <dt>Dirección</dt><dd>{p.address}</dd>
              <dt>Grupo / delegación</dt><dd>{p.group_name}</dd>
              <dt>Inscripción</dt><dd>{dateTime(p.created_at)}</dd>
              {db.formFields.map((f) => p.extra?.[f.key] ? (
                <div key={f.id} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{p.extra[f.key]}</dd></div>
              ) : null)}
              <dt>Observaciones</dt><dd>{p.notes || '—'}</dd>
            </dl>
          </SectionCard>

          <SectionCard title="Estado de cuenta">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="tiny muted">{money(acc.total_paid)} de {money(acc.total_amount)}</span>
              <strong>{pct}%</strong>
            </div>
            <Progress value={pct} />
            <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={statusTone(acc.status)}>{accountStatusLabel[acc.status]}</Badge>
              {acc.next_due && <Badge tone="neutral">Próx. vencimiento {shortDate(acc.next_due)}</Badge>}
              <Badge tone={acc.total_paid > 0 ? 'ok' : 'bad'}>{acc.total_paid > 0 ? 'Documentación habilitada' : 'Documentación bloqueada'}</Badge>
            </div>
          </SectionCard>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <SectionCard pad0>
        <div style={{ padding: '12px 14px 0' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'resumen', label: 'Resumen' },
              { id: 'pagos', label: 'Pagos y comprobantes', count: pays.length },
              { id: 'asistencias', label: 'Asistencias', count: att.length },
              { id: 'qr', label: 'Código QR' },
            ]}
          />
        </div>

        {tab === 'resumen' && (
          <div className="grid g2" style={{ padding: 16 }}>
            <div>
              <h3 style={{ marginBottom: 8 }}>Últimos movimientos</h3>
              <div className="timeline">
                {[...pays.slice(0, 3).map((x) => ({ t: x.created_at, title: `Pago ${money(x.amount)} · ${x.concept}`, sub: x.status })), ...att.slice(0, 3).map((a) => ({ t: a.recorded_at, title: `Asistencia · ${attendanceStatusLabel[a.status]}`, sub: a.method }))]
                  .sort((a, b) => +new Date(b.t) - +new Date(a.t)).slice(0, 5).map((m, i) => (
                    <div key={i} className="timeline-item">
                      <div className="t">{shortDate(m.t)}</div>
                      <div><strong style={{ fontSize: '0.82rem' }}>{m.title}</strong><div className="tiny muted">{m.sub}</div></div>
                    </div>
                  ))}
                {pays.length === 0 && att.length === 0 && <p className="tiny muted">Sin movimientos registrados.</p>}
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Acciones administrativas</h3>
              <div className="stack">
                <button className="btn" onClick={() => setStatusModal(true)}><Icon name="edit" size={15} /> Cambiar estado de inscripción</button>
                <Link to="/admin/validacion" className="btn"><Icon name="check" size={15} /> Ir a validación de comprobantes</Link>
                <Link to="/admin/escaner" className="btn"><Icon name="scan" size={15} /> Registrar asistencia manual</Link>
              </div>
              <div className="banner info" style={{ marginTop: 12 }}>
                <Icon name="shield" size={16} />
                <div>Las modificaciones sobre esta ficha quedan registradas en el historial de operaciones con usuario, fecha y valores anteriores.</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'pagos' && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>N°</th><th>Fecha</th><th>Concepto</th><th className="num">Monto</th><th>Operación</th><th>Estado</th><th>Comprobante</th><th>Revisión</th></tr></thead>
              <tbody>
                {pays.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{String(x.seq).padStart(2, '0')}</td>
                    <td className="tiny">{shortDate(x.paid_at)}</td>
                    <td>{x.concept}</td>
                    <td className="num">{money(x.amount)}</td>
                    <td className="mono tiny">{x.operation_number}</td>
                    <td><Badge tone={x.status === 'validado' ? 'ok' : x.status === 'pendiente' ? 'warn' : 'bad'}>{x.status}</Badge></td>
                    <td><button className="btn btn-sm" onClick={() => setReceipt(x.receipt_url)} disabled={!x.receipt_url}><Icon name="eye" size={13} /></button></td>
                    <td className="tiny muted">{reviewsOf(x.id).length ? `${reviewsOf(x.id).length} registro(s)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pays.length === 0 && <Empty icon="cash" title="Sin pagos registrados" />}
          </div>
        )}

        {tab === 'asistencias' && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Evento</th><th>Jornada</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Registrado por</th></tr></thead>
              <tbody>
                {att.map((a) => (
                  <tr key={a.id}>
                    <td className="tiny">{db.events.find((e) => e.id === a.event_id)?.name}</td>
                    <td className="tiny">{db.sessions.find((s) => s.id === a.session_id)?.name}</td>
                    <td className="tiny">{shortDate(a.recorded_at)}</td>
                    <td className="mono tiny">{timeOnly(a.recorded_at)}</td>
                    <td><Badge tone={statusTone(a.status)}>{attendanceStatusLabel[a.status]}</Badge></td>
                    <td className="tiny">{a.recorded_by_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {att.length === 0 && <Empty icon="clock" title="Sin asistencias" />}
          </div>
        )}

        {tab === 'qr' && (
          <div style={{ padding: 16, display: 'grid', placeItems: 'center', gap: 10 }}>
            {qr ? <div className="qr-frame"><img src={qr} width={220} alt="QR" /></div> : <div className="skeleton" style={{ width: 220, height: 220 }} />}
            <div className="mono tiny">ARCANGEL2004:{p.qr_token}</div>
            <span className="tiny muted">El QR contiene únicamente este token opaco: sin DNI ni datos personales.</span>
          </div>
        )}
      </SectionCard>

      <Modal open={statusModal} onClose={() => setStatusModal(false)} title="Cambiar estado de inscripción"
        footer={<>
          <button className="btn" onClick={() => setStatusModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { setEnrollmentStatus(p.id, newStatus, note); setStatusModal(false) }}>Guardar cambio</button>
        </>}>
        <div className="stack">
          <div className="field">
            <label>Nuevo estado</label>
            <select className="select" value={newStatus} onChange={(e) => setNewStatus(e.target.value as Participant['status'])}>
              {Object.entries(enrollmentStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Observación / motivo</label>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle que verá el participante." />
          </div>
          <div className="banner warn"><Icon name="alert" size={16} /><div>El cambio queda en el historial de auditoría y notifica al participante.</div></div>
        </div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Comprobante">
        {receipt ? <img src={receipt} alt="Comprobante" style={{ width: '100%', borderRadius: 12 }} /> : <p className="muted tiny">El archivo está en la carpeta privada de Drive.</p>}
      </Modal>
    </div>
  )
}

/* ── INSCRIPCIONES (revisión) ───────────────────────────────────────────── */
export function AdminEnrollments() {
  const { db, setEnrollmentStatus } = useStore()
  const [filter, setFilter] = useState<'pendiente' | 'observado' | 'rechazado' | 'activo' | 'todos'>('pendiente')
  const [photo, setPhoto] = useState<Participant | null>(null)
  const [obs, setObs] = useState<Record<string, string>>({})
  const [queue, setQueue] = useState<Array<{ queue_no: number; user_id: string; email: string; scheduled_at: string; status: string; created_at: string }>>([])
  const [approving, setApproving] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.rpc('admin_list_registration_email_queue').then(({ data, error }) => {
      if (alive && !error && data) setQueue(data)
    })
    return () => { alive = false }
  }, [])
  const approve = async (p: Participant) => {
    if (!p.profile_id || !supabase) {
      setEnrollmentStatus(p.id, 'activo', obs[p.id] || 'Inscripción validada por la directiva.')
      return
    }
    setApproving(p.id)
    const { error } = await supabase.rpc('admin_approve_registration', {
      p_user_id: p.profile_id,
      p_notes: obs[p.id] || 'Inscripción validada por la directiva.',
    })
    setApproving(null)
    if (error) {
      window.alert('No se pudo aprobar la inscripción: ' + error.message)
      return
    }
    setEnrollmentStatus(p.id, 'activo', obs[p.id] || 'Inscripción validada por la directiva.')
    setQueue((items) => items.map((item) => item.user_id === p.profile_id ? { ...item, status: 'cancelled' } : item))
  }
  const rows = db.participants.filter((p) => (filter === 'todos' ? true : p.status === filter))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Revisión de inscripciones</h1><p className="lead">Verifica datos y selfie antes de activar al participante.</p></div>
        <div className="spacer" />
        <select className="select" style={{ maxWidth: 220 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="pendiente">Pendientes</option>
          <option value="observado">Observadas</option>
          <option value="rechazado">Rechazadas</option>
          <option value="activo">Aprobadas</option>
          <option value="todos">Todas</option>
        </select>
      </div>

      {queue.length > 0 && (
        <SectionCard title="Cola de confirmación de correos" sub="Orden original de inscripción. La aprobación manual cancela solo el correo de esa persona y no adelanta a las demás." pad0>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Turno</th><th>Correo</th><th>Envío programado</th><th>Estado</th></tr></thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.queue_no}>
                    <td className="mono tiny">#{item.queue_no}</td>
                    <td className="tiny">{item.email}</td>
                    <td className="tiny">{dateTime(item.scheduled_at)}</td>
                    <td><Badge tone={['sent','confirmed'].includes(item.status) ? 'ok' : item.status === 'cancelled' ? 'neutral' : 'warn'}>{item.status === 'confirmed' ? 'Correo confirmado' : item.status === 'sent' ? 'Enviado' : item.status === 'cancelled' ? 'Cancelado por aprobación' : item.status === 'sending' ? 'Enviando' : 'En espera'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {db.duplicates.length > 0 && (
        <SectionCard title="Registros duplicados detectados" sub="Intentos de inscripción con DNI ya registrado" pad0>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha del intento</th><th>DNI</th><th>Solicitante</th><th>Celular</th><th>Código existente</th></tr></thead>
              <tbody>
                {db.duplicates.map((d) => (
                  <tr key={d.id}>
                    <td className="tiny">{dateTime(d.attempted_at)}</td>
                    <td className="mono tiny">{d.dni}</td>
                    <td className="tiny">{d.first_names} {d.last_names}</td>
                    <td className="tiny">{d.phone}</td>
                    <td><Badge tone="warn">{d.existing_code}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <div style={{ height: 14 }} />
      <div className="grid g2">
        {rows.map((p) => (
          <section key={p.id} className="card">
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div onClick={() => setPhoto(p)} role="button" title="Ampliar selfie">
                <Avatar src={p.photo_url} first={p.first_names} last={p.last_names} size="lg" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong style={{ fontSize: '0.92rem' }}>{fullName(p)}</strong>
                  <Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge>
                </div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{p.code} · DNI {p.dni} · {p.phone}</div>
                <div className="tiny muted">{p.group_name} · {shortDate(p.created_at)}</div>
              </div>
            </div>
            {p.photo_url == null && (
              <div className="banner warn" style={{ marginTop: 10 }}><Icon name="camera" size={16} /><div>Selfie en Drive: <span className="mono">{p.photo_drive_id}</span></div></div>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <label>Observación (para estados observado/rechazado)</label>
              <input className="input" value={obs[p.id] || ''} onChange={(e) => setObs((s) => ({ ...s, [p.id]: e.target.value }))} placeholder="Motivo u observación" />
            </div>
            <div className="row wrap" style={{ marginTop: 10 }}>
              {p.status !== 'activo' && (
                <>
                  <button className="btn btn-primary btn-sm" disabled={approving === p.id} onClick={() => approve(p)}>
                    <Icon name="check" size={14} /> {approving === p.id ? 'Aprobando…' : 'Aprobar y activar'}
                  </button>
                  <button className="btn btn-sm" onClick={() => setEnrollmentStatus(p.id, 'observado', obs[p.id] || 'Ficha observada: regularizar datos.')}>
                    Observar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setEnrollmentStatus(p.id, 'rechazado', obs[p.id] || 'Inscripción rechazada.')}>
                    Rechazar
                  </button>
                </>
              )}
              <div className="spacer" />
              <Link to={`/admin/participantes/${p.id}`} className="btn btn-ghost btn-sm">Ver ficha</Link>
            </div>
          </section>
        ))}
      </div>
      {rows.length === 0 && <div className="card"><Empty icon="check" title="Sin inscripciones en este estado" /></div>}

      <Modal open={!!photo} onClose={() => setPhoto(null)} title={photo ? `Selfie · ${photo.code}` : 'Selfie'}>
        {photo?.photo_url
          ? <img src={photo.photo_url} alt="Selfie" style={{ width: '100%', borderRadius: 12 }} />
          : <Banner tone="info" title="Archivo privado">La selfie está almacenada en <span className="mono">{photo?.photo_drive_id}</span> dentro de la carpeta individual del participante.</Banner>}
      </Modal>
    </div>
  )
}

/* ── PAGOS (visión financiera) ──────────────────────────────────────────── */
export function AdminPayments() {
  const { db, account } = useStore()
  const [q, setQ] = useState('')
  const [st, setSt] = useState('todos')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = db.payments.filter((p) => {
    const part = db.participants.find((x) => x.id === p.participant_id)
    const s = `${part?.code} ${part?.first_names} ${part?.last_names} ${p.operation_number} ${p.concept}`.toLowerCase()
    const d = new Date(p.paid_at)
    return (!q || s.includes(q.toLowerCase())) && (st === 'todos' || p.status === st) &&
      (!from || d >= new Date(from)) && (!to || d <= new Date(to + 'T23:59:59'))
  })

  const validated = rows.filter((r) => r.status === 'validado').reduce((s, r) => s + r.amount, 0)
  const pending = rows.filter((r) => r.status === 'pendiente').reduce((s, r) => s + r.amount, 0)
  const rejected = rows.filter((r) => r.status === 'rechazado').reduce((s, r) => s + r.amount, 0)
  const debt = db.participants.reduce((s, p) => s + account(p.id).balance, 0)

  const cols = [
    { header: 'Código', value: (r: typeof rows[number]) => db.participants.find((x) => x.id === r.participant_id)?.code || '' },
    { header: 'Participante', value: (r: typeof rows[number]) => { const p = db.participants.find((x) => x.id === r.participant_id); return p ? fullName(p) : '' } },
    { header: 'N° pago', value: (r: typeof rows[number]) => String(r.seq).padStart(2, '0') },
    { header: 'Concepto', value: (r: typeof rows[number]) => r.concept },
    { header: 'Monto', value: (r: typeof rows[number]) => money(r.amount) },
    { header: 'Operación', value: (r: typeof rows[number]) => r.operation_number },
    { header: 'Fecha', value: (r: typeof rows[number]) => dateTime(r.paid_at) },
    { header: 'Estado', value: (r: typeof rows[number]) => r.status },
    { header: 'Comprobante', value: (r: typeof rows[number]) => r.receipt_drive_id || '' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Gestión financiera</h1><p className="lead">Recaudación, pagos por validar, rechazos y deuda total.</p></div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportExcel('reporte_pagos', 'Pagos', cols, rows)}><Icon name="download" size={15} /> Excel</button>
        <button className="btn" onClick={() => exportPdf({ title: 'Reporte de recaudación', subtitle: `${rows.length} operación(es)`, filename: 'reporte_pagos', summary: [['Validado', money(validated)], ['En revisión', money(pending)], ['Rechazado', money(rejected)]] }, cols, rows)}>
          <Icon name="download" size={15} /> PDF
        </button>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Ingresos aprobados" value={money(validated)} icon="cash" />
        <Stat label="Por validar" value={money(pending)} hint={`${rows.filter((r) => r.status === 'pendiente').length} comprobante(s)`} icon="clock" tone="y" />
        <Stat label="Rechazados" value={money(rejected)} icon="alert" tone="o" />
        <Stat label="Deuda total del padrón" value={money(debt)} icon="card" tone="i" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <input className="input" placeholder="Buscar por código, nombre u operación…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
            <span style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }}><Icon name="search" size={16} /></span>
          </div>
          <select className="select" style={{ maxWidth: 180 }} value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="todos">Todos</option><option value="validado">Aprobados</option>
            <option value="pendiente">Pendientes</option><option value="rechazado">Rechazados</option>
          </select>
          <input className="input" type="date" style={{ maxWidth: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" type="date" style={{ maxWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <SectionCard pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Participante</th><th>N°</th><th>Concepto</th><th className="num">Monto</th><th>Operación</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((r) => {
                const p = db.participants.find((x) => x.id === r.participant_id)
                return (
                  <tr key={r.id}>
                    <td className="mono tiny">{p?.code}</td>
                    <td className="tiny">{p ? fullName(p) : '—'}</td>
                    <td className="mono tiny">{String(r.seq).padStart(2, '0')}</td>
                    <td className="tiny">{r.concept}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="mono tiny">{r.operation_number}</td>
                    <td className="tiny">{shortDate(r.paid_at)}</td>
                    <td><Badge tone={r.status === 'validado' ? 'ok' : r.status === 'pendiente' ? 'warn' : 'bad'}>{r.status}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="cash" title="Sin operaciones" text="Ajusta los filtros aplicados." />}
      </SectionCard>
    </div>
  )
}

/* ── VALIDACIÓN DE COMPROBANTES ─────────────────────────────────────────── */
export function AdminValidation() {
  const { db, account, reviewPayment, reviewsOf } = useStore()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [zoom, setZoom] = useState(false)

  const pending = db.payments.filter((p) => p.status === 'pendiente')
  const current = db.payments.find((p) => p.id === (sel || pending[0]?.id || ''))
  const part = current ? db.participants.find((p) => p.id === current.participant_id) : null
  const acc = part ? account(part.id) : null

  const openPayment = (id: string) => {
    setSel(id)
    const p = db.payments.find((x) => x.id === id)
    setAmount(p ? String(p.amount) : '')
    setNote('')
  }

  const applyReview = async (action: 'validado' | 'rechazado' | 'reenvio_solicitado') => {
    if (!current || saving) return
    setSaving(true)
    const result = await reviewPayment(
      current.id, action,
      note || (action === 'validado' ? 'Comprobante conforme.' : action === 'rechazado' ? 'Comprobante rechazado.' : 'Se solicita un nuevo comprobante.'),
      action === 'validado' ? Number(amount) : undefined,
    )
    setSaving(false)
    if (!result.ok) {
      toast.push(result.error || 'No se pudo guardar la revisión.', 'err')
      return
    }
    toast.push(action === 'validado' ? 'Pago validado correctamente.' : action === 'rechazado' ? 'Pago rechazado.' : 'Se solicitó un nuevo comprobante.')
    setSel(null)
  }

  if (!current) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Validación de comprobantes</h1><p className="lead">Ningún comprobante está pendiente de revisión.</p></div></div>
        <div className="card"><Empty icon="check" title="Bandeja vacía" text="Cuando un participante envíe un comprobante aparecerá aquí para su aprobación." /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Validación de comprobantes</h1><p className="lead">Un comprobante no se considera pagado hasta su aprobación.</p></div>
        <div className="spacer" />
        <Badge tone="warn">{pending.length} pendiente(s)</Badge>
      </div>

      <div className="grid g3" style={{ alignItems: 'start' }}>
        <SectionCard title="Bandeja" sub={`${pending.length} comprobante(s)`} pad0>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {pending.map((p) => {
              const pt = db.participants.find((x) => x.id === p.participant_id)
              return (
                <button key={p.id} onClick={() => openPayment(p.id)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                    padding: '10px 12px', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer',
                    background: current.id === p.id ? 'var(--green-soft)' : 'transparent',
                  }}>
                  <Avatar src={pt?.photo_url} first={pt?.first_names || '?'} last={pt?.last_names || ''} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.82rem' }}>{pt ? fullName(pt) : '—'}</strong>
                    <div className="tiny muted">{pt?.code} · {money(p.amount)}</div>
                  </div>
                  <Icon name="arrowRight" size={15} />
                </button>
              )
            })}
          </div>
        </SectionCard>

        <div className="stack" style={{ gridColumn: 'span 2' }}>
          <SectionCard title={`Comprobante ${current.receipt_drive_id || ''}`} sub={`${part ? fullName(part) : ''} · ${part?.code || ''}`}>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <div>
                {current.receipt_url ? (
                  <img src={current.receipt_url} alt="Comprobante" onClick={() => setZoom(true)}
                    style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)', cursor: 'zoom-in' }} />
                ) : (
                  <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 12 }}>
                    <div className="ico"><Icon name="file" size={22} /></div>
                    <strong>Archivo en Drive</strong>
                    <span className="tiny mono">{current.receipt_drive_id}</span>
                  </div>
                )}
                <button className="btn btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setZoom(true)} disabled={!current.receipt_url}>
                  <Icon name="eye" size={14} /> Ampliar
                </button>
              </div>
              <div>
                <dl className="kv">
                  <dt>Participante</dt><dd>{part ? fullName(part) : '—'}</dd>
                  <dt>Código</dt><dd className="mono">{part?.code}</dd>
                  <dt>Grupo</dt><dd>{part?.group_name}</dd>
                  <dt>Monto declarado</dt><dd>{money(current.amount)}</dd>
                  <dt>N° operación</dt><dd className="mono">{current.operation_number}</dd>
                  <dt>Fecha del pago</dt><dd>{dateTime(current.paid_at)}</dd>
                  <dt>Cuenta</dt><dd>{money(acc?.total_paid || 0)} pagado · {money(acc?.balance || 0)} saldo</dd>
                  <dt>Duplicados</dt>
                  <dd>
                    {db.payments.filter((x) => x.operation_number === current.operation_number).length > 1
                      ? <Badge tone="bad">Operación repetida</Badge>
                      : <Badge tone="ok">Sin duplicados</Badge>}
                  </dd>
                </dl>
                <div className="divider" />
                <div className="field">
                  <label>Monto aprobado (S/)</label>
                  <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <span className="hint">Puedes corregir el monto si el comprobante difiere de lo declarado.</span>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Observación / motivo de rechazo</label>
                  <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. El monto no coincide con la cuota." />
                </div>
                <div className="row wrap" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={() => void applyReview('validado')} disabled={saving}>
                    <Icon name="check" size={15} /> {saving ? 'Guardando…' : 'Aprobar pago'}
                  </button>
                  <button className="btn btn-danger" onClick={() => void applyReview('rechazado')} disabled={saving}>
                    <Icon name="x" size={15} /> Rechazar
                  </button>
                  <button className="btn" onClick={() => void applyReview('reenvio_solicitado')} disabled={saving}>
                    <Icon name="upload" size={15} /> Solicitar nuevo
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Historial de revisiones de esta operación">
            <div className="timeline">
              {reviewsOf(current.id).length === 0 && <p className="tiny muted">Sin revisiones previas registradas.</p>}
              {reviewsOf(current.id).map((r) => (
                <div key={r.id} className="timeline-item">
                  <div className="t">{dateTime(r.created_at)}</div>
                  <div><strong style={{ fontSize: '0.82rem' }}>{r.action}</strong><div className="tiny muted">{r.reviewer_email} · {r.notes}</div></div>
                </div>
              ))}
            </div>
            <div className="banner info" style={{ marginTop: 10 }}>
              <Icon name="shield" size={16} />
              <div>El registro original del comprobante no se elimina: cada aprobación o rechazo se guarda como un evento adicional.</div>
            </div>
          </SectionCard>
        </div>
      </div>

      <Modal open={zoom} onClose={() => setZoom(false)} title="Comprobante" wide>
        {current.receipt_url && <img src={current.receipt_url} alt="Comprobante ampliado" style={{ width: '100%', borderRadius: 12 }} />}
      </Modal>
    </div>
  )
}
