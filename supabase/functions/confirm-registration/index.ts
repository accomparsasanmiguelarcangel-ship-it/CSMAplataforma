import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return new Response('Confirmation service is not configured', { status: 500 })

  const token = new URL(req.url).searchParams.get('token') || ''
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Enlace inválido o vencido.', { status: 400 })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: job, error: lookupError } = await supabase
    .from('registration_email_queue')
    .select('id,user_id,redirect_to,expires_at,status')
    .eq('confirmation_token_hash', tokenHash)
    .maybeSingle()

  if (lookupError || !job || !['sending', 'sent'].includes(job.status) || new Date(job.expires_at) <= new Date()) {
    return new Response('El enlace ya fue utilizado, fue cancelado o ha vencido.', { status: 400 })
  }

  const { error: confirmError } = await supabase.auth.admin.updateUserById(job.user_id, { email_confirm: true })
  if (confirmError) {
    console.error('confirm-registration:', confirmError)
    return new Response('No se pudo confirmar el correo. Intenta nuevamente más tarde.', { status: 500 })
  }

  await supabase.from('registration_email_queue').update({
    status: 'confirmed',
    confirmation_token: '',
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).in('status', ['sending', 'sent'])

  return new Response(null, { status: 302, headers: { Location: job.redirect_to } })
})
