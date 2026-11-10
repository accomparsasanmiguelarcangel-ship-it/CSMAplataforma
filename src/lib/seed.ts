import type {
  Announcement, Attendance, AuditEntry, DBShape, DocumentItem, EventItem, FormField,
  NotificationItem, Participant, Payment, PaymentReview, Profile, SessionItem, Settings,
} from './types'

const pad = (n: number, len = 4) => String(n).padStart(len, '0')
const iso = (d: Date) => d.toISOString()
const dayOffset = (days: number, hour = 9, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return iso(d)
}

const NAMES: Array<[string, string, string]> = [
  ['María Elena', 'Quispe Huamán', 'Delegación San Miguel'],
  ['José Antonio', 'Mendoza Rojas', 'Delegación Centro'],
  ['Rosa Amelia', 'Ccahuana Torres', 'Sección Danza'],
  ['Luis Fernando', 'Paredes Ayala', 'Sección Música'],
  ['Ana Lucía', 'Vargas Chávez', 'Categoría Juvenil'],
  ['Carlos Alberto', 'Ramos Salazar', 'Delegación Centro'],
  ['Yolanda', 'Huillca Ccorimanya', 'Sección Danza'],
  ['Miguel Ángel', 'Soto Bermúdez', 'Sección Música'],
  ['Patricia', 'Flores Ancco', 'Categoría Juvenil'],
  ['Jorge Luis', 'Cabrera Núñez', 'Delegación San Miguel'],
  ['Elena Beatriz', 'Mamani Apaza', 'Sección Danza'],
  ['Ricardo', 'Zevallos Pinto', 'Delegación Centro'],
  ['Carmen Rosa', 'Llaulli Pumacahua', 'Categoría Adultos'],
  ['Víctor Hugo', 'Delgado Oré', 'Sección Música'],
  ['Silvia', 'Palomino Cárdenas', 'Categoría Juvenil'],
  ['Edwin', 'Chuctaya Nina', 'Delegación San Miguel'],
  ['Nelly', 'Barrientos Loayza', 'Sección Danza'],
  ['Óscar Raúl', 'Gutiérrez Sarmiento', 'Delegación Centro'],
  ['Ruth Noemí', 'Ttito Ccama', 'Categoría Juvenil'],
  ['Pedro Pablo', 'Ríos Alvarado', 'Sección Música'],
  ['Gladys', 'Vílchez Obregón', 'Categoría Adultos'],
  ['Jhonatan', 'Auccahuasi Ccopa', 'Sección Danza'],
  ['Margarita', 'Solís Reynoso', 'Delegación San Miguel'],
  ['Félix Alberto', 'Cáceres Beltrán', 'Delegación Centro'],
]

const settings: Settings = {
  association_name: 'Asociación Cultural Comparsa San Miguel Arcángel 2004',
  code_prefix: 'ASO',
  total_amount: 320,
  advance_amount: 120,
  installments: 4,
  first_due_date: dayOffset(12).slice(0, 10),
  yape_number: '987 654 321',
  yape_holder: 'Asociación Cultural Comparsa San Miguel Arcángel 2004',
  yape_qr_url: null,
  docs_require_payment: true,
  drive_root_folder_id: null,
}

const formFields: FormField[] = [
  { id: 'f1', label: 'Talla de vestuario', key: 'talla', type: 'select', required: false, options: ['S', 'M', 'L', 'XL'], active: true },
  { id: 'f2', label: 'Instrumento que ejecuta', key: 'instrumento', type: 'select', required: false, options: ['Quena', 'Tinya', 'Guitarra', 'Ninguno'], active: true },
  { id: 'f3', label: '¿Participa en desfile?', key: 'desfile', type: 'select', required: false, options: ['Sí', 'No'], active: true },
]

export function buildSeed(): DBShape {
  const profiles: Profile[] = [
    { id: 'u-super', email: 'admin@arcangel2004.org', full_name: 'Rosa Delgado (Directiva)', role: 'superadmin', active: true, created_at: dayOffset(-420, 8) },
    { id: 'u-admin', email: 'directiva@arcangel2004.org', full_name: 'Efraín Salas (Tesorero)', role: 'admin', active: true, created_at: dayOffset(-390, 8) },
    { id: 'u-control', email: 'control@arcangel2004.org', full_name: 'Maritza Peña (Control de asistencia)', role: 'controlador', active: true, created_at: dayOffset(-200, 8) },
  ]

  const participants: Participant[] = []
  const payments: Payment[] = []
  const reviews: PaymentReview[] = []
  const notifications: NotificationItem[] = []
  const attendance: Attendance[] = []

  NAMES.forEach((item, i) => {
    const n = i + 1
    const code = `ASO-${pad(n)}`
    const status = n <= 19 ? 'activo' : n <= 22 ? 'inscrito' : n === 23 ? 'observado' : 'pendiente'
    const pid = `p-${pad(n)}`
    const profileId = n <= 6 ? `u-part-${pad(n)}` : null
    if (profileId) {
      profiles.push({
        id: profileId,
        email: `${item[0].split(' ')[0].toLowerCase()}.${item[1].split(' ')[0].toLowerCase()}@correo.pe`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        full_name: `${item[0]} ${item[1]}`,
        role: 'participante',
        active: true,
        created_at: dayOffset(-180 + i * 3, 10),
        participant_id: pid,
      })
    }
    participants.push({
      id: pid,
      profile_id: profileId,
      code,
      dni: String(41000000 + n * 1373).slice(0, 8),
      first_names: item[0],
      last_names: item[1],
      phone: `9${String(12000000 + n * 45721).slice(0, 8)}`,
      address: ['Av. Los Ángeles 245', 'Jr. Cusco 118', 'Calle San Martín 902', 'Av. Perú 1533'][i % 4],
      group_name: item[2],
      photo_url: null,
      photo_drive_id: `1Drv${pad(n)}_SELFIE`,
      status: status as Participant['status'],
      qr_token: `arc-${pad(n)}-${(1000000 + n * 7919).toString(36)}`,
      created_at: dayOffset(-190 + i * 3, 10, 15),
      notes: n === 23 ? 'Documento observado: DNI ilegible en la ficha.' : null,
      extra: { talla: ['S', 'M', 'L', 'XL'][i % 4], instrumento: ['Quena', 'Tinya', 'Guitarra', 'Ninguno'][i % 4], desfile: 'Sí' },
    })

    // Historial de pagos coherente con el estado
    const totalAmount = settings.total_amount
    let paidCount = 0
    if (n <= 12) paidCount = 4
    else if (n <= 16) paidCount = 3
    else if (n <= 19) paidCount = 2
    else if (n <= 21) paidCount = 1
    else if (n === 22) paidCount = 0

    for (let k = 1; k <= paidCount; k++) {
      const amount = k === 1 ? settings.advance_amount : Math.round((totalAmount - settings.advance_amount) / (settings.installments - 1))
      payments.push({
        id: `pay-${pad(n)}-${k}`,
        participant_id: pid,
        seq: k,
        amount,
        operation_number: `${800000 + n * 31 + k * 7}`,
        method: 'Yape',
        concept: k === 1 ? 'Adelanto obligatorio' : `Cuota ${k - 1}`,
        paid_at: dayOffset(-170 + k * 21, 18, 30),
        receipt_url: null,
        receipt_drive_id: `1Drv${pad(n)}_PAGO_${pad(k, 2)}`,
        status: 'validado',
        notes: null,
        reject_reason: null,
        created_at: dayOffset(-170 + k * 21, 18, 45),
        reviewed_at: dayOffset(-169 + k * 21, 9, 20),
        reviewed_by: 'u-admin',
      })
      reviews.push({
        id: `rev-${pad(n)}-${k}`,
        payment_id: `pay-${pad(n)}-${k}`,
        action: 'validado',
        previous_status: 'pendiente',
        new_status: 'validado',
        amount,
        reviewer_email: 'directiva@arcangel2004.org',
        notes: 'Comprobante conforme.',
        created_at: dayOffset(-169 + k * 21, 9, 20),
      })
    }

    // Comprobantes en revisión
    if (n >= 20 && n <= 22) {
      const seq = paidCount + 1
      payments.push({
        id: `pay-${pad(n)}-${seq}`,
        participant_id: pid,
        seq,
        amount: n === 20 ? 120 : 60,
        operation_number: `${900100 + n * 13}`,
        method: 'Yape',
        concept: n === 20 ? 'Adelanto obligatorio' : 'Pago parcial',
        paid_at: dayOffset(-3 - n, 19, 10),
        receipt_url: null,
        receipt_drive_id: `1Drv${pad(n)}_PAGO_${pad(seq, 2)}`,
        status: 'pendiente',
        notes: null,
        reject_reason: null,
        created_at: dayOffset(-3 - n, 19, 12),
        reviewed_at: null,
      })
      notifications.push({
        id: `nt-${pad(n)}`,
        profile_id: `u-part-${String(Math.min(n, 6)).padStart(4, '0')}`,
        title: 'Comprobante recibido',
        body: `Tu comprobante de S/ ${n === 20 ? '120.00' : '60.00'} está pendiente de validación.`,
        type: 'pago',
        read: false,
        created_at: dayOffset(-3 - n, 19, 13),
      })
    }

    // Un comprobante rechazado para mostrar el flujo completo
    if (n === 18) {
      payments.push({
        id: `pay-${pad(n)}-3`,
        participant_id: pid,
        seq: 3,
        amount: 80,
        operation_number: `777${n}21`,
        method: 'Yape',
        concept: 'Cuota 2',
        paid_at: dayOffset(-24, 20, 5),
        receipt_url: null,
        receipt_drive_id: `1Drv${pad(n)}_PAGO_03`,
        status: 'rechazado',
        notes: null,
        reject_reason: 'El monto del comprobante no coincide con la cuota indicada.',
        created_at: dayOffset(-24, 20, 7),
        reviewed_at: dayOffset(-23, 11, 0),
        reviewed_by: 'u-admin',
      })
      reviews.push({
        id: `rev-${pad(n)}-3`,
        payment_id: `pay-${pad(n)}-3`,
        action: 'rechazado',
        previous_status: 'pendiente',
        new_status: 'rechazado',
        amount: 80,
        reviewer_email: 'directiva@arcangel2004.org',
        notes: 'Monto no coincide; se solicita nuevo comprobante.',
        created_at: dayOffset(-23, 11, 0),
      })
    }
  })

  const events: EventItem[] = [
    {
      id: 'ev-1', name: 'Ensayo general — Cuadro de danza', description: 'Ensayo de coreografía para la presentación oficial.',
      place: 'Local institucional — Patio principal', starts_at: dayOffset(-7, 19), ends_at: dayOffset(-7, 22),
      categories: ['Sección Danza', 'Categoría Juvenil'], requires_payment: false, min_paid_amount: 0, active: true,
    },
    {
      id: 'ev-2', name: 'Reunión de delegaciones', description: 'Coordinación de cronograma y cuotas.',
      place: 'Salón comunal San Miguel', starts_at: dayOffset(-2, 18), ends_at: dayOffset(-2, 20),
      categories: ['Delegación Centro', 'Delegación San Miguel'], requires_payment: false, min_paid_amount: 0, active: true,
    },
    {
      id: 'ev-3', name: 'Presentación oficial — Fiesta Patronal', description: 'Presentación de la comparsa en la fiesta patronal.',
      place: 'Plaza de Armas de San Miguel', starts_at: dayOffset(9, 10), ends_at: dayOffset(9, 16),
      categories: [], requires_payment: true, min_paid_amount: 120, active: true,
    },
    {
      id: 'ev-4', name: 'Gran Desfile Institucional 2027', description: 'Desfile de aniversario con vestuario completo.',
      place: 'Av. Principal — Recorrido oficial', starts_at: dayOffset(45, 9), ends_at: dayOffset(45, 14),
      categories: [], requires_payment: true, min_paid_amount: 200, active: true,
    },
  ]

  const sessions: SessionItem[] = [
    { id: 'se-1', event_id: 'ev-1', name: 'Jornada única', session_date: dayOffset(-7).slice(0, 10), start_time: '19:00', end_time: '22:00', late_after: '19:20' },
    { id: 'se-2', event_id: 'ev-2', name: 'Jornada única', session_date: dayOffset(-2).slice(0, 10), start_time: '18:00', end_time: '20:00', late_after: '18:15' },
    { id: 'se-3', event_id: 'ev-3', name: 'Jornada 1 — Concentración', session_date: dayOffset(9).slice(0, 10), start_time: '10:00', end_time: '13:00', late_after: '10:15' },
    { id: 'se-4', event_id: 'ev-3', name: 'Jornada 2 — Presentación', session_date: dayOffset(9).slice(0, 10), start_time: '13:30', end_time: '16:00', late_after: '13:45' },
  ]

  // Asistencias del último evento (ev-2) y del ensayo (ev-1)
  participants.forEach((p, i) => {
    if (p.status === 'pendiente' || p.status === 'rechazado') return
    const inEvent1 = i % 7 !== 3
    const inEvent2 = i % 5 !== 2
    if (inEvent1) {
      attendance.push({
        id: `at-1-${i}`, participant_id: p.id, session_id: 'se-1', event_id: 'ev-1', entry_type: 'entrada',
        status: i % 9 === 0 ? 'tardanza' : 'presente', method: 'qr',
        recorded_at: dayOffset(-7, 19, i % 9 === 0 ? 28 : 5 + (i % 12)),
        recorded_by_email: 'control@arcangel2004.org', notes: null,
      })
    } else {
      attendance.push({
        id: `at-1f-${i}`, participant_id: p.id, session_id: 'se-1', event_id: 'ev-1', entry_type: 'entrada',
        status: 'falta_injustificada', method: 'manual', recorded_at: dayOffset(-7, 22, 0),
        recorded_by_email: 'control@arcangel2004.org', notes: 'No se presentó al ensayo.',
      })
    }
    if (inEvent2) {
      attendance.push({
        id: `at-2-${i}`, participant_id: p.id, session_id: 'se-2', event_id: 'ev-2', entry_type: 'entrada',
        status: i % 6 === 0 ? 'tardanza' : 'presente', method: 'qr',
        recorded_at: dayOffset(-2, 18, i % 6 === 0 ? 22 : 3 + (i % 10)),
        recorded_by_email: 'control@arcangel2004.org', notes: null,
      })
    }
  })

  const documents: DocumentItem[] = [
    { id: 'doc-1', title: 'Estatuto de la Asociación', category: 'Estatutos', description: 'Estatuto vigente aprobado en asamblea.', file_url: null, drive_file_id: '1DocEstatuto', requires_payment: false, published: true, published_at: dayOffset(-300, 9), size_label: '820 KB' },
    { id: 'doc-2', title: 'Reglamento interno 2026', category: 'Reglamentos internos', description: 'Normas de convivencia y disciplina interna.', file_url: null, drive_file_id: '1DocReglamento', requires_payment: true, published: true, published_at: dayOffset(-120, 9), size_label: '410 KB' },
    { id: 'doc-3', title: 'Reglamento de participación y cuotas', category: 'Reglamentos de participación', description: 'Cronograma de cuotas y condiciones de participación.', file_url: null, drive_file_id: '1DocCuotas', requires_payment: true, published: true, published_at: dayOffset(-110, 9), size_label: '265 KB' },
    { id: 'doc-4', title: 'Normas de convivencia', category: 'Normas de convivencia', description: 'Acuerdos de respeto y trabajo en equipo.', file_url: null, drive_file_id: '1DocConvivencia', requires_payment: true, published: true, published_at: dayOffset(-100, 9), size_label: '190 KB' },
    { id: 'doc-5', title: 'Cronograma oficial de ensayos', category: 'Cronogramas', description: 'Programación de ensayos y presentaciones.', file_url: null, drive_file_id: '1DocCronograma', requires_payment: false, published: true, published_at: dayOffset(-15, 9), size_label: '120 KB' },
    { id: 'doc-6', title: 'Comunicado N° 05 — Vestuario', category: 'Comunicados', description: 'Indicaciones para la confección del vestuario.', file_url: null, drive_file_id: '1DocComunicado05', requires_payment: true, published: true, published_at: dayOffset(-8, 9), size_label: '95 KB' },
    { id: 'doc-7', title: 'Acta de asamblea — Diciembre', category: 'Actas y acuerdos', description: 'Acuerdos adoptados por la directiva.', file_url: null, drive_file_id: '1DocActa', requires_payment: false, published: false, published_at: dayOffset(-4, 9), size_label: '310 KB' },
  ]

  const announcements: Announcement[] = [
    { id: 'an-1', title: 'Convocatoria a ensayo general', body: 'Se convoca a todas las delegaciones al ensayo general del sábado. Presentarse con vestuario de ensayo y quena o tinya según corresponda. La asistencia es obligatoria.', published_at: dayOffset(-3, 8), pinned: true, audience: 'todos' },
    { id: 'an-2', title: 'Segunda cuota: fecha límite', body: 'La segunda cuota vence el próximo 30. Los pagos se realizan por Yape al número institucional y el comprobante debe subirse desde MIS PAGOS para su validación.', published_at: dayOffset(-6, 8), pinned: false, audience: 'participantes' },
    { id: 'an-3', title: 'Presentación oficial confirmada', body: 'La comparsa participará en la Fiesta Patronal de San Miguel. El ingreso se autorizará a los participantes con al menos el adelanto validado.', published_at: dayOffset(-10, 8), pinned: false, audience: 'todos' },
  ]

  const audit: AuditEntry[] = [
    { id: 'au-1', actor_email: 'directiva@arcangel2004.org', action: 'payment.validate', table_name: 'payments', record_id: 'pay-0016-3', old_data: { status: 'pendiente' }, new_data: { status: 'validado' }, created_at: dayOffset(-6, 10, 12) },
    { id: 'au-2', actor_email: 'directiva@arcangel2004.org', action: 'payment.reject', table_name: 'payments', record_id: 'pay-0018-3', old_data: { status: 'pendiente' }, new_data: { status: 'rechazado' }, created_at: dayOffset(-23, 11, 0) },
    { id: 'au-3', actor_email: 'admin@arcangel2004.org', action: 'participant.status', table_name: 'participants', record_id: 'p-0023', old_data: { status: 'pendiente' }, new_data: { status: 'observado' }, created_at: dayOffset(-40, 9, 30) },
  ]

  return {
    settings,
    formFields,
    profiles,
    participants,
    payments,
    paymentReviews: reviews,
    events,
    sessions,
    attendance,
    documents,
    announcements,
    notifications,
    audit,
    duplicates: [
      { id: 'dup-1', dni: participants[4].dni, attempted_at: dayOffset(-1, 16, 40), first_names: 'Ana Lucía', last_names: 'Vargas Chávez', phone: '987 112 334', existing_code: 'ASO-0005' },
    ],
    counter: participants.length,
    session: { profileId: null },
  }
}
