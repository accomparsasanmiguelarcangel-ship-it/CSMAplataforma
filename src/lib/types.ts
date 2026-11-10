// ─────────────────────────────────────────────────────────────────────────────
// Tipos de dominio — Asociación Cultural Comparsa San Miguel Arcángel 2004
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'superadmin' | 'admin' | 'controlador' | 'participante'

export type EnrollmentStatus = 'pendiente' | 'inscrito' | 'observado' | 'rechazado' | 'activo'
export type PaymentStatus = 'pendiente' | 'validado' | 'rechazado'
export type AttendanceStatus =
  | 'presente'
  | 'tardanza'
  | 'falta_justificada'
  | 'falta_injustificada'
  | 'permiso'
  | 'retiro_anticipado'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
  participant_id?: string | null
}

export interface Participant {
  id: string
  profile_id: string | null
  code: string
  dni: string
  first_names: string
  last_names: string
  phone: string
  address: string
  group_name: string
  photo_url: string | null
  photo_drive_id: string | null
  status: EnrollmentStatus
  qr_token: string
  created_at: string
  notes: string | null
  extra: Record<string, string>
  email?: string
}

export interface Account {
  participant_id: string
  total_amount: number
  total_paid: number
  pending_amount: number
  balance: number
  fees_paid: number
  next_due: string | null
  status:
    | 'sin_pagos'
    | 'pendiente_validacion'
    | 'pago_parcial'
    | 'al_dia'
    | 'deuda'
    | 'rechazado'
    | 'completo'
}

export interface Payment {
  id: string
  participant_id: string
  participant_code?: string
  participant_name?: string
  seq: number
  amount: number
  operation_number: string
  method: string
  concept: string
  paid_at: string
  receipt_url: string | null
  receipt_drive_id: string | null
  status: PaymentStatus
  notes: string | null
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by?: string | null
}

export interface PaymentReview {
  id: string
  payment_id: string
  action: 'validado' | 'rechazado' | 'observado' | 'reenvio_solicitado'
  previous_status: PaymentStatus | null
  new_status: PaymentStatus | null
  amount: number | null
  reviewer_email: string
  notes: string | null
  created_at: string
}

export interface EventItem {
  id: string
  name: string
  description: string
  place: string
  starts_at: string
  ends_at: string
  categories: string[]
  requires_payment: boolean
  min_paid_amount: number
  active: boolean
}

export interface SessionItem {
  id: string
  event_id: string
  name: string
  session_date: string
  start_time: string
  end_time: string
  late_after: string
  event_name?: string
}

export interface Attendance {
  id: string
  participant_id: string
  participant_code?: string
  participant_name?: string
  session_id: string
  event_id: string
  entry_type: 'entrada' | 'salida'
  status: AttendanceStatus
  method: 'qr' | 'manual'
  recorded_at: string
  recorded_by_email?: string
  notes: string | null
  session_name?: string
  event_name?: string
}

export interface DocumentItem {
  id: string
  title: string
  category: string
  description: string
  file_url: string | null
  drive_file_id: string | null
  requires_payment: boolean
  published: boolean
  published_at: string
  size_label?: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  published_at: string
  pinned: boolean
  audience: 'todos' | 'participantes' | 'administracion'
}

export interface NotificationItem {
  id: string
  profile_id: string
  title: string
  body: string
  type: 'pago' | 'inscripcion' | 'documento' | 'evento' | 'sistema'
  read: boolean
  created_at: string
}

export interface AuditEntry {
  id: string
  actor_email: string
  action: string
  table_name: string
  record_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

export interface Settings {
  association_name: string
  code_prefix: string
  total_amount: number
  advance_amount: number
  installments: number
  first_due_date: string
  yape_number: string
  yape_holder: string
  yape_qr_url: string | null
  docs_require_payment: boolean
  drive_root_folder_id: string | null
}

export interface FormField {
  id: string
  label: string
  key: string
  type: 'text' | 'number' | 'select' | 'date'
  required: boolean
  options: string[]
  active: boolean
}

export interface CurrentUser {
  profile: Profile
  participant: Participant | null
}

export interface DashboardStats {
  total_participants: number
  pending_enrollments: number
  active_participants: number
  with_pending_payments: number
  total_collected: number
  total_debt: number
  payments_to_validate: number
  fully_paid: number
  last_event_attendance: number
  absences: number
  docs_enabled: number
}

export interface LookupCard {
  participant: Participant
  account: Account
  already_checked_in: boolean
  first_entry_at: string | null
  entry_allowed: boolean
  entry_reason: string
}

export interface DuplicateFlag {
  id: string
  dni: string
  attempted_at: string
  first_names: string
  last_names: string
  phone: string
  existing_code: string
}

export interface DBShape {
  settings: Settings
  formFields: FormField[]
  profiles: Profile[]
  participants: Participant[]
  payments: Payment[]
  paymentReviews: PaymentReview[]
  events: EventItem[]
  sessions: SessionItem[]
  attendance: Attendance[]
  documents: DocumentItem[]
  announcements: Announcement[]
  notifications: NotificationItem[]
  audit: AuditEntry[]
  duplicates: DuplicateFlag[]
  counter: number
  session: { profileId: string | null }
}

export interface RegistrationInput {
  first_names: string
  last_names: string
  dni: string
  phone: string
  address: string
  group_name: string
  email: string
  password: string
  photoDataUrl: string
  extra: Record<string, string>
}

export interface PaymentInput {
  amount: number
  operation_number: string
  paid_at: string
  concept: string
  receiptDataUrl: string
  notes?: string
}
