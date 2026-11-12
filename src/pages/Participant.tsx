import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Avatar, Badge, Banner, Empty, Icon, Modal, Progress, SectionCard, Stat } from '../components/ui'
import {
  accountStatusLabel, attendanceStatusLabel, dateTime, dayMonth, enrollmentStatusLabel, money,
  shortDate, statusTone, timeOnly, fullName,
} from '../lib/utils'
import { qrDataUrl } from '../lib/qr'
import type { AttendanceStatus, DocumentItem, Payment } from '../lib/types'
import { edgeCall, supabase } from '../lib/supabase'

/* ── Hook: QR como data URL ─────────────────────────────────────────────── */
export function useQr(token: string | undefined, size = 320) {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (!token) return
    let alive = true
    qrDataUrl(token, size).then((u) => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false }
  }, [token, size])
  return url
}

function QrImage({ token, size = 300 }: { token: string; size?: number }) {
  const url = useQr(token, size)
  if (!url) return <div className="skeleton" style={{ width: size, height: size, maxWidth: '100%' }} />
  return <img src={url} alt="Código QR del participante" width={size} height={size} style={{ maxWidth: '100%', height: 'auto' }} />
}

export function Credential({ code, name, group, photo, token, status }: {
  code: string; name: string; group: string; photo: string | null; token: string; status: string
}) {
  return (
    <div className="credential">
      <div className="cred-band" />
      <div className="cred-body">
        <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
          <div className="qr-frame" style={{ padding: 8 }}>
            <div style={{ width: 150 }}><QrImage token={token} size={150} /></div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cred-code">{code}</div>
          <div className="cred-name">{name}</div>
          <div className="cred-meta">{group}</div>
          <div className="cred-meta" style={{ marginTop: 8 }}>
            <span className="badge ok" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>
              {enrollmentStatusLabel[status] || status}
            </span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar src={photo} first={name} last="" />
            <div className="cred-meta">COMPARSA SAN MIGUEL<br />ARCÁNGEL · 2004</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GuardNoParticipant() {
  return (
    <div className="page">
      <Banner tone="warn" title="Cuenta sin ficha de participante">
        Tu usuario no tiene una ficha asociada. Escribe a la directiva para que vincule tu cuenta.
      </Banner>
    </div>
  )
}

/* ── INICIO ─────────────────────────────────────────────────────────────── */
export function PHome() {
  const { user, account, db, paymentsOf, attendanceOf, documentsFor } = useStore()
  const p = user?.participant
  const nav = useNavigate()
  if (!p) return <GuardNoParticipant />
  const acc = account(p.id)
  const pays = paymentsOf(p.id)
  const att = attendanceOf(p.id)
  const docs = documentsFor(p.id)
  const nextEvent = [...db.events].filter((e) => new Date(e.starts_at) >= new Date()).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0]
  const myNotifs = db.notifications.filter((n) => n.profile_id === user?.profile.id && !n.read)
  const pendingPay = pays.find((x) => x.status === 'pendiente')
  const pct = acc.total_amount ? Math.round((acc.total_paid / acc.total_amount) * 100) : 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hola, {p.first_names.split(' ')[0]}</h1>
          <p className="lead">Este es el estado de tu participación en la comparsa.</p>
        </div>
        <div className="spacer" />
        <Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge>
      </div>

      {p.status === 'pendiente' && (
        <Banner tone="warn" title="Inscripción pendiente de revisión">
          La directiva está revisando tu ficha y tu selfie. Podrás enviar tu adelanto en cuanto tu inscripción sea validada.
        </Banner>
      )}
      {p.status === 'observado' && (
        <Banner tone="bad" title="Inscripción observada">
          {p.notes || 'La directiva registró una observación en tu ficha. Comunícate para regularizarla.'}
        </Banner>
      )}
      {p.status === 'rechazado' && <Banner tone="bad" title="Inscripción rechazada">{p.notes || 'Acércate a la directiva para más información.'}</Banner>}
      {pendingPay && <Banner tone="info" title="Comprobante en revisión">Tu comprobante de {money(pendingPay.amount)} está pendiente de validación.</Banner>}

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Costo total" value={money(acc.total_amount)} icon="card" tone="i" />
        <Stat label="Pagado validado" value={money(acc.total_paid)} hint={`${acc.fees_paid} pago(s) aprobado(s)`} icon="check" />
        <Stat label="Saldo pendiente" value={money(acc.balance)} hint={acc.next_due ? `Próx. vencimiento ${shortDate(acc.next_due)}` : 'Sin vencimientos'} icon="cash" tone="o" />
        <Stat label="Asistencias" value={att.filter((a) => a.status === 'presente' || a.status === 'tardanza').length} hint={`${att.filter((a) => a.status === 'falta_injustificada').length} falta(s)`} icon="clock" tone="y" />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Estado de cuenta" sub={accountStatusLabel[acc.status]}
          right={<Link to="/app/pagos" className="btn btn-sm">Ver detalle</Link>}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="tiny muted">Avance de pago</span>
            <strong style={{ fontSize: '0.86rem' }}>{pct}%</strong>
          </div>
          <Progress value={pct} />
          <div className="divider" />
          <div className="quota-grid">
            {Array.from({ length: Math.max(1, db.settings.installments) }).map((_, i) => {
              const quotaAmount = i === 0 ? db.settings.advance_amount
                : Math.round((db.settings.total_amount - db.settings.advance_amount) / Math.max(1, db.settings.installments - 1))
              const done = (pays.filter((x) => x.status === 'validado').length) > i
              return (
                <div key={i} style={{
                  border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px',
                  background: done ? 'var(--ok-soft)' : 'var(--paper)',
                }}>
                  <div className="tiny muted">{i === 0 ? 'Adelanto' : `Cuota ${i}`}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{money(quotaAmount)}</div>
                  <Badge tone={done ? 'ok' : 'neutral'}>{done ? 'Pagado' : 'Pendiente'}</Badge>
                </div>
              )
            })}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Link to="/app/pagos/nuevo" className="btn btn-primary btn-sm"><Icon name="upload" size={14} /> Enviar comprobante</Link>
            <Link to="/app/qr" className="btn btn-sm"><Icon name="qr" size={14} /> Mi QR</Link>
          </div>
        </SectionCard>

        <div className="stack">
          <SectionCard title="Mi credencial" sub="Identificación digital">
            <Credential code={p.code} name={fullName(p)} group={p.group_name} photo={p.photo_url} token={p.qr_token} status={p.status} />
            <Link to="/app/qr" className="btn btn-block btn-sm" style={{ marginTop: 12 }}>
              <Icon name="download" size={14} /> Ver y descargar credencial
            </Link>
          </SectionCard>

          {nextEvent && (
            <SectionCard title="Próximo evento" sub={nextEvent.name}>
              <div className="row" style={{ gap: 14 }}>
                <div style={{ textAlign: 'center', minWidth: 56, background: 'var(--green-soft)', borderRadius: 12, padding: '6px 8px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green-mid)', lineHeight: 1 }}>{new Date(nextEvent.starts_at).getDate()}</div>
                  <div className="tiny" style={{ textTransform: 'uppercase', fontWeight: 800, color: 'var(--green-mid)' }}>
                    {new Date(nextEvent.starts_at).toLocaleDateString('es-PE', { month: 'short' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{timeOnly(nextEvent.starts_at)} · {nextEvent.place}</div>
                  <div className="tiny muted">{nextEvent.description}</div>
                </div>
              </div>
              {nextEvent.requires_payment && (
                <div className="banner info" style={{ marginTop: 12 }}>
                  <Icon name="info" size={16} />
                  <div>Ingreso: requiere {money(nextEvent.min_paid_amount)} validados. Tu estado actual: <b>{money(acc.total_paid)}</b>.</div>
                </div>
              )}
              <Link to="/app/eventos" className="btn btn-sm btn-block" style={{ marginTop: 12 }}>Ver programación</Link>
            </SectionCard>
          )}

          <SectionCard title="Documentación" sub={docs.locked ? 'Acceso parcial' : 'Acceso completo'}>
            {docs.locked ? (
              <div className="banner warn">
                <Icon name="alert" size={16} />
                <div>Para acceder a todos los documentos necesitas estar validado y tener al menos un pago confirmado.</div>
              </div>
            ) : (
              <div className="banner ok"><Icon name="check" size={16} /><div>Tu acceso a la documentación institucional está habilitado.</div></div>
            )}
            <Link to="/app/documentos" className="btn btn-sm btn-block" style={{ marginTop: 12 }}><Icon name="book" size={14} /> Abrir biblioteca</Link>
          </SectionCard>

          {myNotifs.length > 0 && (
            <SectionCard title={`Notificaciones (${myNotifs.length})`}>
              <div className="stack">
                {myNotifs.slice(0, 4).map((n) => (
                  <div key={n.id} className="notif unread">
                    <Icon name="bell" size={16} />
                    <div><strong style={{ fontSize: '0.8rem' }}>{n.title}</strong><div className="tiny muted">{n.body}</div></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── MI PERFIL ──────────────────────────────────────────────────────────── */
export function PProfile() {
  const { user, db } = useStore()
  const p = user?.participant
  if (!p) return <GuardNoParticipant />
  return (
    <div className="page">
      <div className="page-head"><div><h1>Mi perfil</h1><p className="lead">Datos registrados en tu inscripción.</p></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Datos personales">
          <div className="row" style={{ gap: 16, marginBottom: 16 }}>
            <Avatar src={p.photo_url} first={p.first_names} last={p.last_names} size="lg" />
            <div>
              <h2 style={{ fontSize: '1.05rem' }}>{fullName(p)}</h2>
              <div className="tiny muted">{p.group_name}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge>
                <Badge tone="neutral">{p.code}</Badge>
              </div>
            </div>
          </div>
          <dl className="kv">
            <dt>DNI</dt><dd className="mono">{p.dni}</dd>
            <dt>Celular</dt><dd>{p.phone}</dd>
            <dt>Correo</dt><dd style={{ wordBreak: 'break-all' }}>{user?.profile.email}</dd>
            <dt>Dirección</dt><dd>{p.address}</dd>
            <dt>Grupo / delegación</dt><dd>{p.group_name}</dd>
            <dt>Fecha de inscripción</dt><dd>{dateTime(p.created_at)}</dd>
            {db.formFields.map((f) => p.extra?.[f.key] ? (
              <div key={f.id} style={{ display: 'contents' }}>
                <dt>{f.label}</dt><dd>{p.extra[f.key]}</dd>
              </div>
            ) : null)}
            {p.notes && (<><dt>Observaciones</dt><dd>{p.notes}</dd></>)}
          </dl>
        </SectionCard>
        <SectionCard title="Mi credencial digital">
          <Credential code={p.code} name={fullName(p)} group={p.group_name} photo={p.photo_url} token={p.qr_token} status={p.status} />
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Presenta este QR en cada jornada. El controlador verificará tu fotografía y registrará tu asistencia.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

/* ── MI INSCRIPCIÓN ─────────────────────────────────────────────────────── */
export function PEnrollment() {
  const { user, db, account } = useStore()
  const p = user?.participant
  if (!p) return <GuardNoParticipant />
  const acc = account(p.id)
  const steps = [
    { label: 'Datos y selfie enviados', done: true, when: dateTime(p.created_at) },
    { label: 'Revisión de la directiva', done: p.status !== 'pendiente', when: p.status === 'pendiente' ? 'En revisión' : 'Revisado' },
    { label: 'Inscripción validada', done: ['inscrito', 'activo'].includes(p.status), when: ['inscrito', 'activo'].includes(p.status) ? 'Validada' : 'Pendiente' },
    { label: 'Primer pago aprobado', done: acc.total_paid > 0, when: acc.total_paid > 0 ? money(acc.total_paid) : 'Pendiente' },
    { label: 'Documentación habilitada', done: acc.total_paid > 0 && ['inscrito', 'activo'].includes(p.status), when: acc.total_paid > 0 ? 'Habilitada' : 'Bloqueada' },
  ]
  return (
    <div className="page">
      <div className="page-head"><div><h1>Mi inscripción</h1><p className="lead">Estado del proceso y condiciones de acceso.</p></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Proceso de inscripción" sub={`Código ${p.code}`}>
          <div className="timeline">
            {steps.map((s) => (
              <div key={s.label} className="timeline-item">
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: s.done ? 'var(--ok-soft)' : '#f0f2ee', color: s.done ? 'var(--ok)' : 'var(--muted)', flex: 'none' }}>
                  <Icon name={s.done ? 'check' : 'clock'} size={13} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.label}</div>
                  <div className="tiny muted">{s.when}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Condiciones vigentes">
          <dl className="kv">
            <dt>Estado</dt><dd><Badge tone={statusTone(p.status)}>{enrollmentStatusLabel[p.status]}</Badge></dd>
            <dt>Costo de participación</dt><dd>{money(acc.total_amount)}</dd>
            <dt>Adelanto obligatorio</dt><dd>{money(db.settings.advance_amount)}</dd>
            <dt>Número de cuotas</dt><dd>{db.settings.installments}</dd>
            <dt>Primer vencimiento</dt><dd>{shortDate(db.settings.first_due_date)}</dd>
            <dt>Total validado</dt><dd>{money(acc.total_paid)}</dd>
            <dt>Saldo</dt><dd>{money(acc.balance)}</dd>
          </dl>
          <div className="divider" />
          <div className="banner info">
            <Icon name="info" size={16} />
            <div>La documentación institucional se habilita al estar inscrito y contar con al menos un pago confirmado por la administración.</div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/* ── MIS PAGOS ──────────────────────────────────────────────────────────── */
export function PPayments() {
  const { user, account, paymentsOf, reviewsOf, db } = useStore()
  const p = user?.participant
  const [receipt, setReceipt] = useState<Payment | null>(null)
  const [history, setHistory] = useState<Payment | null>(null)
  if (!p) return <GuardNoParticipant />
  const acc = account(p.id)
  const pays = paymentsOf(p.id)
  const pct = acc.total_amount ? Math.round((acc.total_paid / acc.total_amount) * 100) : 0

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Mis pagos</h1><p className="lead">Cada comprobante es validado por la directiva antes de afectar tu saldo.</p></div>
        <div className="spacer" />
        <Link to="/app/pagos/nuevo" className="btn btn-primary"><Icon name="upload" size={16} /> Enviar comprobante</Link>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Costo total" value={money(acc.total_amount)} icon="card" tone="i" />
        <Stat label="Total pagado" value={money(acc.total_paid)} hint={`${acc.fees_paid} aprobado(s)`} icon="check" />
        <Stat label="En revisión" value={money(acc.pending_amount)} hint={`${pays.filter((x) => x.status === 'pendiente').length} comprobante(s)`} icon="clock" tone="y" />
        <Stat label="Saldo pendiente" value={money(acc.balance)} hint={accountStatusLabel[acc.status]} icon="cash" tone="o" />
      </div>

      <SectionCard title="Avance de pago" sub={acc.next_due ? `Próximo vencimiento: ${shortDate(acc.next_due)}` : 'Sin vencimientos programados'}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="tiny muted">{money(acc.total_paid)} de {money(acc.total_amount)}</span>
          <strong>{pct}%</strong>
        </div>
        <Progress value={pct} />
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Yape institucional: <b>{db.settings.yape_number}</b> · {db.settings.yape_holder}
        </div>
      </SectionCard>

      <div style={{ height: 14 }} />
      <SectionCard title={`Historial de pagos (${pays.length})`} pad0>
        {pays.length === 0 ? (
          <Empty icon="cash" title="Aún no registras pagos" text="Envía tu primer comprobante de Yape para iniciar tu historial." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th><th>Fecha</th><th>Concepto</th><th className="num">Monto</th>
                  <th>Operación</th><th>Estado</th><th>Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {pays.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{String(x.seq).padStart(2, '0')}</td>
                    <td>{shortDate(x.paid_at)}</td>
                    <td>{x.concept}</td>
                    <td className="num">{money(x.amount)}</td>
                    <td className="mono tiny">{x.operation_number}</td>
                    <td><Badge tone={x.status === 'validado' ? 'ok' : x.status === 'pendiente' ? 'warn' : 'bad'}>{x.status === 'validado' ? 'Aprobado' : x.status === 'pendiente' ? 'En revisión' : 'Rechazado'}</Badge></td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setReceipt(x)}><Icon name="eye" size={13} /> Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title={`Comprobante ${receipt?.receipt_drive_id || ''}`}
        footer={<>
          <button className="btn" onClick={() => setHistory(receipt)}>Ver trazabilidad</button>
          <button className="btn btn-primary" onClick={() => setReceipt(null)}>Cerrar</button>
        </>}>
        {receipt && (
          <div className="stack">
            {receipt.receipt_url ? (
              <div className="selfie-preview"><img src={receipt.receipt_url} alt="Comprobante" /></div>
            ) : (
              <div className="banner info"><Icon name="file" size={16} /><div>El archivo está almacenado en tu carpeta privada de Google Drive como <span className="mono">{receipt.receipt_drive_id}</span>.</div></div>
            )}
            <dl className="kv">
              <dt>Monto</dt><dd>{money(receipt.amount)}</dd>
              <dt>Fecha de pago</dt><dd>{dateTime(receipt.paid_at)}</dd>
              <dt>N° de operación</dt><dd className="mono">{receipt.operation_number}</dd>
              <dt>Estado</dt><dd><Badge tone={receipt.status === 'validado' ? 'ok' : receipt.status === 'pendiente' ? 'warn' : 'bad'}>{receipt.status}</Badge></dd>
              {receipt.reject_reason && (<><dt>Motivo de rechazo</dt><dd style={{ color: 'var(--danger)' }}>{receipt.reject_reason}</dd></>)}
              {receipt.notes && (<><dt>Observaciones</dt><dd>{receipt.notes}</dd></>)}
            </dl>
          </div>
        )}
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} title="Trazabilidad de la validación">
        <div className="timeline">
          {history && reviewsOf(history.id).length === 0 && <p className="muted tiny">Aún no hay revisión administrativa registrada.</p>}
          {history && reviewsOf(history.id).map((r) => (
            <div key={r.id} className="timeline-item">
              <div className="t">{dateTime(r.created_at)}</div>
              <div>
                <strong style={{ fontSize: '0.83rem' }}>{r.action === 'validado' ? 'Pago aprobado' : r.action === 'rechazado' ? 'Pago rechazado' : 'Observado'}</strong>
                <div className="tiny muted">{r.reviewer_email}</div>
                {r.notes && <div className="tiny" style={{ marginTop: 3 }}>{r.notes}</div>}
              </div>
            </div>
          ))}
          {history && (
            <div className="timeline-item">
              <div className="t">{dateTime(history.created_at)}</div>
              <div><strong style={{ fontSize: '0.83rem' }}>Comprobante enviado</strong><div className="tiny muted">Monto {money(history.amount)} · ref. {history.receipt_drive_id}</div></div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

/* ── ENVIAR COMPROBANTE ─────────────────────────────────────────────────── */
export function PNewPayment() {
  const { user, db, account, paymentsOf, submitPayment } = useStore()
  const nav = useNavigate()
  const p = user?.participant
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [op, setOp] = useState('')
  const [concept, setConcept] = useState('Cuota')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<{ seq: number; reference: string } | null>(null)
  const [yapeQr, setYapeQr] = useState('')

  const myPays = p ? paymentsOf(p.id) : []
  const nextSeq = myPays.reduce((m, x) => Math.max(m, x.seq), 0) + 1
  const acc = p ? account(p.id) : null
  const suggested = useMemo(() => {
    if (!acc) return 0
    const first = myPays.filter((x) => x.status === 'validado').length === 0
    if (first) return Math.min(db.settings.advance_amount, acc.balance || db.settings.advance_amount)
    return Math.min(
      Math.round((db.settings.total_amount - db.settings.advance_amount) / Math.max(1, db.settings.installments - 1)),
      acc.balance,
    )
  }, [acc, myPays, db.settings])

  useEffect(() => {
    if (!db.settings.yape_number) return
    qrDataUrl(`YAPE:${db.settings.yape_number.replace(/\s/g, '')}:${db.settings.yape_holder}`, 220)
      .then(setYapeQr).catch(() => {})
  }, [db.settings.yape_number, db.settings.yape_holder])

  useEffect(() => { if (!amount && suggested) setAmount(String(suggested)) }, [suggested, amount])

  if (!p) return <GuardNoParticipant />
  if (acc && acc.balance <= 0) {
    return (
      <div className="page">
        <Banner tone="ok" title="Tu cuenta está al día">No tienes saldo pendiente. Si realizaste un pago adicional, comunícalo a la directiva.</Banner>
      </div>
    )
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('El comprobante debe ser una imagen (JPG o PNG).'); return }
    if (file.size > 6 * 1024 * 1024) { setErr('La imagen no debe superar 6 MB.'); return }
    setErr('')
    const fr = new FileReader()
    fr.onload = () => setReceipt(String(fr.result))
    fr.readAsDataURL(file)
  }

  const send = async () => {
    setErr('')
    if (!receipt) { setErr('Adjunta la fotografía del comprobante de Yape.'); return }
    setBusy(true)
    const res = await submitPayment(p.id, {
      amount: Number(amount), operation_number: op, paid_at: paidAt, concept, receiptDataUrl: receipt, notes,
    })
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'No se pudo enviar el comprobante.'); return }
    setOk({ seq: res.seq!, reference: res.reference! })
  }

  if (ok) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}>
              <Icon name="check" size={28} />
            </div>
            <h1>Comprobante enviado</h1>
            <p className="muted">Quedó registrado con el número correlativo <b>{String(ok.seq).padStart(2, '0')}</b>.</p>
            <div className="mono" style={{ background: 'var(--green-soft)', padding: '8px 12px', borderRadius: 8 }}>{ok.reference}</div>
            <div className="banner warn" style={{ textAlign: 'left' }}>
              <Icon name="clock" size={16} />
              <div>Estado: <b>pendiente de validación</b>. El pago no se considera confirmado hasta que la directiva lo apruebe.</div>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => nav('/app/pagos')}>Volver a mis pagos</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Enviar comprobante</h1><p className="lead">Paga por Yape y registra aquí tu comprobante con su número de operación.</p></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="1. Datos para el pago" sub="Yape institucional">
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            {yapeQr && <div className="qr-frame" style={{ padding: 8 }}><img src={yapeQr} alt="QR de Yape" width={110} /></div>}
            <div>
              <div className="tiny muted">Número Yape</div>
              <div style={{ fontSize: '1.24rem', fontWeight: 800, letterSpacing: '.02em' }}>{db.settings.yape_number}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{db.settings.yape_holder}</div>
              <div className="badge info" style={{ marginTop: 8 }}>Monto sugerido {money(suggested)}</div>
            </div>
          </div>
          <div className="divider" />
          <div className="banner info">
            <Icon name="info" size={16} />
            <div>Transfiere el monto y guarda la captura. Al subirla, el sistema la guarda como
              <span className="mono"> {p.code}_PAGO_{String(nextSeq).padStart(2, '0')}.jpg</span>.</div>
          </div>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>Saldo pendiente</dt><dd>{money(acc?.balance || 0)}</dd>
            <dt>Cuotas aprobadas</dt><dd>{myPays.filter((x) => x.status === 'validado').length} de {db.settings.installments}</dd>
          </dl>
        </SectionCard>

        <SectionCard title="2. Registrar el comprobante">
          <div className="stack">
            <div className="form-grid">
              <div className="field">
                <label>Monto (S/) <span className="req">*</span></label>
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120.00" />
              </div>
              <div className="field">
                <label>N° de operación <span className="req">*</span></label>
                <input className="input" value={op} onChange={(e) => setOp(e.target.value)} placeholder="Ej. 884512" />
              </div>
              <div className="field">
                <label>Concepto</label>
                <select className="select" value={concept} onChange={(e) => setConcept(e.target.value)}>
                  <option>Adelanto obligatorio</option><option>Cuota</option><option>Pago parcial</option><option>Aporte adicional</option>
                </select>
              </div>
              <div className="field">
                <label>Fecha y hora del pago</label>
                <input className="input" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
              <div className="field full">
                <label>Comprobante (captura de Yape) <span className="req">*</span></label>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
                {receipt ? (
                  <div className="selfie-preview"><img src={receipt} alt="Comprobante cargado" /></div>
                ) : (
                  <button className="btn btn-block" style={{ minHeight: 74, borderStyle: 'dashed' }} onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={18} /> Subir imagen del comprobante
                  </button>
                )}
                {receipt && <button className="btn btn-sm" onClick={() => setReceipt(null)}>Cambiar imagen</button>}
              </div>
              <div className="field full">
                <label>Observaciones (opcional)</label>
                <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Pago realizado por mi hermano." />
              </div>
            </div>
            {err && <Banner tone="bad" title="No se pudo enviar">{err}</Banner>}
            <button className="btn btn-primary btn-block" style={{ minHeight: 44 }} onClick={send} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar a validación'}
            </button>
            <p className="tiny muted">Se rechazan automáticamente los números de operación ya registrados para evitar pagos duplicados.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/* ── MI CÓDIGO QR ───────────────────────────────────────────────────────── */
export function PQR() {
  const { user } = useStore()
  const p = user?.participant
  if (!p) return <GuardNoParticipant />
  const url = useQr(p.qr_token, 420)
  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.code}_QR.png`
    a.click()
  }
  return (
    <div className="page">
      <div className="page-head"><div><h1>Mi código QR</h1><p className="lead">Identificación única y permanente para el control de asistencia.</p></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Credencial digital">
          <Credential code={p.code} name={fullName(p)} group={p.group_name} photo={p.photo_url} token={p.qr_token} status={p.status} />
          <button className="btn btn-block btn-sm" style={{ marginTop: 12 }} onClick={() => window.print()}>
            <Icon name="download" size={14} /> Imprimir credencial
          </button>
        </SectionCard>
        <SectionCard title="Código QR individual" sub="Contiene solo un token opaco, sin datos personales">
          <div style={{ display: 'grid', placeItems: 'center', gap: 14 }}>
            <div className="qr-frame"><div style={{ width: 260 }}>{url ? <img src={url} alt="QR" /> : <div className="skeleton" style={{ width: 260, height: 260 }} />}</div></div>
            <div className="mono tiny" style={{ wordBreak: 'break-all', textAlign: 'center' }}>ARCANGEL2004:{p.qr_token}</div>
            <div className="row">
              <button className="btn btn-primary" onClick={download}><Icon name="download" size={16} /> Descargar PNG</button>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(`ARCANGEL2004:${p.qr_token}`)}>Copiar token</button>
            </div>
            <div className="banner info">
              <Icon name="shield" size={16} />
              <div>El QR no expone tu DNI, tu nombre ni tu estado de cuenta. Solo la aplicación puede interpretarlo.</div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/* ── MIS ASISTENCIAS ────────────────────────────────────────────────────── */
export function PAttendance() {
  const { user, db, attendanceOf } = useStore()
  const p = user?.participant
  if (!p) return <GuardNoParticipant />
  const rows = attendanceOf(p.id)
  const present = rows.filter((a) => a.status === 'presente').length
  const late = rows.filter((a) => a.status === 'tardanza').length
  const fj = rows.filter((a) => a.status === 'falta_justificada').length
  const fi = rows.filter((a) => a.status === 'falta_injustificada').length
  const total = present + late + fj + fi
  const pct = total ? Math.round(((present + late) / total) * 100) : 0

  return (
    <div className="page">
      <div className="page-head"><div><h1>Mis asistencias</h1><p className="lead">Registro por evento y jornada.</p></div></div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Presente" value={present} icon="check" />
        <Stat label="Tardanzas" value={late} icon="clock" tone="y" />
        <Stat label="Faltas justificadas" value={fj} icon="info" tone="i" />
        <Stat label="Faltas injustificadas" value={fi} icon="alert" tone="o" />
      </div>
      <SectionCard title="Porcentaje de asistencia" sub={`${pct}% de asistencia efectiva sobre ${total} jornada(s) registradas`}>
        <Progress value={pct} orange={pct < 70} />
      </SectionCard>
      <div style={{ height: 14 }} />
      <SectionCard title="Historial" pad0>
        {rows.length === 0 ? <Empty icon="clock" title="Sin registros" text="Tu asistencia aparecerá cuando el controlador escanee tu QR." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Evento</th><th>Jornada</th><th>Fecha</th><th>Hora</th><th>Estado</th><th>Registro</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{db.events.find((e) => e.id === a.event_id)?.name || '—'}</td>
                    <td>{db.sessions.find((s) => s.id === a.session_id)?.name || '—'}</td>
                    <td>{shortDate(a.recorded_at)}</td>
                    <td className="mono">{timeOnly(a.recorded_at)}</td>
                    <td><Badge tone={statusTone(a.status)}>{attendanceStatusLabel[a.status]}</Badge></td>
                    <td className="tiny muted">{a.method === 'qr' ? 'Escaneo QR' : 'Manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ── DOCUMENTACIÓN ──────────────────────────────────────────────────────── */
export function PDocuments() {
  const { user, documentsFor, ready } = useStore()
  const p = user?.participant
  const { docs: registeredDocs, locked } = documentsFor(p?.id || null)
  const [driveDocs, setDriveDocs] = useState<DocumentItem[]>([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveError, setDriveError] = useState('')
  const [openingDocument, setOpeningDocument] = useState<string | null>(null)
  useEffect(() => {
    if (!p || !ready) return
    let active = true
    setDriveLoading(true)
    setDriveError('')
    edgeCall<{ ok: boolean; documents: DocumentItem[] }>('drive-sync', { kind: 'list_documents' })
      .then((result) => { if (active) setDriveDocs(result.documents || []) })
      .catch((error) => { if (active) setDriveError(error instanceof Error ? error.message : 'No se pudo consultar Google Drive.') })
      .finally(() => { if (active) setDriveLoading(false) })
    return () => { active = false }
  }, [p?.id, ready])
  const docs = useMemo(() => {
    const available = registeredDocs.filter((doc) => !!doc.file_url || !!doc.drive_file_id)
    const known = new Set(available.map((doc) => doc.drive_file_id).filter(Boolean))
    return [...available, ...driveDocs.filter((doc) => !known.has(doc.drive_file_id))]
  }, [registeredDocs, driveDocs])
  const openDocument = async (doc: DocumentItem) => {
    if (doc.file_url) {
      window.open(doc.file_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!doc.drive_file_id || !supabase) return
    const tab = window.open('', '_blank')
    if (!tab) {
      setDriveError('Permite las ventanas emergentes para abrir los documentos.')
      return
    }
    tab.document.title = 'Abriendo documento…'
    setOpeningDocument(doc.id)
    setDriveError('')
    try {
      const { data: authData } = await supabase.auth.getSession()
      const accessToken = authData.session?.access_token
      if (!accessToken) throw new Error('Tu sesión ha caducado. Vuelve a ingresar a la plataforma.')
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ kind: 'download_document', fileId: doc.drive_file_id }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'No se pudo abrir el documento.')
      }
      const url = URL.createObjectURL(await response.blob())
      tab.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      tab.close()
      setDriveError(error instanceof Error ? error.message : 'No se pudo abrir el documento.')
    } finally {
      setOpeningDocument(null)
    }
  }
  const cats = Array.from(new Set(docs.map((d) => d.category)))
  return (
    <div className="page">
      <div className="page-head"><div><h1>Documentación institucional</h1><p className="lead">Biblioteca privada de la asociación.</p></div></div>
      {driveLoading && <Banner tone="info" title="Cargando biblioteca">Consultando las carpetas institucionales de Google Drive…</Banner>}
      {driveError && <Banner tone="bad" title="No se pudo cargar Google Drive">{driveError}</Banner>}
      {locked && (
        <Banner tone="warn" title="Acceso parcial">
          Para acceder a toda la documentación debes estar inscrito y tener al menos un pago confirmado por la administración.
        </Banner>
      )}
      <div style={{ height: 14 }} />
      {cats.length === 0 && !driveLoading && <div className="card"><Empty icon="book" title="Sin documentos disponibles" text={driveError ? 'No se pudo consultar la biblioteca. Intenta recargar la página.' : 'Aún no hay archivos en las carpetas institucionales habilitadas.'} /></div>}
      {cats.map((c) => (
        <div key={c} style={{ marginBottom: 14 }}>
          <SectionCard title={c} pad0>
            <div className="stack" style={{ padding: 14 }}>
              {docs.filter((d) => d.category === c).map((d) => (
                <div key={d.id} className="row" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--green-soft)', color: 'var(--green-mid)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="doc" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.85rem' }}>{d.title}</strong>
                    <div className="tiny muted">{d.description} · {d.size_label} · {shortDate(d.published_at)}</div>
                  </div>
                  <button className="btn btn-sm" disabled={(!d.file_url && !d.drive_file_id) || openingDocument === d.id}
                    onClick={() => void openDocument(d)}>
                    <Icon name="download" size={13} /> {openingDocument === d.id ? 'Abriendo…' : 'Abrir'}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ))}
    </div>
  )
}

/* ── COMUNICADOS ────────────────────────────────────────────────────────── */
export function PAnnouncements() {
  const { db } = useStore()
  const list = [...db.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.published_at) - +new Date(a.published_at))
  return (
    <div className="page">
      <div className="page-head"><div><h1>Comunicados</h1><p className="lead">Avisos oficiales de la directiva.</p></div></div>
      <div className="stack">
        {list.length === 0 && <div className="card"><Empty icon="megaphone" title="Sin comunicados" /></div>}
        {list.map((a) => (
          <article key={a.id} className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: '1rem' }}>{a.title}</h2>
              {a.pinned && <Badge tone="warn">Fijado</Badge>}
              <div className="spacer" />
              <span className="tiny muted">{shortDate(a.published_at)}</span>
            </div>
            <p className="tiny" style={{ lineHeight: 1.65 }}>{a.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

/* ── EVENTOS ────────────────────────────────────────────────────────────── */
export function PEvents() {
  const { db, account, user } = useStore()
  const p = user?.participant
  const acc = p ? account(p.id) : null
  const events = [...db.events].filter((e) => e.active).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
  return (
    <div className="page">
      <div className="page-head"><div><h1>Eventos y actividades</h1><p className="lead">Ensayos, reuniones, presentaciones y desfiles.</p></div></div>
      <div className="grid g2">
        {events.map((e) => {
          const allowed = !e.requires_payment || (acc?.total_paid || 0) >= e.min_paid_amount
          const sessions = db.sessions.filter((s) => s.event_id === e.id)
          return (
            <section key={e.id} className="card">
              <div className="row" style={{ marginBottom: 8 }}>
                <Badge tone={allowed ? 'ok' : 'warn'}>{allowed ? 'Ingreso habilitado' : 'Ingreso restringido'}</Badge>
                <div className="spacer" />
                <span className="tiny muted">{shortDate(e.starts_at)}</span>
              </div>
              <h2 style={{ fontSize: '1rem', marginBottom: 4 }}>{e.name}</h2>
              <p className="tiny muted">{e.description}</p>
              <div className="divider" />
              <dl className="kv">
                <dt>Lugar</dt><dd>{e.place}</dd>
                <dt>Horario</dt><dd>{timeOnly(e.starts_at)} – {timeOnly(e.ends_at)}</dd>
                <dt>Jornadas</dt><dd>{sessions.length || 1}</dd>
                {e.requires_payment && <><dt>Requisito de pago</dt><dd>{money(e.min_paid_amount)} validados</dd></>}
              </dl>
              {sessions.length > 0 && (
                <div className="stack" style={{ marginTop: 10 }}>
                  {sessions.map((s) => (
                    <div key={s.id} className="row tiny" style={{ justifyContent: 'space-between', borderBottom: '1px dashed var(--line)', paddingBottom: 4 }}>
                      <span>{s.name}</span><span className="mono">{s.start_time}–{s.end_time}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default PHome
