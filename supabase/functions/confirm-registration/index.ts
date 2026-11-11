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

  const { data, error } = await supabase.rpc('consume_registration_confirmation', {
    p_token_hash: tokenHash,
  })
  const redirectTo = data?.[0]?.redirect_to
  if (error || !redirectTo) {
    return new Response('El enlace ya fue utilizado, fue cancelado o ha vencido.', { status: 400 })
  }

  return new Response(null, { status: 302, headers: { Location: redirectTo } })
})
