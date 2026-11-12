import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildSeed } from './seed'
import { cloud, cloudLoad } from './remote'
import { qrDataUrl } from './qr'
import { isDemo, supabase } from './supabase'
import type {
  Account, Announcement, Attendance, AttendanceStatus, CurrentUser, DashboardStats, DBShape,
  DocumentItem, DuplicateFlag, EventItem, FormField, LookupCard, Participant, Payment,
  PaymentInput, Profile, RegistrationInput, SessionItem, Settings,
} from './types'

const KEY = 'arcangel2004.db.v1'

const nowISO = () => new Date().toISOString()
const uid = (p = 'id') =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const rand = () => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function load(): DBShape {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DBShape
      if (parsed?.participants && parsed?.settings) return parsed
    }
  } catch { /* almacenamiento no disponible: se usa la semilla */ }
  return buildSeed()
}

function save(db: DBShape) {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* cuota excedida: se sigue en memoria */ }
}

/* ── Reglas de negocio puras ─────────────────────────────────────────────── */

export function computeAccount(db: DBShape, participantId: string): Account {
  const conf = db.settings
  const total = Number(conf.total_amount || 0)
  const pays = db.payments.filter((p) => p.participant_id === participantId)
  const paid = pays.filter((p) => p.status === 'validado').reduce((s, p) => s + Number(p.amount), 0)
  const pending = pays.filter((p) => p.status === 'pendiente').reduce((s, p) => s + Number(p.amount), 0)
  const balance = Math.max(0, total - paid)
  const feesPaid = pays.filter((p) => p.status === 'validado').length

  // Calendario de cuotas: adelanto + (cuotas - 1) vencimientos cada 30 días
  const first = conf.first_due_date ? new Date(conf.first_due_date + 'T12:00:00') : new Date()
  const schedule: string[] = []
  for (let k = 0; k < Math.max(0, Number(conf.installments || 1)); k++) {
    const d = new Date(first)
    d.setDate(d.getDate() + k * 30)
    schedule.push(d.toISOString())
  }
  const today = new Date()
  const dueNow = schedule.filter((d) => new Date(d) <= today).length
  const quota = Number(conf.installments || 1) > 0
    ? (total - Number(conf.advance_amount || 0)) / Math.max(1, Number(conf.installments || 1) - 1)
    : total
  const expected = Math.min(total, Number(conf.advance_amount || 0) + Math.max(0, dueNow - 1) * quota)
  const nextDue = schedule.find((d) => new Date(d) > today) || null

  let status: Account['status'] = 'sin_pagos'
  const rejected = pays.some((p) => p.status === 'rechazado')
  if (total > 0 && paid >= total) status = 'completo'
  else if (paid > 0 && paid < expected) status = 'deuda'
  else if (paid > 0 && paid >= expected) status = paid >= total ? 'completo' : 'al_dia'
  else if (pending > 0) status = 'pendiente_validacion'
  else if (rejected)
    status = 'rechazado'
  else if (paid > 0) status = 'pago_parcial'
  else status = 'sin_pagos'

  if (status === 'al_dia' && balance > 0) status = 'pago_parcial'

  return {
    participant_id: participantId,
    total_amount: total,
    total_paid: paid,
    pending_amount: pending,
    balance,
    fees_paid: feesPaid,
    next_due: nextDue,
    status,
  }
}

/* ── Contexto ────────────────────────────────────────────────────────────── */

interface StoreCtx {
  ready: boolean
  db: DBShape
  user: CurrentUser | null
  account: (participantId: string) => Account
  stats: DashboardStats
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  loginAs: (profileId: string) => void
  logout: () => Promise<void>
  register: (input: RegistrationInput) => Promise<{ ok: boolean; error?: string; code?: string; participantId?: string; scheduledAt?: string; queueNo?: number }>
  submitPayment: (participantId: string, input: PaymentInput) => Promise<{ ok: boolean; error?: string; seq?: number; reference?: string }>
  reviewPayment: (paymentId: string, action: 'validado' | 'rechazado' | 'observado' | 'reenvio_solicitado', notes: string, amount?: number) => Promise<{ ok: boolean; error?: string }>
  setEnrollmentStatus: (participantId: string, status: Participant['status'], notes?: string) => void
  updateParticipant: (participantId: string, patch: Partial<Participant>) => void
  lookupByToken: (token: string) => LookupCard | null
  registerAttendance: (a: {
    participantId: string; sessionId: string; status?: AttendanceStatus;
    method?: 'qr' | 'manual'; entryType?: 'entrada' | 'salida'; notes?: string; force?: boolean
  }) => Promise<{ ok: boolean; error?: string; firstEntryAt?: string; card?: LookupCard }>
  saveAbsence: (sessionId: string, participantId: string, status: AttendanceStatus, notes: string) => Promise<{ ok: boolean; error?: string }>
  saveEvent: (e: EventItem) => void
  deleteEvent: (id: string) => void
  saveSession: (s: SessionItem) => Promise<{ ok: boolean; error?: string }>
  deleteSession: (id: string) => void
  saveDocument: (d: DocumentItem) => void
  deleteDocument: (id: string) => void
  saveAnnouncement: (a: Announcement) => void
  deleteAnnouncement: (id: string) => void
  saveField: (f: FormField) => void
  deleteField: (id: string) => void
  saveProfile: (p: Profile) => void
  deleteProfile: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  markNotificationRead: (id: string) => void
  markAllRead: () => void
  documentsFor: (participantId: string | null) => { docs: DocumentItem[]; locked: boolean }
  attendanceOf: (participantId: string) => Attendance[]
  paymentsOf: (participantId: string) => Payment[]
  reviewsOf: (paymentId: string) => DBShape['paymentReviews']
  resetDemo: () => void
}

const Ctx = createContext<StoreCtx | null>(null)
export const useStore = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore fuera del proveedor')
  return c
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DBShape>(() => {
    const initial = load()
    if (!supabase) return initial
    // Con Supabase configurado, nunca mostrar ni persistir participantes semilla/locales.
    return {
      ...initial,
      formFields: [], profiles: [], participants: [], payments: [], paymentReviews: [],
      events: [], sessions: [], attendance: [], documents: [], announcements: [],
      notifications: [], audit: [], duplicates: [], counter: 0,
      session: { profileId: null },
    }
  })
  const [ready, setReady] = useState(false)
  const dbRef = useRef(db)
  dbRef.current = db

  const [sessionProfileId, setSessionProfileId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY + '.session') } catch { return null }
  })

  useEffect(() => {
    save(db)
  }, [db])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user?.id && alive) {
          setSessionProfileId(data.session.user.id)
          try { localStorage.setItem(KEY + '.session', data.session.user.id) } catch { /* noop */ }
        } else if (alive) {
          // Limpia IDs locales antiguos (no UUID Auth) que pudo dejar el flujo previo.
          setSessionProfileId(null)
          try { localStorage.removeItem(KEY + '.session') } catch { /* noop */ }
        }
        const remote = await cloudLoad()
        if (remote && alive) {
          // La respuesta de Supabase es la fuente de verdad, incluso si no hay participantes.
          setDb((prev) => ({ ...prev, ...remote, session: prev.session }))
        }
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const user = useMemo<CurrentUser | null>(() => {
    if (!sessionProfileId) return null
    const profile = db.profiles.find((p) => p.id === sessionProfileId)
    if (!profile || !profile.active) return null
    const participant =
      db.participants.find((p) => p.profile_id === profile.id) ||
      db.participants.find((p) => p.id === profile.participant_id) ||
      null
    return { profile, participant }
  }, [db.profiles, db.participants, sessionProfileId])

  const persistSession = (id: string | null) => {
    setSessionProfileId(id)
    try {
      if (id) localStorage.setItem(KEY + '.session', id)
      else localStorage.removeItem(KEY + '.session')
    } catch { /* noop */ }
  }

  const audit = (prev: DBShape, action: string, table: string, recordId: string, oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): DBShape['audit'][number] => ({
    id: uid('au'),
    actor_email: prev.profiles.find((p) => p.id === sessionProfileId)?.email || 'sistema',
    action,
    table_name: table,
    record_id: recordId,
    old_data: oldData,
    new_data: newData,
    created_at: nowISO(),
  })

  const update = useCallback((fn: (draft: DBShape) => void) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      fn(next)
      return next
    })
  }, [])

  /* ── Autenticación ─────────────────────────────────────────────── */
  const login = useCallback(async (email: string, password: string) => {
    const clean = email.trim().toLowerCase()
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password })
      if (error) return { ok: false, error: error.message }
      if (!data.user) return { ok: false, error: 'Supabase no devolvió el usuario autenticado.' }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles').select('*').eq('id', data.user.id).single()
      if (profileError || !profileRow) {
        return { ok: false, error: 'Tu cuenta inició sesión, pero no encontramos tu perfil. Comprueba que la migración de inscripción esté aplicada en Supabase.' }
      }
      if (!profileRow.active) {
        await supabase.auth.signOut()
        return { ok: false, error: 'La cuenta está deshabilitada. Contacta a la directiva.' }
      }

      const { data: participantRow, error: participantError } = await supabase
        .from('participants').select('*').eq('profile_id', data.user.id).maybeSingle()
      if (participantError) return { ok: false, error: participantError.message }
      if (!participantRow) return { ok: false, error: 'Tu usuario no tiene una ficha de participante vinculada. La directiva debe revisar la inscripción.' }

      const participant = participantRow as Participant & { photo_storage_path?: string | null; qr_drive_id?: string | null }
      const warnings: string[] = []
      const selfieKey = 'csma.pendingSelfie.' + data.user.id

      try {
        const selfie = localStorage.getItem(selfieKey)
        if (selfie) {
          const blob = await (await fetch(selfie)).blob()
          const photoPath = `participantes/${participant.code}/${participant.code}_SELFIE.jpg`
          const upload = await supabase.storage.from('private-files').upload(photoPath, blob, {
            upsert: true, contentType: 'image/jpeg',
          })
          if (upload.error) {
            warnings.push('La selfie no pudo guardarse en Supabase Storage: ' + upload.error.message)
          } else {
            const { error: rowError } = await supabase.from('participants').update({
              photo_storage_path: photoPath,
            }).eq('id', participant.id)
            if (rowError) warnings.push('La selfie se guardó, pero no se pudo actualizar su ficha: ' + rowError.message)
            else participant.photo_storage_path = photoPath

            const { data: driveData, error: driveError } = await supabase.functions.invoke('drive-sync', {
              body: {
                code: participant.code, kind: 'selfie', storagePath: photoPath,
                participantId: participant.id, fileName: `${participant.code}_SELFIE.jpg`,
              },
            })
            if (driveError || driveData?.error || driveData?.ok !== true) {
              warnings.push('La selfie está en Supabase Storage, pero no llegó a Google Drive: ' + (driveError?.message || driveData?.error || 'respuesta no confirmada'))
            } else {
              localStorage.removeItem(selfieKey)
              participant.photo_drive_id = driveData.fileId || driveData.name
            }
          }
        }
      } catch (e) {
        warnings.push('No se pudo completar la carga de la selfie: ' + (e instanceof Error ? e.message : String(e)))
      }

      if (!participant.qr_drive_id) {
        try {
          const qrUrl = await qrDataUrl(participant.qr_token, 640)
          const qrBlob = await (await fetch(qrUrl)).blob()
          const qrPath = `participantes/${participant.code}/${participant.code}_QR.png`
          const upload = await supabase.storage.from('private-files').upload(qrPath, qrBlob, {
            upsert: true, contentType: 'image/png',
          })
          if (upload.error) {
            warnings.push('No se pudo guardar el QR en Supabase Storage: ' + upload.error.message)
          } else {
            const { data: driveData, error: driveError } = await supabase.functions.invoke('drive-sync', {
              body: {
                code: participant.code, kind: 'qr', storagePath: qrPath,
                participantId: participant.id, fileName: `${participant.code}_QR.png`,
              },
            })
            if (driveError || driveData?.error || driveData?.ok !== true) {
              warnings.push('El QR se guardó en Supabase, pero no llegó a Google Drive: ' + (driveError?.message || driveData?.error || 'respuesta no confirmada'))
            } else {
              participant.qr_drive_id = driveData.fileId || driveData.name
            }
          }
        } catch (e) {
          warnings.push('No se pudo sincronizar el QR con Google Drive: ' + (e instanceof Error ? e.message : String(e)))
        }
      }

      let photoUrl: string | null = null
      if (participant.photo_storage_path) {
        const { data: signed, error: signedError } = await supabase.storage
          .from('private-files').createSignedUrl(participant.photo_storage_path, 3600)
        if (!signedError) photoUrl = signed.signedUrl
        else warnings.push('No se pudo mostrar la selfie guardada: ' + signedError.message)
      }
      const profile = profileRow as Profile
      const participantForUi = { ...participant, photo_url: photoUrl } as Participant
      setDb((prev) => ({
        ...prev,
        profiles: [profile, ...prev.profiles.filter((p) => p.id !== profile.id)],
        participants: [participantForUi, ...prev.participants.filter((p) => p.id !== participant.id)],
      }))
      persistSession(profile.id)
      return { ok: true, warning: warnings.length ? warnings.join(' ') : undefined }
    }

    const found = dbRef.current.profiles.find((p) => p.email.toLowerCase() === clean)
    if (!found) return { ok: false, error: 'No existe una cuenta con ese correo.' }
    if (!found.active) return { ok: false, error: 'La cuenta está deshabilitada. Contacta a la directiva.' }
    if (password.length < 4) return { ok: false, error: 'Contraseña incorrecta.' }
    persistSession(found.id)
    return { ok: true }
  }, [])

  const loginAs = useCallback((profileId: string) => {
    const p = dbRef.current.profiles.find((x) => x.id === profileId)
    if (p) persistSession(p.id)
  }, [])

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    persistSession(null)
  }, [])

  /* ── Inscripción ───────────────────────────────────────────────── */
  const register = useCallback(async (input: RegistrationInput) => {
    const cur = dbRef.current
    const dni = input.dni.replace(/\D/g, '')
    if (dni.length !== 8) return { ok: false, error: 'El DNI debe tener 8 dígitos.' }
    if (!input.photoDataUrl) return { ok: false, error: 'La selfie es obligatoria para completar la inscripción.' }

    const dupParticipant = !supabase ? cur.participants.find((p) => p.dni === dni) : undefined
    if (dupParticipant) {
      const flag: DuplicateFlag = {
        id: uid('dup'), dni, attempted_at: nowISO(), first_names: input.first_names,
        last_names: input.last_names, phone: input.phone, existing_code: dupParticipant.code,
      }
      setDb((prev) => ({ ...prev, duplicates: [flag, ...prev.duplicates] }))
      return { ok: false, error: `El DNI ${dni} ya está registrado con el código ${dupParticipant.code}. La directiva revisará el caso.` }
    }
    const dupProfile = !supabase ? cur.profiles.find((p) => p.email.toLowerCase() === input.email.trim().toLowerCase()) : undefined
    if (dupProfile) return { ok: false, error: 'Ese correo ya tiene una cuenta. Inicia sesión.' }

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          emailRedirectTo: 'https://accomparsasanmiguelarcangel-ship-it.github.io/CSMAplataforma/login',
          data: {
            registration_source: 'csma_public_registration',
            first_names: input.first_names.trim(),
            last_names: input.last_names.trim(),
            dni,
            phone: input.phone.trim(),
            address: input.address.trim(),
            group_name: input.group_name.trim(),
            extra: input.extra || {},
          },
        },
      })
      if (error) return { ok: false, error: error.message }
      if (!data.user) return { ok: false, error: 'Supabase no devolvió el usuario creado.' }
      if (data.user.identities?.length === 0) return { ok: false, error: 'Ese correo ya está registrado. Inicia sesión.' }
      try {
        localStorage.setItem('csma.pendingSelfie.' + data.user.id, input.photoDataUrl)
      } catch {
        // La cuenta ya quedó creada por el trigger; no reportamos un fallo de inscripción.
        console.warn('No se pudo guardar temporalmente la selfie en este navegador.')
      }
      // El Auth Hook ya reservó el turno antes de completar signUp.
      const { data: queueRows } = await supabase.rpc('get_registration_queue_status', {
        p_user_id: data.user.id,
        p_email: input.email.trim().toLowerCase(),
      })
      const queueStatus = Array.isArray(queueRows) ? queueRows[0] : null
      return {
        ok: true,
        code: 'CONFIRM_EMAIL',
        participantId: data.user.id,
        scheduledAt: queueStatus?.scheduled_at,
        queueNo: queueStatus?.queue_no,
      }
    }

    const counter = cur.counter + 1
    const code = `${cur.settings.code_prefix}-${String(counter).padStart(4, '0')}`
    const participantId = uid('p')
    const profileId = uid('u')

    const photo = input.photoDataUrl
    const newP: Participant = {
      id: participantId,
      profile_id: profileId,
      code,
      dni,
      first_names: input.first_names.trim(),
      last_names: input.last_names.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      group_name: input.group_name.trim(),
      photo_url: photo,
      photo_drive_id: `${code}_SELFIE.jpg`,
      status: 'pendiente',
      qr_token: rand(),
      created_at: nowISO(),
      notes: null,
      extra: input.extra,
      email: input.email.trim(),
    }
    const newProfile: Profile = {
      id: profileId,
      email: input.email.trim(),
      full_name: `${newP.first_names} ${newP.last_names}`,
      role: 'participante',
      active: true,
      created_at: nowISO(),
      participant_id: participantId,
    }

    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.participants = [newP, ...next.participants]
      next.profiles = [newProfile, ...next.profiles]
      next.counter = counter
      next.notifications = [
        {
          id: uid('nt'), profile_id: profileId, title: 'Inscripción registrada',
          body: `Tu inscripción quedó con el código ${code}. La directiva revisará tu ficha y tu selfie para activarla.`,
          type: 'inscripcion', read: false, created_at: nowISO(),
        },
        ...next.notifications,
      ]
      next.audit = [audit(prev, 'participant.register', 'participants', participantId, null, { code, dni }), ...next.audit]
      return next
    })
    // En modo demostración se mantiene la sesión local.
    persistSession(profileId)
    return { ok: true, code, participantId }
  }, [])

  /* ── Pagos ─────────────────────────────────────────────────────── */
  const submitPayment = useCallback(async (participantId: string, input: PaymentInput) => {
    const cur = dbRef.current
    if (!input.receiptDataUrl) return { ok: false, error: 'Debes adjuntar la fotografía del comprobante de Yape.' }
    if (!(input.amount > 0)) return { ok: false, error: 'El monto debe ser mayor a cero.' }
    const op = input.operation_number.trim()
    if (op.length < 4) return { ok: false, error: 'Ingresa el número de operación del comprobante.' }

    const dup = cur.payments.find((p) => p.operation_number.replace(/\s/g, '') === op.replace(/\s/g, ''))
    if (dup) {
      return { ok: false, error: `El número de operación ${op} ya fue registrado (${dup.status === 'validado' ? 'pago aprobado' : 'en revisión'}). No se permiten operaciones duplicadas.` }
    }
    const mine = cur.payments.filter((p) => p.participant_id === participantId)
    const seq = mine.reduce((m, p) => Math.max(m, p.seq), 0) + 1
    const participant = cur.participants.find((p) => p.id === participantId)
    if (!participant) return { ok: false, error: 'Participante no encontrado.' }
    const reference = `${participant.code}_PAGO_${String(seq).padStart(2, '0')}.jpg`
    const path = `participantes/${participant.code}/${reference}`

    if (supabase) {
      try {
        const blob = await (await fetch(input.receiptDataUrl)).blob()
        const up = await supabase.storage.from('private-files').upload(path, blob, {
          upsert: true, contentType: blob.type || 'image/jpeg',
        })
        if (up.error) return { ok: false, error: 'No se pudo guardar el comprobante: ' + up.error.message }
      } catch (e) {
        return { ok: false, error: 'No se pudo subir el comprobante: ' + (e instanceof Error ? e.message : String(e)) }
      }
    }

    const payment: Payment = {
      id: crypto.randomUUID(),
      participant_id: participantId,
      seq,
      amount: Number(input.amount),
      operation_number: op,
      method: 'Yape',
      concept: input.concept,
      paid_at: input.paid_at ? new Date(input.paid_at).toISOString() : nowISO(),
      receipt_url: input.receiptDataUrl,
      receipt_drive_id: reference,
      receipt_storage_path: supabase ? path : null,
      status: 'pendiente',
      notes: input.notes || null,
      reject_reason: null,
      created_at: nowISO(),
      reviewed_at: null,
    }

    try {
      await cloud.upsertPayment(payment)
    } catch (e) {
      return { ok: false, error: 'La imagen quedó guardada, pero no se pudo registrar el pago en la base de datos: ' + (e instanceof Error ? e.message : String(e)) }
    }

    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.payments = [payment, ...next.payments]
      if (participant.profile_id) {
        next.notifications = [
          {
            id: uid('nt'), profile_id: participant.profile_id, title: 'Comprobante enviado',
            body: `Registramos tu comprobante ${reference} por S/ ${Number(input.amount).toFixed(2)}. Queda pendiente de validación por la directiva.`,
            type: 'pago', read: false, created_at: nowISO(),
          },
          ...next.notifications,
        ]
      }
      next.audit = [
        audit(prev, 'payment.submit', 'payments', payment.id, null, { amount: payment.amount, seq, op }),
        ...next.audit,
      ]
      return next
    })
    if (supabase) {
      const { error: driveError } = await supabase.functions.invoke('drive-sync', {
        body: { code: participant.code, kind: 'receipt', storagePath: path, seq, fileName: reference },
      })
      if (driveError) console.warn('Comprobante guardado en Supabase Storage; sincronización Drive pendiente:', driveError.message)
    }
    return { ok: true, seq, reference }
  }, [])
  const reviewPayment = useCallback(async (paymentId: string, action: 'validado' | 'rechazado' | 'observado' | 'reenvio_solicitado', notes: string, amount?: number) => {
    const current = dbRef.current.payments.find((p) => p.id === paymentId)
    if (!current) return { ok: false, error: 'No se encontró el pago que deseas revisar.' }

    const before = { status: current.status, amount: current.amount }
    const status: Payment['status'] = action === 'validado' ? 'validado' : action === 'rechazado' ? 'rechazado' : 'pendiente'
    const reviewerProfile = dbRef.current.profiles.find((p) => p.id === sessionProfileId)
    const reviewedAt = nowISO()
    const updatedPayment: Payment = {
      ...current,
      status,
      amount: action === 'validado' && typeof amount === 'number' && amount > 0 ? amount : current.amount,
      reject_reason: action === 'rechazado' ? (notes || 'Comprobante rechazado.') : null,
      notes: action === 'observado' || action === 'reenvio_solicitado' ? (notes || current.notes) : current.notes,
      reviewed_at: reviewedAt,
      reviewed_by: sessionProfileId,
    }
    const reviewEntry: DBShape['paymentReviews'][number] = {
      id: crypto.randomUUID(),
      payment_id: paymentId,
      action,
      previous_status: before.status,
      new_status: status,
      amount: updatedPayment.amount,
      reviewer_email: reviewerProfile?.email || 'sistema',
      notes: notes || null,
      created_at: reviewedAt,
    }

    try {
      await cloud.review(updatedPayment, reviewEntry, sessionProfileId)
    } catch (e) {
      return { ok: false, error: 'No se pudo guardar la validación: ' + (e instanceof Error ? e.message : String(e)) }
    }

    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const pay = next.payments.find((p) => p.id === paymentId)
      if (!pay) return prev
      Object.assign(pay, updatedPayment)
      next.paymentReviews = [reviewEntry, ...next.paymentReviews]

      const participant = next.participants.find((p) => p.id === pay.participant_id)
      if (participant?.profile_id) {
        const title = action === 'validado' ? 'Pago aprobado' : action === 'rechazado' ? 'Pago rechazado' : 'Pago en revisión'
        next.notifications = [
          {
            id: crypto.randomUUID(), profile_id: participant.profile_id, title,
            body: action === 'validado'
              ? `Tu pago de S/ ${pay.amount.toFixed(2)} fue aprobado. Tu saldo se actualizó automáticamente.`
              : action === 'rechazado'
                ? `Tu comprobante fue rechazado: ${pay.reject_reason} Sube un nuevo comprobante desde MIS PAGOS.`
                : `Tu comprobante requiere una nueva revisión: ${notes}`,
            type: 'pago', read: false, created_at: reviewedAt,
          },
          ...next.notifications,
        ]
      }
      next.audit = [
        audit(prev, `payment.${action}`, 'payments', paymentId, before, { status: pay.status, amount: pay.amount, notes }),
        ...next.audit,
      ]
      return next
    })
    return { ok: true }
  }, [sessionProfileId])

  /* ── Participantes ─────────────────────────────────────────────── */
  const setEnrollmentStatus = useCallback((participantId: string, status: Participant['status'], notes?: string) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const p = next.participants.find((x) => x.id === participantId)
      if (!p) return prev
      const before = { status: p.status, notes: p.notes }
      p.status = status
      if (notes !== undefined) p.notes = notes
      if (p.profile_id) {
        next.notifications = [
          {
            id: uid('nt'),
            profile_id: p.profile_id,
            title:
              status === 'activo' ? 'Inscripción activada'
                : status === 'observado' ? 'Inscripción observada'
                  : status === 'rechazado' ? 'Inscripción rechazada'
                    : 'Actualización de inscripción',
            body:
              status === 'activo' ? 'Tu inscripción fue validada. Ya puedes enviar tu comprobante de pago y consultar la documentación habilitada.'
                : status === 'observado' ? `Tu ficha está observada. ${notes || ''}`.trim()
                  : status === 'rechazado' ? `Tu inscripción fue rechazada. ${notes || ''}`.trim()
                    : `Tu inscripción pasó a estado ${status}.`,
            type: 'inscripcion', read: false, created_at: nowISO(),
          },
          ...next.notifications,
        ]
      }
      next.audit = [audit(prev, 'participant.status', 'participants', participantId, before, { status, notes }), ...next.audit]
      return next
    })
  }, [sessionProfileId])

  const updateParticipant = useCallback((participantId: string, patch: Partial<Participant>) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const p = next.participants.find((x) => x.id === participantId)
      if (!p) return prev
      const before = { ...p }
      Object.assign(p, patch)
      next.audit = [audit(prev, 'participant.update', 'participants', participantId, { before }, patch as Record<string, unknown>), ...next.audit]
      return next
    })
  }, [sessionProfileId])

  /* ── Asistencia ────────────────────────────────────────────────── */
  const lookupByToken = useCallback((token: string): LookupCard | null => {
    const cur = dbRef.current
    const p = cur.participants.find((x) => x.qr_token === token)
    if (!p) return null
    const acc = computeAccount(cur, p.id)
    const ev = cur.events.find((e) => e.active)
    const allows = !ev?.requires_payment || acc.total_paid >= (ev?.min_paid_amount || 0)
    return {
      participant: p,
      account: acc,
      already_checked_in: false,
      first_entry_at: null,
      entry_allowed: p.status === 'activo' && allows,
      entry_reason:
        p.status !== 'activo'
          ? `Inscripción en estado "${p.status}".`
          : !allows
            ? `Requiere ${ev?.requires_payment ? `S/ ${(ev.min_paid_amount || 0).toFixed(2)} validados` : 'pago'} para el ingreso.`
            : 'Habilitado para el ingreso.',
    }
  }, [])

  const registerAttendance = useCallback(async (a: {
    participantId: string; sessionId: string; status?: AttendanceStatus;
    method?: 'qr' | 'manual'; entryType?: 'entrada' | 'salida'; notes?: string; force?: boolean
  }) => {
    const cur = dbRef.current
    const session = cur.sessions.find((s) => s.id === a.sessionId)
    if (!session) return { ok: false, error: 'Selecciona una jornada válida.' }
    const participant = cur.participants.find((p) => p.id === a.participantId)
    if (!participant) return { ok: false, error: 'Participante no encontrado.' }
    const entryType = a.entryType || 'entrada'
    const existing = cur.attendance.find(
      (x) => x.participant_id === a.participantId && x.session_id === a.sessionId && x.entry_type === entryType &&
        x.status !== 'falta_justificada' && x.status !== 'falta_injustificada' && x.status !== 'permiso',
    )
    if (existing && !a.force) {
      return {
        ok: false,
        error: `Ya se registró ${entryType === 'entrada' ? 'el ingreso' : 'la salida'} de ${participant.first_names} ${participant.last_names} en esta jornada. Primer registro: ${new Date(existing.recorded_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}.`,
        firstEntryAt: existing.recorded_at,
      }
    }
    let status: AttendanceStatus = a.status || 'presente'
    if (!a.status && entryType === 'entrada') {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
      const [hh, mm] = (session.late_after || '23:59').split(':').map(Number)
      if (nowMin > hh * 60 + mm) status = 'tardanza'
    }
    const record: Attendance = {
      id: existing && a.force ? existing.id : uid('at'),
      participant_id: a.participantId,
      session_id: a.sessionId,
      event_id: session.event_id,
      entry_type: entryType,
      status,
      method: a.method || 'qr',
      recorded_at: nowISO(),
      recorded_by_email: cur.profiles.find((p) => p.id === sessionProfileId)?.email || 'sistema',
      notes: a.notes || null,
    }
    try {
      await cloud.attendance(record)
    } catch (e) {
      return { ok: false, error: 'No se pudo guardar la asistencia en el servidor: ' + (e instanceof Error ? e.message : String(e)) }
    }
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const index = next.attendance.findIndex((x) => x.id === record.id)
      if (index >= 0) next.attendance[index] = record
      else next.attendance = [record, ...next.attendance]
      next.audit = [audit(prev, 'attendance.register', 'attendance', record.id, null, { ...record }), ...next.audit]
      return next
    })
    return { ok: true }
  }, [sessionProfileId])

  const saveAbsence = useCallback(async (sessionId: string, participantId: string, status: AttendanceStatus, notes: string) => {
    const cur = dbRef.current
    const session = cur.sessions.find((s) => s.id === sessionId)
    if (!session) return { ok: false, error: 'Jornada no válida.' }
    const prior = cur.attendance.findIndex((x) => x.participant_id === participantId && x.session_id === sessionId && x.entry_type === 'entrada')
    const existing = prior >= 0 ? cur.attendance[prior] : null
    const rec: Attendance = {
      id: existing?.id || uid('at'),
      participant_id: participantId,
      session_id: sessionId,
      event_id: session.event_id,
      entry_type: 'entrada',
      status,
      method: 'manual',
      recorded_at: existing?.recorded_at || nowISO(),
      recorded_by_email: cur.profiles.find((p) => p.id === sessionProfileId)?.email || 'sistema',
      notes: notes || null,
    }
    try {
      await cloud.attendance(rec)
    } catch (e) {
      return { ok: false, error: 'No se pudo guardar la asistencia en el servidor: ' + (e instanceof Error ? e.message : String(e)) }
    }
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const index = next.attendance.findIndex((x) => x.id === rec.id)
      if (index >= 0) next.attendance[index] = rec
      else next.attendance = [rec, ...next.attendance]
      next.audit = [audit(prev, 'attendance.absence', 'attendance', rec.id, null, { status, notes }), ...next.audit]
      return next
    })
    return { ok: true }
  }, [sessionProfileId])

  /* ── Catálogos ─────────────────────────────────────────────────── */
  const saveEvent = useCallback((e: EventItem) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.events.findIndex((x) => x.id === e.id)
      const isNew = i < 0
      if (isNew) next.events = [e, ...next.events]
      else next.events[i] = e
      next.audit = [audit(prev, isNew ? 'event.create' : 'event.update', 'events', e.id, null, e as unknown as Record<string, unknown>), ...next.audit]
      return next
    })
    cloud.upsertEvent(e)
  }, [sessionProfileId])

  const deleteEvent = useCallback((id: string) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.events = next.events.filter((e) => e.id !== id)
      next.sessions = next.sessions.filter((s) => s.event_id !== id)
      next.audit = [audit(prev, 'event.delete', 'events', id, null, null), ...next.audit]
      return next
    })
    cloud.remove('events', id)
  }, [sessionProfileId])

  const saveSession = useCallback(async (s: SessionItem) => {
    try {
      await cloud.upsertSession(s)
    } catch (e) {
      return { ok: false, error: 'No se pudo guardar la jornada: ' + (e instanceof Error ? e.message : String(e)) }
    }
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.sessions.findIndex((x) => x.id === s.id)
      if (i < 0) next.sessions = [s, ...next.sessions]
      else next.sessions[i] = s
      next.audit = [audit(prev, 'session.save', 'event_sessions', s.id, null, s as unknown as Record<string, unknown>), ...next.audit]
      return next
    })
    return { ok: true }
  }, [sessionProfileId])

  const deleteSession = useCallback((id: string) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.sessions = next.sessions.filter((s) => s.id !== id)
      return next
    })
    cloud.remove('event_sessions', id)
  }, [])

  const saveDocument = useCallback((d: DocumentItem) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.documents.findIndex((x) => x.id === d.id)
      if (i < 0) next.documents = [d, ...next.documents]
      else next.documents[i] = d
      next.audit = [audit(prev, 'document.save', 'documents', d.id, null, { title: d.title, published: d.published }), ...next.audit]
      return next
    })
    cloud.upsertDocument(d)
  }, [sessionProfileId])

  const deleteDocument = useCallback((id: string) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.documents = next.documents.filter((d) => d.id !== id)
      next.audit = [audit(prev, 'document.delete', 'documents', id, null, null), ...next.audit]
      return next
    })
    cloud.remove('documents', id)
  }, [sessionProfileId])

  const saveAnnouncement = useCallback((a: Announcement) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.announcements.findIndex((x) => x.id === a.id)
      if (i < 0) next.announcements = [a, ...next.announcements]
      else next.announcements[i] = a
      next.audit = [audit(prev, 'announcement.save', 'announcements', a.id, null, { title: a.title }), ...next.audit]
      return next
    })
    cloud.upsertAnnouncement(a)
  }, [sessionProfileId])

  const deleteAnnouncement = useCallback((id: string) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      next.announcements = next.announcements.filter((a) => a.id !== id)
      return next
    })
    cloud.remove('announcements', id)
  }, [])

  const saveField = useCallback((f: FormField) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.formFields.findIndex((x) => x.id === f.id)
      if (i < 0) next.formFields = [...next.formFields, f]
      else next.formFields[i] = f
      return next
    })
    cloud.upsertField(f)
  }, [])

  const deleteField = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, formFields: prev.formFields.filter((f) => f.id !== id) }))
    cloud.remove('form_fields', id)
  }, [])

  const saveProfile = useCallback((p: Profile) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const i = next.profiles.findIndex((x) => x.id === p.id)
      if (i < 0) next.profiles = [p, ...next.profiles]
      else next.profiles[i] = p
      next.audit = [audit(prev, 'profile.save', 'profiles', p.id, null, { email: p.email, role: p.role, active: p.active }), ...next.audit]
      return next
    })
    cloud.profile(p)
  }, [sessionProfileId])

  const deleteProfile = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, profiles: prev.profiles.filter((p) => p.id !== id) }))
    cloud.remove('profiles', id)
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setDb((prev) => {
      const next: DBShape = JSON.parse(JSON.stringify(prev))
      const before = { ...next.settings }
      next.settings = { ...next.settings, ...patch }
      next.audit = [audit(prev, 'settings.update', 'settings', 'global', before as unknown as Record<string, unknown>, patch as Record<string, unknown>), ...next.audit]
      return next
    })
    cloud.settings({ ...dbRef.current.settings, ...patch })
  }, [sessionProfileId])

  const markNotificationRead = useCallback((id: string) => {
    setDb((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }))
  }, [])

  const markAllRead = useCallback(() => {
    setDb((prev) => ({ ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }))
  }, [])

  const resetDemo = useCallback(() => {
    const seed = buildSeed()
    setDb(seed)
    persistSession(null)
  }, [])

  /* ── Selectores derivados ──────────────────────────────────────── */
  const account = useCallback((participantId: string) => computeAccount(db, participantId), [db])
  const paymentsOf = useCallback((participantId: string) =>
    db.payments.filter((p) => p.participant_id === participantId).sort((a, b) => b.seq - a.seq), [db.payments])
  const reviewsOf = useCallback((paymentId: string) =>
    db.paymentReviews.filter((r) => r.payment_id === paymentId), [db.paymentReviews])
  const attendanceOf = useCallback((participantId: string) =>
    db.attendance.filter((a) => a.participant_id === participantId)
      .sort((a, b) => +new Date(b.recorded_at) - +new Date(a.recorded_at)), [db.attendance])

  const documentsFor = useCallback((participantId: string | null) => {
    const p = participantId ? db.participants.find((x) => x.id === participantId) : null
    const acc = participantId ? computeAccount(db, participantId) : null
    const paidOk = !!acc && acc.total_paid > 0
    const statusOk = !!p && ['inscrito', 'activo', 'observado'].includes(p.status)
    const unlocked = statusOk && (!db.settings.docs_require_payment || paidOk)
    const visible = db.documents.filter((d) => d.published)
    if (unlocked) return { docs: visible, locked: false }
    return { docs: visible.filter((d) => !d.requires_payment), locked: true }
  }, [db])

  const stats = useMemo<DashboardStats>(() => {
    const lastEvent = [...db.events].sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))
      .find((e) => new Date(e.starts_at) <= new Date()) || db.events[0]
    const lastAtt = lastEvent
      ? db.attendance.filter((a) => a.event_id === lastEvent.id && a.status !== 'falta_injustificada' && a.status !== 'falta_justificada').length
      : 0
    const accounts = db.participants.map((p) => computeAccount(db, p.id))
    return {
      total_participants: db.participants.length,
      pending_enrollments: db.participants.filter((p) => p.status === 'pendiente').length,
      active_participants: db.participants.filter((p) => p.status === 'activo').length,
      with_pending_payments: accounts.filter((a) => a.balance > 0 && a.status !== 'completo').length,
      total_collected: db.payments.filter((p) => p.status === 'validado').reduce((s, p) => s + Number(p.amount), 0),
      total_debt: accounts.reduce((s, a) => s + a.balance, 0),
      payments_to_validate: db.payments.filter((p) => p.status === 'pendiente').length,
      fully_paid: accounts.filter((a) => a.status === 'completo').length,
      last_event_attendance: lastAtt,
      absences: db.attendance.filter((a) => a.status === 'falta_injustificada').length,
      docs_enabled: db.participants.filter((p) => {
        const acc = computeAccount(db, p.id)
        return ['inscrito', 'activo', 'observado'].includes(p.status) && (!db.settings.docs_require_payment || acc.total_paid > 0)
      }).length,
    }
  }, [db])

  const value: StoreCtx = {
    ready, db, user, account, stats,
    login, loginAs, logout, register,
    submitPayment, reviewPayment, setEnrollmentStatus, updateParticipant,
    lookupByToken, registerAttendance, saveAbsence,
    saveEvent, deleteEvent, saveSession, deleteSession,
    saveDocument, deleteDocument, saveAnnouncement, deleteAnnouncement,
    saveField, deleteField, saveProfile, deleteProfile, updateSettings,
    markNotificationRead, markAllRead, documentsFor, attendanceOf, paymentsOf, reviewsOf, resetDemo,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const isDemoMode = isDemo
