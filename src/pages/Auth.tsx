import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, isDemoMode } from '../lib/store'
import { Field, Icon, Spinner, Banner } from '../components/ui'
import { SelfieCapture } from '../components/Camera'
import { roleLabel } from '../lib/utils'

const GROUPS = ['Delegación San Miguel', 'Delegación Centro', 'Sección Danza', 'Sección Música', 'Categoría Juvenil', 'Categoría Adultos']

export function Welcome() {
  const { db } = useStore()
  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <img className="auth-logo" src="/img/logo.png" alt="Comparsa San Miguel Arcángel 2004" />
        <div className="auth-pitch">
          <h1>Cultura y tradición,<br />administradas con orden.</h1>
          <p>
            Plataforma institucional de la {db.settings.association_name}. Inscripciones con selfie obligatoria,
            cuotas por Yape validadas por la directiva, credencial digital con QR y control de asistencia por jornada.
          </p>
          <div className="auth-feats">
            {['PWA instalable', 'QR por participante', 'Cuotas y adelantos', 'Documentación privada', 'Reportes Excel y PDF'].map((f) => (
              <span key={f} className="auth-feat"><Icon name="check" size={13} /> {f}</span>
            ))}
          </div>
        </div>
        <div className="auth-feat" style={{ alignSelf: 'flex-start' }}>Asociación Cultural · Comparsa San Miguel Arcángel · 2004</div>
      </div>
      <div className="auth-form-side">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="brand-mini"><img src="/img/logo.png" alt="Logo" /></div>
          <h1 style={{ marginBottom: 8 }}>Bienvenido</h1>
          <p className="muted" style={{ marginBottom: 22 }}>
            Ingresa a tu cuenta para revisar tus pagos, tu credencial QR y la documentación de la asociación.
          </p>
          <div className="stack">
            <Link to="/login" className="btn btn-primary btn-block" style={{ minHeight: 46 }}>Iniciar sesión</Link>
            <Link to="/registro" className="btn btn-block" style={{ minHeight: 46 }}>Inscribirme como participante</Link>
          </div>
          <p className="tiny muted" style={{ marginTop: 18 }}>
            La inscripción requiere una selfie tomada desde la cámara y la revisión de la directiva.
          </p>
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const { login, db, loginAs } = useStore()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const go = (role: string) => {
    if (role === 'participante') nav('/app')
    else if (role === 'controlador') nav('/escaner')
    else nav('/admin')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const res = await login(email, password)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'No se pudo iniciar sesión.'); return }
    const p = db.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    go(p?.role || 'participante')
  }

  const quick = (id: string) => {
    loginAs(id)
    const p = db.profiles.find((x) => x.id === id)
    go(p?.role || 'participante')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <img className="auth-logo" src="/img/logo.png" alt="Logo" />
        <div className="auth-pitch">
          <h1>Panel institucional</h1>
          <p>Cada participante tiene una identidad digital única: código, QR, estado de cuenta y documentación habilitada.</p>
        </div>
        <div className="auth-feat" style={{ alignSelf: 'flex-start' }}>Acceso por roles · Auditoría de operaciones</div>
      </div>
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="brand-mini"><img src="/img/logo.png" alt="Logo" /></div>
          <h1 style={{ marginBottom: 6 }}>Iniciar sesión</h1>
          <p className="muted tiny" style={{ marginBottom: 20 }}>Usa el correo registrado en tu inscripción.</p>
          <form onSubmit={submit} className="stack">
            <Field label="Correo electrónico" required>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" required autoComplete="email" />
            </Field>
            <Field label="Contraseña" required>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
            </Field>
            {err && <Banner tone="bad" title="No se pudo ingresar">{err}</Banner>}
            <button className="btn btn-primary btn-block" style={{ minHeight: 44 }} disabled={busy}>
              {busy ? <Spinner /> : <><Icon name="logout" size={16} /> Ingresar</>}
            </button>
          </form>

          <div className="divider" />
          <p className="tiny muted" style={{ marginBottom: 8 }}>¿Aún no estás inscrito? <Link to="/registro"><strong>Completa tu inscripción</strong></Link></p>

          {isDemoMode && (
            <>
              <div className="banner info" style={{ marginTop: 14 }}>
                <Icon name="info" size={16} />
                <div>
                  <strong>Modo demostración</strong>
                  Datos de ejemplo. Elige un perfil para recorrer la plataforma.
                </div>
              </div>
              <div className="demo-accounts">
                {db.profiles.filter((p) => ['superadmin', 'admin', 'controlador'].includes(p.role)).map((p) => (
                  <button key={p.id} className="demo-account" onClick={() => quick(p.id)} type="button">
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--green-soft)', display: 'grid', placeItems: 'center', color: 'var(--green-mid)' }}>
                      <Icon name="shield" size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{p.full_name}</strong>
                      <span>{roleLabel[p.role]} · {p.email}</span>
                    </div>
                    <Icon name="arrowRight" size={15} />
                  </button>
                ))}
                {db.profiles.filter((p) => p.role === 'participante').slice(0, 3).map((p) => (
                  <button key={p.id} className="demo-account" onClick={() => quick(p.id)} type="button">
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--orange-soft)', display: 'grid', placeItems: 'center', color: 'var(--orange)' }}>
                      <Icon name="user" size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{p.full_name}</strong>
                      <span>Participante · {p.email}</span>
                    </div>
                    <Icon name="arrowRight" size={15} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Register() {
  const { db, register } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [form, setForm] = useState({
    first_names: '', last_names: '', dni: '', phone: '', address: '', group_name: GROUPS[0],
    email: '', password: '', confirm: '', extra: {} as Record<string, string>,
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const step1Ok =
    form.first_names.trim().length >= 2 && form.last_names.trim().length >= 2 &&
    /^\d{8}$/.test(form.dni.trim()) && form.phone.replace(/\D/g, '').length >= 9 &&
    form.address.trim().length >= 5 && form.email.includes('@') && form.password.length >= 6 &&
    form.password === form.confirm

  const submit = async () => {
    setErr('')
    if (!photo) { setErr('La selfie es obligatoria: debes tomarla con la cámara para completar la inscripción.'); setStep(2); return }
    setBusy(true)
    const res = await register({ ...form, photoDataUrl: photo, extra: form.extra })
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'No se pudo completar la inscripción.'); return }
    setDone(res.code || '')
  }

  if (done) {
    return (
      <div className="auth-wrap" style={{ gridTemplateColumns: '1fr' }}>
        <div className="auth-form-side">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}>
                <Icon name="check" size={30} />
              </div>
              <h1>Inscripción registrada</h1>
              <p className="muted">Tu código único de participante es:</p>
              <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '.06em', color: 'var(--green-mid)' }}>{done}</div>
              <div className="banner info" style={{ textAlign: 'left' }}>
                <Icon name="info" size={16} />
                <div>
                  <strong>Siguientes pasos</strong>
                  Tu ficha quedó en estado <b>pendiente de revisión</b>. La directiva validará tu selfie y tus datos.
                  Después podrás enviar tu adelanto por Yape, usar tu credencial QR y acceder a la documentación.
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={() => nav('/app')}>Ir a mi cuenta</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="auth-form-side" style={{ alignItems: 'flex-start', paddingTop: 30 }}>
        <div className="auth-card" style={{ maxWidth: 620 }}>
          <div className="brand-mini" style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <img src="/img/logo.png" alt="Logo" style={{ width: 230 }} />
          </div>
          <h1 style={{ marginBottom: 4 }}>Inscripción de participante</h1>
          <p className="muted tiny" style={{ marginBottom: 18 }}>
            Paso {step} de 2 · {step === 1 ? 'Datos personales' : 'Selfie obligatoria'}
          </p>

          {step === 1 && (
            <div className="stack">
              <div className="form-grid">
                <Field label="Nombres" required><input className="input" value={form.first_names} onChange={(e) => set('first_names', e.target.value)} placeholder="María Elena" /></Field>
                <Field label="Apellidos" required><input className="input" value={form.last_names} onChange={(e) => set('last_names', e.target.value)} placeholder="Quispe Huamán" /></Field>
                <Field label="DNI" required hint="8 dígitos. Se verifica que no exista otro registro.">
                  <input className="input" inputMode="numeric" maxLength={8} value={form.dni} onChange={(e) => set('dni', e.target.value.replace(/\D/g, ''))} placeholder="41234567" />
                </Field>
                <Field label="Celular" required><input className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="987 654 321" /></Field>
                <Field label="Dirección" required full><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Av. Los Ángeles 245, San Miguel" /></Field>
                <Field label="Grupo / delegación / categoría" required full>
                  <select className="select" value={form.group_name} onChange={(e) => set('group_name', e.target.value)}>
                    {GROUPS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </Field>
                {db.formFields.filter((f) => f.active).map((f) => (
                  <Field key={f.id} label={f.label} required={f.required}>
                    {f.type === 'select' ? (
                      <select className="select" value={form.extra[f.key] || ''} onChange={(e) => setForm((s) => ({ ...s, extra: { ...s.extra, [f.key]: e.target.value } }))}>
                        <option value="">Seleccionar…</option>
                        {f.options.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input" type={f.type} value={form.extra[f.key] || ''} onChange={(e) => setForm((s) => ({ ...s, extra: { ...s.extra, [f.key]: e.target.value } }))} />
                    )}
                  </Field>
                ))}
                <Field label="Correo electrónico" required hint="Será tu usuario de acceso."><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tucorreo@ejemplo.com" /></Field>
                <Field label="Contraseña" required hint="Mínimo 6 caracteres."><input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
                <Field label="Repetir contraseña" required error={form.confirm && form.confirm !== form.password ? 'Las contraseñas no coinciden.' : undefined}>
                  <input className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
                </Field>
              </div>
              {err && <Banner tone="bad" title="Revisa los datos">{err}</Banner>}
              <button className="btn btn-primary btn-block" style={{ minHeight: 44 }} disabled={!step1Ok} onClick={() => setStep(2)}>
                Continuar a la selfie <Icon name="arrowRight" size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <Banner tone="info" title="Requisito indispensable">
                La inscripción no puede finalizar sin una fotografía tomada desde la cámara frontal. No se permite
                seleccionar imágenes de la galería.
              </Banner>
              <SelfieCapture value={photo} onChange={setPhoto} />
              {err && <Banner tone="bad" title="Inscripción incompleta">{err}</Banner>}
              <div className="row">
                <button className="btn" onClick={() => setStep(1)}><Icon name="arrowLeft" size={16} /> Volver</button>
                <div className="spacer" />
                <button className="btn btn-primary" disabled={!photo || busy} onClick={submit}>
                  {busy ? <Spinner /> : <><Icon name="check" size={16} /> Finalizar inscripción</>}
                </button>
              </div>
            </div>
          )}

          <p className="tiny muted" style={{ marginTop: 20, textAlign: 'center' }}>
            ¿Ya tienes cuenta? <Link to="/login"><strong>Inicia sesión</strong></Link>
          </p>
        </div>
      </div>
    </div>
  )
}
