import { supabase, isDemo } from './supabase'
import type {
  Announcement, Attendance, DBShape, DocumentItem, EventItem, FormField, Participant,
  Payment, Profile, SessionItem, Settings,
} from './types'

/**
 * Capa de nube (modo Supabase). El estado local del store es la fuente de
 * lectura para la UI (offline-first / PWA); cuando hay credenciales, cada
 * mutación se replica aquí y al iniciar sesión se hidrata desde PostgreSQL.
 *
 * La integridad NO depende de este archivo: las restricciones críticas
 * (DNI único, N° de operación único, asistencia única por jornada, secuencias,
 * auditoría inmutable) están en /supabase/migrations y en RLS.
 */

type Row = Record<string, unknown>

const can = () => !!supabase && !isDemo

export async function cloudLoad(): Promise<Partial<DBShape> | null> {
  if (!can() || !supabase) return null
  try {
    const [profiles, participants, payments, reviews, events, sessions, attendance, documents, announcements, notifications, audit, settings, fields] =
      await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('participants').select('*').order('code'),
        supabase.from('payments').select('*').order('seq'),
        supabase.from('payment_reviews').select('*'),
        supabase.from('events').select('*'),
        supabase.from('event_sessions').select('*'),
        supabase.from('attendance').select('*').order('recorded_at', { ascending: false }).limit(4000),
        supabase.from('documents').select('*'),
        supabase.from('announcements').select('*'),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('settings').select('*').eq('id', 'global').maybeSingle(),
        supabase.from('form_fields').select('*'),
      ])

    const g = <T,>(r: { data: Row[] | null }): T[] => ((r.data || []) as unknown) as T[]

    return {
      profiles: g<Profile>(profiles),
      participants: g<Participant>(participants).map((p) => ({ ...p, extra: (p.extra as Record<string, string>) || {} })),
      payments: g<Payment>(payments),
      paymentReviews: reviews.data ? ((reviews.data as unknown) as DBShape['paymentReviews']) : [],
      events: g<EventItem>(events),
      sessions: g<SessionItem>(sessions),
      attendance: g<Attendance>(attendance),
      documents: g<DocumentItem>(documents),
      announcements: g<Announcement>(announcements),
      notifications: notifications.data ? ((notifications.data as unknown) as DBShape['notifications']) : [],
      audit: audit.data ? ((audit.data as unknown) as DBShape['audit']) : [],
      settings: settings.data ? ({ ...(settings.data as unknown as Settings) } as Settings) : undefined,
      formFields: g<FormField>(fields),
    }
  } catch {
    return null
  }
}

async function safe(fn: () => unknown) {
  try { await Promise.resolve(fn()) } catch { /* la UI ya validó; el error se registra en auditoría del servidor */ }
}

export const cloud = {
  async upsertParticipant(p: Participant) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('participants').upsert({
      id: p.id, code: p.code, dni: p.dni, first_names: p.first_names, last_names: p.last_names,
      phone: p.phone, address: p.address, group_name: p.group_name, photo_drive_id: p.photo_drive_id,
      status: p.status, qr_token: p.qr_token, notes: p.notes, extra: p.extra, profile_id: p.profile_id,
    }))
  },
  async upsertPayment(p: Payment) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('payments').upsert({
      id: p.id, participant_id: p.participant_id, seq: p.seq, amount: p.amount,
      operation_number: p.operation_number, method: p.method, concept: p.concept, paid_at: p.paid_at,
      receipt_drive_id: p.receipt_drive_id, status: p.status, notes: p.notes, reject_reason: p.reject_reason,
    }))
  },
  async review(paymentId: string, action: string, newStatus: string, notes: string) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('payment_reviews').insert({ payment_id: paymentId, action, new_status: newStatus, notes }))
  },
  async attendance(a: Attendance) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('attendance').insert({
      id: a.id, participant_id: a.participant_id, session_id: a.session_id, event_id: a.event_id,
      entry_type: a.entry_type, status: a.status, method: a.method, notes: a.notes, recorded_at: a.recorded_at,
    }))
  },
  async upsertEvent(e: EventItem) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('events').upsert(e))
  },
  async upsertSession(s: SessionItem) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('event_sessions').upsert(s))
  },
  async upsertDocument(d: DocumentItem) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('documents').upsert(d))
  },
  async upsertAnnouncement(a: Announcement) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('announcements').upsert(a))
  },
  async settings(s: Settings) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('settings').upsert({ id: 'global', ...s }))
  },
  async upsertField(f: FormField) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('form_fields').upsert(f))
  },
  async profile(p: Profile) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('profiles').upsert(p))
  },
  async remove(table: string, id: string) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from(table).delete().eq('id', id))
  },
  async notify(rows: Array<Omit<DBShape['notifications'][number], 'id' | 'created_at'>>) {
    if (!can() || !supabase) return
    await safe(() => supabase!.from('notifications').insert(rows))
  },
}
