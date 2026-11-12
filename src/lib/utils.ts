import { clsx } from './clsx'

export const money = (n: number | null | undefined): string =>
  'S/ ' + Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const dayMonth = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
}

export const dateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const timeOnly = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

export const initials = (first: string, last: string): string =>
  `${(first || '').trim().charAt(0)}${(last || '').trim().charAt(0)}`.toUpperCase()

export const fullName = (p: { first_names: string; last_names: string }): string =>
  `${p.first_names} ${p.last_names}`.replace(/\s+/g, ' ').trim()

export const todayISO = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export const paymentStatusLabel: Record<string, string> = {
  pendiente: 'Pendiente de validación',
  validado: 'Aprobado',
  rechazado: 'Rechazado',
}

export const accountStatusLabel: Record<string, string> = {
  sin_pagos: 'Sin pagos',
  pendiente_validacion: 'Pendiente de validación',
  pago_parcial: 'Pago parcial',
  al_dia: 'Al día',
  deuda: 'Deuda pendiente',
  rechazado: 'Pago rechazado',
  completo: 'Pago completo',
}

export const enrollmentStatusLabel: Record<string, string> = {
  pendiente: 'Pendiente de revisión',
  inscrito: 'Inscrito',
  observado: 'Observado',
  rechazado: 'Rechazado',
  activo: 'Activo',
}

export const attendanceStatusLabel: Record<string, string> = {
  presente: 'Presente',
  tardanza: 'Tardanza',
  falta_justificada: 'Falta justificada',
  falta_injustificada: 'Falta injustificada',
  permiso: 'Permiso autorizado',
  retiro_anticipado: 'Retiro anticipado',
}

export const roleLabel: Record<string, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
  controlador: 'Controlador de asistencia',
  participante: 'Participante',
}

export const statusTone = (s: string): 'ok' | 'warn' | 'bad' | 'info' | 'neutral' => {
  if (['validado', 'activo', 'inscrito', 'presente', 'completo', 'al_dia'].includes(s)) return 'ok'
  if (['pendiente', 'pendiente_validacion', 'observado', 'tardanza', 'pago_parcial'].includes(s)) return 'warn'
  if (['rechazado', 'falta_injustificada', 'deuda'].includes(s)) return 'bad'
  return 'info'
}

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const readFileAsDataURL = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = reject
    fr.readAsDataURL(file)
  })

export const slug = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()

export { clsx }
