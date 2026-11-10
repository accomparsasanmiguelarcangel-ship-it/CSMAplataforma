// ═══════════════════════════════════════════════════════════════════════════
//  Edge Function: verify-qr
//  Valida el token del QR y decide si se autoriza el ingreso al evento.
//  Toda la lógica de autorización se ejecuta en el servidor: el cliente no
//  puede saltarse el requisito de pago ni el estado de inscripción.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization') || ''
    const { data: userRes } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    if (!userRes?.user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors })

    const { data: profile } = await admin.from('profiles').select('role,active').eq('id', userRes.user.id).single()
    if (!profile?.active || !['superadmin', 'admin', 'controlador'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Sin permiso para controlar asistencia' }), { status: 403, headers: cors })
    }

    const { token, sessionId } = await req.json()
    if (!token) return new Response(JSON.stringify({ error: 'Token requerido' }), { status: 400, headers: cors })

    const { data: participant } = await admin
      .from('participants')
      .select('id, code, first_names, last_names, group_name, status, photo_drive_id, qr_token')
      .eq('qr_token', token)
      .maybeSingle()

    if (!participant) {
      return new Response(JSON.stringify({ found: false, error: 'Código QR no reconocido' }), { headers: cors })
    }

    const { data: account } = await admin
      .from('account_summary')
      .select('total_amount,total_paid,pending_amount,balance,fees_paid,docs_unlocked')
      .eq('participant_id', participant.id)
      .maybeSingle()

    let event = null
    let firstEntry = null
    if (sessionId) {
      const { data: session } = await admin
        .from('event_sessions').select('id,event_id,name').eq('id', sessionId).maybeSingle()
      if (session) {
        const { data: ev } = await admin.from('events').select('*').eq('id', session.event_id).maybeSingle()
        event = ev
        const { data: existing } = await admin
          .from('attendance')
          .select('recorded_at,status')
          .eq('participant_id', participant.id)
          .eq('session_id', sessionId)
          .eq('entry_type', 'entrada')
          .order('recorded_at')
          .limit(1)
        firstEntry = existing?.[0] || null
      }
    }

    const allowed = participant.status === 'activo' &&
      (!event?.requires_payment || (account?.total_paid || 0) >= (event?.min_paid_amount || 0))

    return new Response(JSON.stringify({
      found: true,
      participant,
      account,
      event,
      already_checked_in: !!firstEntry,
      first_entry_at: firstEntry?.recorded_at || null,
      entry_allowed: allowed,
      entry_reason: participant.status !== 'activo'
        ? `Inscripción en estado ${participant.status}`
        : allowed ? 'Habilitado para el ingreso' : 'Requisito de pago no cumplido',
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: cors })
  }
})
