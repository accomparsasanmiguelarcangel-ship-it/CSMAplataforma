import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import {
  Avatar, Badge, Banner, Empty, Field, Icon, Modal, Progress, SectionCard, Stat, Tabs, useToast,
} from '../components/ui'
import { QrScanner } from '../components/Camera'
import {
  attendanceStatusLabel, dateTime, fullName, money, shortDate, statusTone, timeOnly, todayISO, roleLabel,
} from '../lib/utils'
import { parseQr } from '../lib/qr'
import { edgeCall } from '../lib/supabase'
import { exportExcel, exportPdf } from '../lib/export'
import type { AttendanceStatus, DocumentItem, EventItem, FormField, LookupCard, Profile, SessionItem } from '../lib/types'

/* ══════════════════════ ESCÁNER QR / CONTROL DE ASISTENCIA ═══════════════ */
export function AdminScanner() {
  const { db, lookupByToken, registerAttendance, account } = useStore()
  const toast = useToast()
  const [card, setCard] = useState<LookupCard | null>(null)
  const [manual, setManual] = useState('')
  const [sessionId, setSessionId] = useState(db.sessions[0]?.id || '')
  const [err, setErr] = useState('')
  const [last, setLast] = useState<{ name: string; at: string; status: string } | null>(null)
  const [warnDup, setWarnDup] = useState<string | null>(null)

  useEffect(() => {
    if (db.sessions.some((s) => s.id === sessionId)) return
    const today = todayISO()
    const preferred = [...db.sessions]
      .filter((s) => s.session_date >= today)
      .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_time.localeCompare(b.start_time))[0]
      || [...db.sessions].sort((a, b) => b.session_date.localeCompare(a.session_date) || b.start_time.localeCompare(a.start_time))[0]
    setSessionId(preferred?.id || '')
  }, [db.sessions, sessionId])

  const session = db.sessions.find((s) => s.id === sessionId)
  const event = session ? db.events.find((e) => e.id === session.event_id) : null

  const todaySessions = db.sessions.filter((s) => s.session_date === todayISO())
  const suggestedSessions = todaySessions.length ? todaySessions : db.sessions

  const onDetected = (raw: string) => {
    if (!sessionId || !session) {
      setErr('Primero programa una jornada en Eventos y jornadas y selecciónala aquí.')
      return
    }
    const token = parseQr(raw)
    if (!token) { setErr('El código escaneado no pertenece a esta asociación.'); return }
    const found = lookupByToken(token)
    if (!found) { setErr('No existe un participante con ese código QR.'); return }
    setErr('')
    const first = db.attendance
      .filter((a) => a.participant_id === found.participant.id && a.session_id === sessionId && a.entry_type === 'entrada')
      .sort((a, b) => +new Date(a.recorded_at) - +new Date(b.recorded_at))[0]
    setWarnDup(first ? `Este participante ya fue registrado hoy a las ${timeOnly(first.recorded_at)}.` : null)
    setCard({ ...found, already_checked_in: !!first, first_entry_at: first?.recorded_at || null })
  }

  const confirm = (force: boolean) => {
    if (!card) return
    const res = registerAttendance({ participantId: card.participant.id, sessionId, method: 'qr', force })
    if (!res.ok) { setErr(res.error || 'No se pudo registrar.'); return }
    setLast({ name: fullName(card.participant), at: new Date().toISOString(), status: 'presente' })
    toast.push(`Asistencia registrada: ${fullName(card.participant)}`)
    setCard(null)
    setWarnDup(null)
  }

  const searchManual = () => {
    const q = manual.trim().toLowerCase()
    if (!q) return
    const p = db.participants.find((x) => x.code.toLowerCase() === q || x.dni === q || fullName(x).toLowerCase().includes(q))
    if (!p) { setErr('No se encontró un participante con ese código, DNI o nombre.'); return }
    const token = p.qr_token
    onDetected(`ARCANGEL2004:${token}`)
    setManual('')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Control de asistencia</h1><p className="lead">Escanea la credencial, verifica la fotografía y confirma el ingreso.</p></div>
        <div className="spacer" />
        <Badge tone="info">{db.participants.filter((p) => p.status === 'activo').length} participantes activos</Badge>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <div className="field" style={{ minWidth: 260, flex: 1 }}>
            <label>Jornada activa</label>
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {suggestedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {db.events.find((e) => e.id === s.event_id)?.name} — {s.name} ({s.session_date})
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <div className="tiny muted">Evento</div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{event?.name || '—'}</div>
            <div className="tiny muted">{session ? `${session.start_time}–${session.end_time} · tardanza después de ${session.late_after}` : ''}</div>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Escáner QR" sub="Cámara trasera del dispositivo">
          {session ? <QrScanner onDetected={onDetected} onError={(m) => setErr(m)} /> : (
            <Banner tone="warn" title="No hay jornadas programadas">
              Para registrar asistencia, crea primero un evento y al menos una jornada desde <Link to="/admin/eventos">Eventos y jornadas</Link>. Cuando exista una jornada, aparecerá aquí para seleccionarla.
            </Banner>
          )}
          <div className="divider" />
          <div className="field">
            <label>Registro manual (participante sin QR)</label>
            <div className="row">
              <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Código, DNI o nombre" onKeyDown={(e) => e.key === 'Enter' && searchManual()} />
              <button className="btn" onClick={searchManual}><Icon name="search" size={15} /></button>
            </div>
            <span className="hint">El registro manual conserva el usuario que lo realizó y el motivo.</span>
          </div>
          {err && <Banner tone="bad" title="No se pudo procesar">{err}</Banner>}
        </SectionCard>

        <div className="stack">
          {card ? (
            <SectionCard title="Verificación de identidad" sub="Compara la fotografía con la persona presente">
              {warnDup && <Banner tone="warn" title="Registro duplicado">{warnDup}</Banner>}
              <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginTop: warnDup ? 12 : 0 }}>
                {card.participant.photo_url ? (
                  <img src={card.participant.photo_url} alt="Selfie" style={{ width: 132, height: 168, objectFit: 'cover', borderRadius: 12, border: '2px solid #fff', boxShadow: 'var(--shadow)' }} />
                ) : (
                  <div className="empty" style={{ width: 132, padding: 12, border: '1px dashed var(--line)', borderRadius: 12 }}>
                    <Icon name="camera" size={22} /><span className="tiny">Sin vista previa</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.05rem' }}>{fullName(card.participant)}</h2>
                  <div className="mono tiny" style={{ color: 'var(--green-mid)', fontWeight: 700 }}>{card.participant.code}</div>
                  <div className="tiny muted">{card.participant.group_name}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                    <Badge tone={statusTone(card.participant.status)}>Inscripción: {card.participant.status}</Badge>
                    <Badge tone={card.entry_allowed ? 'ok' : 'bad'}>{card.entry_allowed ? 'Ingreso autorizado' : 'Ingreso restringido'}</Badge>
                    <span className="tiny muted">{card.entry_reason}</span>
                    <span className="tiny muted">Pagado {money(card.account.total_paid)} · saldo {money(card.account.balance)}</span>
                  </div>
                </div>
              </div>
              <div className="row wrap" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => confirm(false)} disabled={!card.entry_allowed && !warnDup}>
                  <Icon name="check" size={15} /> Confirmar ingreso
                </button>
                {warnDup && (
                  <button className="btn" onClick={() => confirm(true)}>
                    <Icon name="clock" size={15} /> Registrar de todos modos
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => { setCard(null); setWarnDup(null) }}>Cancelar</button>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Últimos ingresos" sub="Registro de esta jornada" pad0>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Participante</th><th>Hora</th><th>Estado</th></tr></thead>
                  <tbody>
                    {db.attendance.filter((a) => a.session_id === sessionId).slice(0, 8).map((a) => {
                      const p = db.participants.find((x) => x.id === a.participant_id)
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="who">
                              <Avatar src={p?.photo_url} first={p?.first_names || '?'} last={p?.last_names || ''} />
                              <div><strong>{p ? fullName(p) : '—'}</strong><span>{p?.code}</span></div>
                            </div>
                          </td>
                          <td className="mono tiny">{timeOnly(a.recorded_at)}</td>
                          <td><Badge tone={statusTone(a.status)}>{attendanceStatusLabel[a.status]}</Badge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {db.attendance.filter((a) => a.session_id === sessionId).length === 0 && <Empty icon="scan" title="Sin registros todavía" text="Escanea la primera credencial de la jornada." />}
              </div>
            </SectionCard>
          )}

          {last && (
            <Banner tone="ok" title="Último registro confirmado">
              {last.name} · {timeOnly(last.at)} · {attendanceStatusLabel[last.status as AttendanceStatus]}
            </Banner>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════ EVENTOS Y JORNADAS ═══════════════════════════════ */
const emptyEvent = (): EventItem => ({
  id: '', name: '', description: '', place: '', starts_at: new Date().toISOString().slice(0, 16),
  ends_at: new Date().toISOString().slice(0, 16), categories: [], requires_payment: false,
  min_paid_amount: 0, active: true,
})

export function AdminEvents() {
  const { db, saveEvent, deleteEvent, saveSession, deleteSession, account } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<EventItem | null>(null)
  const [sess, setSess] = useState<SessionItem | null>(null)
  const [del, setDel] = useState<EventItem | null>(null)

  const openNew = () => setEdit(emptyEvent())
  const openEdit = (e: EventItem) => setEdit({ ...e })

  const persist = async () => {
    if (!edit) return
    if (!edit.name.trim()) { toast.push('El nombre del evento es obligatorio.', 'err'); return }
    try {
      await saveEvent({ ...edit, id: edit.id || crypto.randomUUID(), starts_at: new Date(edit.starts_at).toISOString(), ends_at: new Date(edit.ends_at).toISOString() })
      toast.push('Evento guardado y sincronizado.')
      setEdit(null)
    } catch (error) {
      toast.push('No se pudo guardar el evento: ' + (error instanceof Error ? error.message : String(error)), 'err')
    }
  }

  const persistSession = async () => {
    if (!sess) return
    if (!sess.name.trim() || !sess.event_id) { toast.push('Completa los datos de la jornada.', 'err'); return }
    try {
      await saveSession({ ...sess, id: sess.id || crypto.randomUUID() })
      toast.push('Jornada guardada y sincronizada.')
      setSess(null)
    } catch (error) {
      toast.push('No se pudo guardar la jornada: ' + (error instanceof Error ? error.message : String(error)), 'err')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Eventos y jornadas</h1><p className="lead">Cada evento tiene su propio registro de asistencia y sus requisitos de ingreso.</p></div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={15} /> Nuevo evento</button>
      </div>

      <div className="stack">
        {db.events.map((e) => {
          const sessions = db.sessions.filter((s) => s.event_id === e.id)
          const attended = db.attendance.filter((a) => a.event_id === e.id && (a.status === 'presente' || a.status === 'tardanza')).length
          return (
            <section key={e.id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <h2 style={{ fontSize: '1rem' }}>{e.name}</h2>
                    <Badge tone={e.active ? 'ok' : 'neutral'}>{e.active ? 'Activo' : 'Inactivo'}</Badge>
                    {e.requires_payment && <Badge tone="warn">Requiere {money(e.min_paid_amount)}</Badge>}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 3 }}>{e.description}</p>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {shortDate(e.starts_at)} · {timeOnly(e.starts_at)}–{timeOnly(e.ends_at)} · {e.place} · {attended} asistencia(s)
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setSess({ id: '', event_id: e.id, name: 'Jornada 1', session_date: todayISO(), start_time: '09:00', end_time: '12:00', late_after: '09:15' })}>
                    <Icon name="plus" size={13} /> Jornada
                  </button>
                  <button className="icon-btn" onClick={() => openEdit(e)}><Icon name="edit" size={15} /></button>
                  <button className="icon-btn" onClick={() => setDel(e)}><Icon name="trash" size={15} /></button>
                </div>
              </div>

              {sessions.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Jornada</th><th>Fecha</th><th>Horario</th><th>Tardanza desde</th><th>Asistentes</th><th></th></tr></thead>
                      <tbody>
                        {sessions.map((s) => (
                          <tr key={s.id}>
                            <td className="tiny">{s.name}</td>
                            <td className="tiny">{s.session_date}</td>
                            <td className="mono tiny">{s.start_time}–{s.end_time}</td>
                            <td className="mono tiny">{s.late_after}</td>
                            <td className="tiny">{db.attendance.filter((a) => a.session_id === s.id && (a.status === 'presente' || a.status === 'tardanza')).length}</td>
                            <td>
                              <div className="row" style={{ gap: 4 }}>
                                <Link to="/admin/asistencias" className="btn btn-sm">Ver</Link>
                                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSess(s)}><Icon name="edit" size={13} /></button>
                                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => deleteSession(s.id)}><Icon name="trash" size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar evento' : 'Nuevo evento'} wide
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={persist}>Guardar evento</button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Nombre" required full><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Presentación oficial — Fiesta Patronal" /></Field>
            <Field label="Descripción" full><textarea className="textarea" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Lugar"><input className="input" value={edit.place} onChange={(e) => setEdit({ ...edit, place: e.target.value })} /></Field>
            <Field label="Categorías (separadas por coma)" hint="Vacío = todas las categorías">
              <input className="input" value={edit.categories.join(', ')} onChange={(e) => setEdit({ ...edit, categories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Inicio" required><input className="input" type="datetime-local" value={edit.starts_at.slice(0, 16)} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
            <Field label="Fin" required><input className="input" type="datetime-local" value={edit.ends_at.slice(0, 16)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field>
            <Field label="Requisito financiero de ingreso">
              <select className="select" value={edit.requires_payment ? 'si' : 'no'} onChange={(e) => setEdit({ ...edit, requires_payment: e.target.value === 'si' })}>
                <option value="no">Sin requisito de pago</option>
                <option value="si">Requiere monto validado</option>
              </select>
            </Field>
            <Field label="Monto mínimo validado (S/)">
              <input className="input" type="number" value={edit.min_paid_amount} onChange={(e) => setEdit({ ...edit, min_paid_amount: Number(e.target.value) })} disabled={!edit.requires_payment} />
            </Field>
            <Field label="Estado">
              <select className="select" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                <option value="1">Activo</option><option value="0">Inactivo</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!sess} onClose={() => setSess(null)} title="Jornada del evento"
        footer={<><button className="btn" onClick={() => setSess(null)}>Cancelar</button><button className="btn btn-primary" onClick={persistSession}>Guardar jornada</button></>}>
        {sess && (
          <div className="form-grid">
            <Field label="Evento" full>
              <select className="select" value={sess.event_id} onChange={(e) => setSess({ ...sess, event_id: e.target.value })}>
                {db.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Nombre de la jornada" full><input className="input" value={sess.name} onChange={(e) => setSess({ ...sess, name: e.target.value })} placeholder="Jornada 1 — Concentración" /></Field>
            <Field label="Fecha"><input className="input" type="date" value={sess.session_date} onChange={(e) => setSess({ ...sess, session_date: e.target.value })} /></Field>
            <Field label="Hora de tardanza"><input className="input" type="time" value={sess.late_after} onChange={(e) => setSess({ ...sess, late_after: e.target.value })} /></Field>
            <Field label="Inicio"><input className="input" type="time" value={sess.start_time} onChange={(e) => setSess({ ...sess, start_time: e.target.value })} /></Field>
            <Field label="Fin"><input className="input" type="time" value={sess.end_time} onChange={(e) => setSess({ ...sess, end_time: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar evento"
        footer={<><button className="btn" onClick={() => setDel(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => { if (del) deleteEvent(del.id); setDel(null); toast.push('Evento eliminado.') }}>Eliminar</button></>}>
        <p className="tiny">Se eliminará <b>{del?.name}</b> y sus jornadas. Los registros de asistencia históricos permanecen en la base de datos y en la auditoría.</p>
      </Modal>
    </div>
  )
}

/* ══════════════════════ ASISTENCIAS ══════════════════════════════════════ */
export function AdminAttendance() {
  const { db, saveAbsence } = useStore()
  const toast = useToast()
  const [sessionId, setSessionId] = useState(db.sessions[0]?.id || '')
  const session = db.sessions.find((s) => s.id === sessionId)
  const event = session ? db.events.find((e) => e.id === session.event_id) : null
  const rows = db.attendance.filter((a) => a.session_id === sessionId)
  const active = db.participants.filter((p) => ['activo', 'inscrito'].includes(p.status))
  const presentIds = new Set(rows.filter((a) => a.status === 'presente' || a.status === 'tardanza').map((a) => a.participant_id))
  const absent = active.filter((p) => !presentIds.has(p.id))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Asistencias</h1><p className="lead">Registro por jornada con entradas, salidas, tardanzas y faltas.</p></div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportExcel(`asistencia_${session?.session_date || 'jornada'}`, 'Asistencia', [
          { header: 'Código', value: (a: typeof rows[number]) => db.participants.find((p) => p.id === a.participant_id)?.code || '' },
          { header: 'Participante', value: (a: typeof rows[number]) => { const p = db.participants.find((x) => x.id === a.participant_id); return p ? fullName(p) : '' } },
          { header: 'Estado', value: (a: typeof rows[number]) => attendanceStatusLabel[a.status] },
          { header: 'Tipo', value: (a: typeof rows[number]) => a.entry_type },
          { header: 'Hora', value: (a: typeof rows[number]) => timeOnly(a.recorded_at) },
          { header: 'Método', value: (a: typeof rows[number]) => a.method },
          { header: 'Registrado por', value: (a: typeof rows[number]) => a.recorded_by_email || '' },
        ], rows)}>
          <Icon name="download" size={15} /> Excel
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <label>Jornada</label>
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {db.sessions.map((s) => (
                <option key={s.id} value={s.id}>{db.events.find((e) => e.id === s.event_id)?.name} — {s.name} ({s.session_date})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="tiny muted">Evento</div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{event?.name || '—'}</div>
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Presente" value={rows.filter((a) => a.status === 'presente').length} icon="check" />
        <Stat label="Tardanza" value={rows.filter((a) => a.status === 'tardanza').length} icon="clock" tone="y" />
        <Stat label="Faltas" value={rows.filter((a) => a.status.startsWith('falta')).length} icon="alert" tone="o" />
        <Stat label="Sin registro" value={absent.length} icon="user" tone="i" />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Registro de la jornada" pad0>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Participante</th><th>Tipo</th><th>Hora</th><th>Estado</th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const p = db.participants.find((x) => x.id === a.participant_id)
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="who">
                          <Avatar src={p?.photo_url} first={p?.first_names || '?'} last={p?.last_names || ''} />
                          <div><strong>{p ? fullName(p) : '—'}</strong><span>{p?.code}</span></div>
                        </div>
                      </td>
                      <td className="tiny">{a.entry_type}</td>
                      <td className="mono tiny">{timeOnly(a.recorded_at)}</td>
                      <td><Badge tone={statusTone(a.status)}>{attendanceStatusLabel[a.status]}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <Empty icon="clock" title="Sin registros" text="Escanea credenciales desde el módulo de control de asistencia." />}
          </div>
        </SectionCard>

        <SectionCard title={`Participantes sin registro (${absent.length})`} sub="Registra la falta con su justificación" pad0>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Participante</th><th>Estado</th></tr></thead>
              <tbody>
                {absent.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="who">
                        <Avatar src={p.photo_url} first={p.first_names} last={p.last_names} />
                        <div><strong>{fullName(p)}</strong><span>{p.code}</span></div>
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { saveAbsence(sessionId, p.id, 'falta_justificada', 'Justificada por la directiva.'); toast.push('Falta justificada registrada.') }}>Justif.</button>
                        <button className="btn btn-sm btn-danger" onClick={() => { saveAbsence(sessionId, p.id, 'falta_injustificada', 'No se presentó.'); toast.push('Falta injustificada registrada.') }}>Injustif.</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {absent.length === 0 && <Empty icon="check" title="Todos registrados" />}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/* ══════════════════════ FALTAS ═══════════════════════════════════════════ */
export function AdminAbsences() {
  const { db, saveAbsence } = useStore()
  const toast = useToast()
  const [status, setStatus] = useState<'todas' | AttendanceStatus>('todas')
  const [q, setQ] = useState('')

  const rows = db.attendance.filter((a) => {
    const p = db.participants.find((x) => x.id === a.participant_id)
    const isAbsence = ['falta_justificada', 'falta_injustificada', 'permiso', 'tardanza', 'retiro_anticipado'].includes(a.status)
    return isAbsence && (status === 'todas' || a.status === status) &&
      (!q || `${p?.code} ${p?.first_names} ${p?.last_names}`.toLowerCase().includes(q.toLowerCase()))
  })

  const perParticipant = useMemo(() => {
    const map = new Map<string, { fi: number; fj: number; late: number }>()
    db.attendance.forEach((a) => {
      const m = map.get(a.participant_id) || { fi: 0, fj: 0, late: 0 }
      if (a.status === 'falta_injustificada') m.fi++
      if (a.status === 'falta_justificada') m.fj++
      if (a.status === 'tardanza') m.late++
      map.set(a.participant_id, m)
    })
    return Array.from(map.entries())
      .map(([id, v]) => ({ participant: db.participants.find((p) => p.id === id), ...v }))
      .filter((x) => x.participant && (x.fi + x.fj + x.late) > 0)
      .sort((a, b) => b.fi - a.fi || b.late - a.late)
  }, [db.attendance, db.participants])

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Faltas y justificaciones</h1><p className="lead">Control de inasistencias por participante y jornada.</p></div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportExcel('reporte_faltas', 'Faltas', [
          { header: 'Código', value: (x: typeof perParticipant[number]) => x.participant!.code },
          { header: 'Participante', value: (x: typeof perParticipant[number]) => fullName(x.participant!) },
          { header: 'Injustificadas', value: (x: typeof perParticipant[number]) => x.fi },
          { header: 'Justificadas', value: (x: typeof perParticipant[number]) => x.fj },
          { header: 'Tardanzas', value: (x: typeof perParticipant[number]) => x.late },
        ], perParticipant)}>
          <Icon name="download" size={15} /> Exportar
        </button>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Resumen por participante" pad0>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Participante</th><th className="num">Injust.</th><th className="num">Justif.</th><th className="num">Tard.</th></tr></thead>
              <tbody>
                {perParticipant.map((x) => (
                  <tr key={x.participant!.id}>
                    <td>
                      <div className="who">
                        <Avatar src={x.participant!.photo_url} first={x.participant!.first_names} last={x.participant!.last_names} />
                        <div><strong>{fullName(x.participant!)}</strong><span>{x.participant!.code}</span></div>
                      </div>
                    </td>
                    <td className="num" style={{ color: x.fi ? 'var(--danger)' : undefined, fontWeight: 700 }}>{x.fi}</td>
                    <td className="num">{x.fj}</td>
                    <td className="num">{x.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {perParticipant.length === 0 && <Empty icon="check" title="Sin faltas registradas" />}
          </div>
        </SectionCard>

        <SectionCard title={`Registros (${rows.length})`} pad0
          right={<select className="select" style={{ maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todas">Todos</option>
            <option value="falta_injustificada">Injustificadas</option>
            <option value="falta_justificada">Justificadas</option>
            <option value="tardanza">Tardanzas</option>
            <option value="permiso">Permisos</option>
          </select>}>
          <div style={{ padding: '0 14px 10px' }}>
            <input className="input" placeholder="Buscar participante…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Participante</th><th>Jornada</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const p = db.participants.find((x) => x.id === a.participant_id)
                  return (
                    <tr key={a.id}>
                      <td className="tiny">{p ? fullName(p) : '—'}<div className="mono tiny muted">{p?.code}</div></td>
                      <td className="tiny">{db.sessions.find((s) => s.id === a.session_id)?.name}<div className="tiny muted">{shortDate(a.recorded_at)}</div></td>
                      <td><Badge tone={statusTone(a.status)}>{attendanceStatusLabel[a.status]}</Badge></td>
                      <td>
                        <button className="btn btn-sm" onClick={() => { saveAbsence(a.session_id, a.participant_id, 'falta_justificada', 'Justificación aprobada por la directiva.'); toast.push('Justificación aprobada.') }}>
                          Justificar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/* ══════════════════════ DOCUMENTOS ═══════════════════════════════════════ */
export function AdminDocuments() {
  const { db, saveDocument, deleteDocument } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<DocumentItem | null>(null)
  const [syncing, setSyncing] = useState(false)
  const syncDrive = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await edgeCall<{ ok: boolean; count: number; documents: DocumentItem[] }>('drive-documents', { action: 'sync' })
      result.documents.forEach((doc) => saveDocument(doc))
      toast.push(`Drive sincronizado: ${result.count} documento(s).`)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'No se pudo sincronizar Google Drive.', 'err')
    } finally {
      setSyncing(false)
    }
  }
  useEffect(() => { void syncDrive() }, [])
  const cats = ['Estatutos', 'Reglamentos internos', 'Reglamentos de participación', 'Normas de convivencia', 'Comunicados', 'Cronogramas', 'Programaciones', 'Actas y acuerdos', 'Otros documentos']

  const newDoc = (): DocumentItem => ({
    id: '', title: '', category: cats[1], description: '', file_url: null, drive_file_id: '',
    requires_payment: true, published: true, published_at: new Date().toISOString(), size_label: '',
  })

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Documentación institucional</h1><p className="lead">Biblioteca privada con control de acceso por estado de pago.</p></div>
        <div className="spacer" />
        <button className="btn" disabled={syncing} onClick={() => void syncDrive()}><Icon name="refresh-cw" size={15} /> {syncing ? 'Sincronizando…' : 'Actualizar desde Drive'}</button>
        <button className="btn btn-primary" onClick={() => setEdit(newDoc())}><Icon name="plus" size={15} /> Nuevo documento</button>
      </div>

      <Banner tone="info" title="Regla de acceso vigente">
        Solo los participantes inscritos o activos que tengan al menos un pago validado pueden acceder a la documentación. Esta condición se aplica a todos los documentos, sin excepciones.
      </Banner>
      <div style={{ height: 14 }} />

      <SectionCard pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Título</th><th>Categoría</th><th>Acceso</th><th>Publicación</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {db.documents.map((d) => (
                <tr key={d.id}>
                  <td className="tiny"><strong>{d.title}</strong><div className="tiny muted">{d.description}</div></td>
                  <td className="tiny">{d.category}</td>
                  <td><Badge tone={d.requires_payment ? 'warn' : 'neutral'}>{d.requires_payment ? 'Requiere pago' : 'Libre'}</Badge></td>
                  <td className="tiny">{shortDate(d.published_at)}</td>
                  <td><Badge tone={d.published ? 'ok' : 'neutral'}>{d.published ? 'Publicado' : 'Borrador'}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => saveDocument({ ...d, published: !d.published })}>{d.published ? 'Ocultar' : 'Publicar'}</button>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setEdit({ ...d })}><Icon name="edit" size={13} /></button>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => deleteDocument(d.id)}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar documento' : 'Nuevo documento'} wide
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!edit) return
            if (!edit.title.trim()) { toast.push('El título es obligatorio.', 'err'); return }
            saveDocument({ ...edit, id: edit.id || `doc-${Date.now()}` })
            toast.push('Documento guardado.')
            setEdit(null)
          }}>Guardar</button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Título" required full><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Categoría">
              <select className="select" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Estado de publicación">
              <select className="select" value={edit.published ? '1' : '0'} onChange={(e) => setEdit({ ...edit, published: e.target.value === '1' })}>
                <option value="1">Publicado</option><option value="0">Borrador</option>
              </select>
            </Field>
            <Field label="Descripción" full><textarea className="textarea" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Carpeta / ID en Google Drive" hint="Ej. 03_DOCUMENTACION/REGLAMENTOS/reglamento-2026.pdf">
              <input className="input" value={edit.drive_file_id || ''} onChange={(e) => setEdit({ ...edit, drive_file_id: e.target.value })} />
            </Field>
            <Field label="Tamaño (referencial)"><input className="input" value={edit.size_label || ''} onChange={(e) => setEdit({ ...edit, size_label: e.target.value })} placeholder="410 KB" /></Field>
            <Field label="Requiere pago confirmado">
              <select className="select" value={edit.requires_payment ? '1' : '0'} onChange={(e) => setEdit({ ...edit, requires_payment: e.target.value === '1' })}>
                <option value="1">Sí, requiere pago validado</option>
                <option value="0">No, acceso libre al estar inscrito</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ══════════════════════ COMUNICADOS ══════════════════════════════════════ */
export function AdminAnnouncements() {
  const { db, saveAnnouncement, deleteAnnouncement } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<{ id: string; title: string; body: string; pinned: boolean; audience: 'todos' | 'participantes' | 'administracion' } | null>(null)

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Comunicados</h1><p className="lead">Avisos que verán los participantes en su panel.</p></div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setEdit({ id: '', title: '', body: '', pinned: false, audience: 'todos' })}>
          <Icon name="plus" size={15} /> Nuevo comunicado
        </button>
      </div>
      <div className="stack">
        {db.announcements.map((a) => (
          <section key={a.id} className="card">
            <div className="row">
              <h2 style={{ fontSize: '1rem' }}>{a.title}</h2>
              {a.pinned && <Badge tone="warn">Fijado</Badge>}
              <Badge tone="neutral">{a.audience}</Badge>
              <div className="spacer" />
              <span className="tiny muted">{dateTime(a.published_at)}</span>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setEdit({ ...a })}><Icon name="edit" size={14} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => deleteAnnouncement(a.id)}><Icon name="trash" size={14} /></button>
            </div>
            <p className="tiny" style={{ marginTop: 8 }}>{a.body}</p>
          </section>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar comunicado' : 'Nuevo comunicado'} wide
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!edit) return
            if (!edit.title.trim() || !edit.body.trim()) { toast.push('Título y contenido son obligatorios.', 'err'); return }
            saveAnnouncement({
              ...edit,
              id: edit.id || `an-${Date.now()}`,
              published_at: new Date().toISOString(),
            })
            toast.push('Comunicado publicado.')
            setEdit(null)
          }}>Publicar</button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Título" required full><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Contenido" required full><textarea className="textarea" style={{ minHeight: 140 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <Field label="Audiencia">
              <select className="select" value={edit.audience} onChange={(e) => setEdit({ ...edit, audience: e.target.value as typeof edit.audience })}>
                <option value="todos">Todos</option><option value="participantes">Participantes</option><option value="administracion">Administración</option>
              </select>
            </Field>
            <Field label="Destacar">
              <select className="select" value={edit.pinned ? '1' : '0'} onChange={(e) => setEdit({ ...edit, pinned: e.target.value === '1' })}>
                <option value="0">No</option><option value="1">Sí, fijar arriba</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ══════════════════════ REPORTES ═════════════════════════════════════════ */
export function AdminReports() {
  const { db, account } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'padron' | 'cuentas' | 'deudores' | 'pagos' | 'asistencia'>('padron')

  const padron = db.participants
  const cuentas = db.participants.map((p) => ({ p, acc: account(p.id) }))
  const deudores = cuentas.filter((x) => x.acc.balance > 0).sort((a, b) => b.acc.balance - a.acc.balance)

  const colsByTab = {
    padron: [
      { header: 'Código', value: (p: typeof padron[number]) => p.code },
      { header: 'Apellidos y nombres', value: (p: typeof padron[number]) => `${p.last_names}, ${p.first_names}` },
      { header: 'DNI', value: (p: typeof padron[number]) => p.dni },
      { header: 'Celular', value: (p: typeof padron[number]) => p.phone },
      { header: 'Grupo', value: (p: typeof padron[number]) => p.group_name },
      { header: 'Inscripción', value: (p: typeof padron[number]) => shortDate(p.created_at) },
      { header: 'Estado', value: (p: typeof padron[number]) => p.status },
    ],
    cuentas: [
      { header: 'Código', value: (x: typeof cuentas[number]) => x.p.code },
      { header: 'Participante', value: (x: typeof cuentas[number]) => fullName(x.p) },
      { header: 'Costo total', value: (x: typeof cuentas[number]) => money(x.acc.total_amount) },
      { header: 'Pagado', value: (x: typeof cuentas[number]) => money(x.acc.total_paid) },
      { header: 'Saldo', value: (x: typeof cuentas[number]) => money(x.acc.balance) },
      { header: 'Estado', value: (x: typeof cuentas[number]) => x.acc.status },
    ],
    deudores: [
      { header: 'Código', value: (x: typeof deudores[number]) => x.p.code },
      { header: 'Participante', value: (x: typeof deudores[number]) => fullName(x.p) },
      { header: 'Celular', value: (x: typeof deudores[number]) => x.p.phone },
      { header: 'Pagado', value: (x: typeof deudores[number]) => money(x.acc.total_paid) },
      { header: 'Deuda', value: (x: typeof deudores[number]) => money(x.acc.balance) },
    ],
    pagos: [
      { header: 'Código', value: (x: typeof db.payments[number]) => db.participants.find((p) => p.id === x.participant_id)?.code || '' },
      { header: 'Monto', value: (x: typeof db.payments[number]) => money(x.amount) },
      { header: 'Concepto', value: (x: typeof db.payments[number]) => x.concept },
      { header: 'Operación', value: (x: typeof db.payments[number]) => x.operation_number },
      { header: 'Fecha', value: (x: typeof db.payments[number]) => shortDate(x.paid_at) },
      { header: 'Estado', value: (x: typeof db.payments[number]) => x.status },
    ],
    asistencia: [
      { header: 'Código', value: (x: typeof db.attendance[number]) => db.participants.find((p) => p.id === x.participant_id)?.code || '' },
      { header: 'Participante', value: (x: typeof db.attendance[number]) => { const p = db.participants.find((q) => q.id === x.participant_id); return p ? fullName(p) : '' } },
      { header: 'Evento', value: (x: typeof db.attendance[number]) => db.events.find((e) => e.id === x.event_id)?.name || '' },
      { header: 'Jornada', value: (x: typeof db.attendance[number]) => db.sessions.find((s) => s.id === x.session_id)?.name || '' },
      { header: 'Fecha', value: (x: typeof db.attendance[number]) => shortDate(x.recorded_at) },
      { header: 'Estado', value: (x: typeof db.attendance[number]) => attendanceStatusLabel[x.status] },
    ],
  }

  const generate = (kind: 'excel' | 'pdf') => {
    const map = {
      padron: { name: 'listado_participantes', data: padron as unknown[], cols: colsByTab.padron as never },
      cuentas: { name: 'estado_cuentas', data: cuentas as unknown[], cols: colsByTab.cuentas as never },
      deudores: { name: 'relacion_deudores', data: deudores as unknown[], cols: colsByTab.deudores as never },
      pagos: { name: 'historial_pagos', data: db.payments as unknown[], cols: colsByTab.pagos as never },
      asistencia: { name: 'listado_asistencia', data: db.attendance as unknown[], cols: colsByTab.asistencia as never },
    }[tab]
    if (kind === 'excel') exportExcel(map.name, map.name, map.cols, map.data)
    else exportPdf({ title: map.name.replace(/_/g, ' ').toUpperCase(), filename: map.name, subtitle: `${map.data.length} registro(s)` }, map.cols, map.data)
    toast.push(`Reporte generado (${kind === 'excel' ? 'Excel' : 'PDF'}).`)
  }

  const preview = {
    padron: padron.slice(0, 8).map((p) => [p.code, fullName(p), p.dni, p.group_name, shortDate(p.created_at)]),
    cuentas: cuentas.slice(0, 8).map((x) => [x.p.code, fullName(x.p), money(x.acc.total_paid), money(x.acc.balance), x.acc.status]),
    deudores: deudores.slice(0, 8).map((x) => [x.p.code, fullName(x.p), money(x.acc.total_paid), money(x.acc.balance)]),
    pagos: db.payments.slice(0, 8).map((x) => [db.participants.find((p) => p.id === x.participant_id)?.code || '', x.concept, money(x.amount), x.status]),
    asistencia: db.attendance.slice(0, 8).map((x) => [db.participants.find((p) => p.id === x.participant_id)?.code || '', db.events.find((e) => e.id === x.event_id)?.name || '', shortDate(x.recorded_at), attendanceStatusLabel[x.status]]),
  }[tab]

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Reportes</h1><p className="lead">Exportación a Excel y PDF de los registros de la asociación.</p></div>
      </div>

      <SectionCard>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'padron', label: 'Padrón' }, { id: 'cuentas', label: 'Estado de cuentas' },
          { id: 'deudores', label: 'Deudores' }, { id: 'pagos', label: 'Historial de pagos' },
          { id: 'asistencia', label: 'Asistencia' },
        ]} />
        <div className="row wrap" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => generate('excel')}><Icon name="download" size={15} /> Descargar Excel</button>
          <button className="btn" onClick={() => generate('pdf')}><Icon name="download" size={15} /> Descargar PDF</button>
          <div className="spacer" />
          <Badge tone="neutral">{tab === 'padron' ? padron.length : tab === 'cuentas' ? cuentas.length : tab === 'deudores' ? deudores.length : tab === 'pagos' ? db.payments.length : db.attendance.length} registro(s)</Badge>
        </div>
        <div className="divider" />
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="tiny">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>Vista previa de los primeros registros. La exportación incluye el listado completo.</p>
      </SectionCard>
    </div>
  )
}

/* ══════════════════════ USUARIOS Y ROLES ═════════════════════════════════ */
export function AdminUsers() {
  const { db, saveProfile, deleteProfile, user } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<Profile | null>(null)

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Usuarios y roles</h1><p className="lead">Permisos de acceso al sistema.</p></div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setEdit({ id: '', email: '', full_name: '', role: 'admin', active: true, created_at: new Date().toISOString() })}>
          <Icon name="plus" size={15} /> Nuevo usuario
        </button>
      </div>

      <Banner tone="info" title="Alcance de cada rol">
        <b>Superadministrador</b>: acceso total, configuración e integraciones. <b>Administrador</b>: participantes, pagos, documentos, eventos y reportes.
        <b> Controlador</b>: solo escáner QR, identificación visual, asistencia y observaciones. <b>Participante</b>: únicamente su propia cuenta.
      </Banner>
      <div style={{ height: 14 }} />

      <SectionCard pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {db.profiles.map((p) => (
                <tr key={p.id}>
                  <td className="tiny"><strong>{p.full_name}</strong></td>
                  <td className="tiny" style={{ wordBreak: 'break-all' }}>{p.email}</td>
                  <td><Badge tone={p.role === 'superadmin' ? 'info' : p.role === 'admin' ? 'ok' : 'neutral'}>{roleLabel[p.role]}</Badge></td>
                  <td><Badge tone={p.active ? 'ok' : 'bad'}>{p.active ? 'Activo' : 'Deshabilitado'}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => saveProfile({ ...p, active: !p.active })}>{p.active ? 'Deshabilitar' : 'Habilitar'}</button>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setEdit({ ...p })}><Icon name="edit" size={13} /></button>
                      {p.id !== user?.profile.id && (
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => deleteProfile(p.id)}><Icon name="trash" size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar usuario' : 'Nuevo usuario'}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!edit) return
            if (!edit.email.includes('@') || !edit.full_name.trim()) { toast.push('Nombre y correo válidos son obligatorios.', 'err'); return }
            saveProfile({ ...edit, id: edit.id || `u-${Date.now()}` })
            toast.push('Usuario guardado.')
            setEdit(null)
          }}>Guardar</button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Nombre completo" required full><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label="Correo" required full><input className="input" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="select" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Profile['role'] })}>
                <option value="superadmin">Superadministrador</option><option value="admin">Administrador</option>
                <option value="controlador">Controlador de asistencia</option><option value="participante">Participante</option>
              </select>
            </Field>
            <Field label="Estado">
              <select className="select" value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                <option value="1">Activo</option><option value="0">Deshabilitado</option>
              </select>
            </Field>
            <div className="full banner info"><Icon name="info" size={16} /><div>La contraseña se gestiona en Supabase Auth. Crea el usuario en el panel de Supabase con el mismo correo para habilitar el acceso real.</div></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ══════════════════════ CONFIGURACIÓN ════════════════════════════════════ */
export function AdminSettings() {
  const { db, updateSettings, saveField, deleteField, resetDemo } = useStore()
  const toast = useToast()
  const [s, setS] = useState(db.settings)
  const [field, setField] = useState<FormField | null>(null)

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Configuración</h1><p className="lead">Parámetros de inscripción, cuotas, pagos y numeración.</p></div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => { updateSettings(s); toast.push('Configuración guardada.') }}>
          <Icon name="check" size={15} /> Guardar cambios
        </button>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <SectionCard title="Identidad y numeración">
          <div className="form-grid">
            <Field label="Nombre de la asociación" full><input className="input" value={s.association_name} onChange={(e) => setS({ ...s, association_name: e.target.value })} /></Field>
            <Field label="Prefijo de código" hint="Ej. ASO → ASO-0001">
              <input className="input" value={s.code_prefix} onChange={(e) => setS({ ...s, code_prefix: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Carpeta raíz en Google Drive" hint="ID de la carpeta ASOCIACION">
              <input className="input" value={s.drive_root_folder_id || ''} onChange={(e) => setS({ ...s, drive_root_folder_id: e.target.value })} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Cuotas y requisitos de acceso">
          <div className="form-grid">
            <Field label="Costo total de participación (S/)"><input className="input" type="number" value={s.total_amount} onChange={(e) => setS({ ...s, total_amount: Number(e.target.value) })} /></Field>
            <Field label="Adelanto obligatorio (S/)"><input className="input" type="number" value={s.advance_amount} onChange={(e) => setS({ ...s, advance_amount: Number(e.target.value) })} /></Field>
            <Field label="Número de cuotas"><input className="input" type="number" value={s.installments} onChange={(e) => setS({ ...s, installments: Number(e.target.value) })} /></Field>
            <Field label="Primer vencimiento"><input className="input" type="date" value={s.first_due_date} onChange={(e) => setS({ ...s, first_due_date: e.target.value })} /></Field>
            
          </div>
        </SectionCard>

        <SectionCard title="Datos de Yape">
          <div className="form-grid">
            <Field label="Número Yape"><input className="input" value={s.yape_number} onChange={(e) => setS({ ...s, yape_number: e.target.value })} /></Field>
            <Field label="Titular"><input className="input" value={s.yape_holder} onChange={(e) => setS({ ...s, yape_holder: e.target.value })} /></Field>
          </div>
          <div className="banner info" style={{ marginTop: 12 }}>
            <Icon name="info" size={16} />
            <div>Los pagos se validan manualmente. La app nunca marca un pago como confirmado solo por la imagen recibida.</div>
          </div>
        </SectionCard>

        <SectionCard title="Campos configurables de inscripción" sub="Se muestran en el formulario de registro"
          right={<button className="btn btn-sm" onClick={() => setField({ id: '', label: '', key: '', type: 'text', required: false, options: [], active: true })}><Icon name="plus" size={13} /> Añadir</button>} pad0>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Campo</th><th>Clave</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {db.formFields.map((f) => (
                  <tr key={f.id}>
                    <td className="tiny">{f.label}{f.required && <span style={{ color: 'var(--orange)' }}> *</span>}</td>
                    <td className="mono tiny">{f.key}</td>
                    <td className="tiny">{f.type}{f.options.length ? ` (${f.options.join('/')})` : ''}</td>
                    <td><Badge tone={f.active ? 'ok' : 'neutral'}>{f.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setField({ ...f })}><Icon name="edit" size={13} /></button>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => deleteField(f.id)}><Icon name="trash" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Mantenimiento" sub="Solo para entornos de demostración">
          <p className="tiny muted" style={{ marginBottom: 10 }}>
            Restablece los datos de ejemplo del navegador. No afecta a la base de datos de Supabase cuando hay credenciales configuradas.
          </p>
          <button className="btn btn-danger" onClick={() => { resetDemo(); toast.push('Datos de demostración restablecidos.') }}>
            <Icon name="history" size={15} /> Restablecer datos demo
          </button>
        </SectionCard>
      </div>

      <Modal open={!!field} onClose={() => setField(null)} title="Campo del formulario"
        footer={<><button className="btn" onClick={() => setField(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!field) return
            if (!field.label.trim()) { toast.push('La etiqueta es obligatoria.', 'err'); return }
            saveField({ ...field, id: field.id || `f-${Date.now()}`, key: field.key || field.label.toLowerCase().replace(/\s+/g, '_') })
            toast.push('Campo guardado.')
            setField(null)
          }}>Guardar</button></>}>
        {field && (
          <div className="form-grid">
            <Field label="Etiqueta" required><input className="input" value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })} /></Field>
            <Field label="Clave interna"><input className="input" value={field.key} onChange={(e) => setField({ ...field, key: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className="select" value={field.type} onChange={(e) => setField({ ...field, type: e.target.value as FormField['type'] })}>
                <option value="text">Texto</option><option value="number">Número</option><option value="select">Lista</option><option value="date">Fecha</option>
              </select>
            </Field>
            <Field label="Opciones (separadas por coma)"><input className="input" value={field.options.join(', ')} onChange={(e) => setField({ ...field, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></Field>
            <Field label="Obligatorio">
              <select className="select" value={field.required ? '1' : '0'} onChange={(e) => setField({ ...field, required: e.target.value === '1' })}>
                <option value="0">No</option><option value="1">Sí</option>
              </select>
            </Field>
            <Field label="Estado">
              <select className="select" value={field.active ? '1' : '0'} onChange={(e) => setField({ ...field, active: e.target.value === '1' })}>
                <option value="1">Activo</option><option value="0">Inactivo</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ══════════════════════ AUDITORÍA ════════════════════════════════════════ */
export function AdminAudit() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const rows = db.audit.filter((a) => `${a.actor_email} ${a.action} ${a.table_name} ${a.record_id}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Historial de operaciones</h1><p className="lead">Registro inmutable de las acciones administrativas.</p></div>
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filtrar por usuario o acción…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <SectionCard pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Registro</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="tiny">{dateTime(a.created_at)}</td>
                  <td className="tiny">{a.actor_email}</td>
                  <td><Badge tone="info">{a.action}</Badge></td>
                  <td className="tiny">{a.table_name}</td>
                  <td className="mono tiny">{a.record_id}</td>
                  <td className="mono tiny" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.old_data ? JSON.stringify(a.old_data) : '—'}</td>
                  <td className="mono tiny" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.new_data ? JSON.stringify(a.new_data) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="history" title="Sin operaciones registradas" />}
      </SectionCard>
      <Banner tone="info" title="Registro no editable">
        En Supabase la tabla <span className="mono">audit_log</span> es de solo inserción: no admite UPDATE ni DELETE por políticas RLS, y se alimenta mediante triggers.
      </Banner>
    </div>
  )
}

/* ══════════════════════ CREDENCIAL IMPRIMIBLE ════════════════════════════ */
export function AdminCardPrint({ participantId, onClose }: { participantId: string; onClose: () => void }) {
  const { db, account } = useStore()
  const p = db.participants.find((x) => x.id === participantId)
  if (!p) return null
  const acc = account(p.id)
  return (
    <Modal open onClose={onClose} title={`Credencial ${p.code}`}>
      <div className="credential">
        <div className="cred-band" />
        <h3 style={{ color: '#fff', fontSize: '1rem' }}>{fullName(p)}</h3>
        <div className="cred-code">{p.code}</div>
        <div className="cred-meta">{p.group_name} · {money(acc.total_paid)} validado</div>
      </div>
      <p className="tiny muted" style={{ marginTop: 12 }}>Usa “Imprimir” del navegador para generar el PDF de la credencial.</p>
    </Modal>
  )
}
