import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const workerSecret = Deno.env.get('EMAIL_QUEUE_WORKER_SECRET')
  if (!workerSecret || req.headers.get('Authorization') !== `Bearer ${workerSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('AUTH_EMAIL_FROM')
  if (!url || !serviceKey || !resendKey || !from) {
    return new Response('Email worker is not configured', { status: 500 })
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: rows, error: claimError } = await supabase.rpc('claim_next_registration_email')
  if (claimError) return new Response(claimError.message, { status: 500 })
  const job = rows?.[0]
  if (!job) return Response.json({ ok: true, processed: false })

  const verifyUrl = `${url}/functions/v1/confirm-registration?token=${encodeURIComponent(job.confirmation_token)}`
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [job.email],
        subject: 'Confirma tu correo - Comparsa San Miguel Arcángel',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222"><h2>Confirma tu correo electrónico</h2><p>Tu inscripción está registrada. Para confirmar tu dirección y continuar, pulsa el siguiente enlace:</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#176b45;color:#fff;text-decoration:none;border-radius:8px">Confirmar mi correo</a></p><p>Si no solicitaste esta inscripción, ignora este mensaje.</p></div>`,
      }),
    })
    if (!response.ok) throw new Error(`Resend error: ${await response.text()}`)
    await supabase.from('registration_email_queue').update({
      status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'sending')
    return Response.json({ ok: true, processed: true, queue_no: job.queue_no })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('registration_email_queue').update({
      status: job.attempts < 5 ? 'pending' : 'failed',
      scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo enviar el correo.' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
})
