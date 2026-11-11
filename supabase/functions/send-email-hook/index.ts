import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!hookSecret || !supabaseUrl || !serviceKey) {
    return new Response('Email hook is not configured', { status: 500, headers: cors })
  }

  try {
    const raw = await req.text()
    const secret = hookSecret.replace(/^v1,whsec_/, '')
    const event = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as {
      user: { id: string; email: string }
      email_data: {
        token_hash: string
        redirect_to: string
        email_action_type: string
      }
    }

    if (event.email_data.email_action_type !== 'signup') {
      // Preserve password recovery and other Auth messages. The same provider is
      // used for all Auth emails while this hook is enabled.
      const apiKey = Deno.env.get('RESEND_API_KEY')
      if (!apiKey) throw new Error('RESEND_API_KEY is required for non-signup Auth emails')
      const action = event.email_data.email_action_type
      const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(event.email_data.token_hash)}&type=${encodeURIComponent(action)}&redirect_to=${encodeURIComponent(event.email_data.redirect_to)}`
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('AUTH_EMAIL_FROM'),
          to: [event.user.email],
          subject: action === 'recovery' ? 'Restablece tu contraseña' : 'Acción de seguridad de tu cuenta',
          html: `<p>Hola,</p><p>Para continuar con la solicitud de tu cuenta, utiliza este enlace:</p><p><a href="${verifyUrl}">Continuar</a></p><p>Si no solicitaste este mensaje, puedes ignorarlo.</p>`,
        }),
      })
      if (!response.ok) throw new Error(`Resend error: ${await response.text()}`)
      return new Response('{}', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { error } = await supabase.rpc('enqueue_registration_confirmation', {
      p_user_id: event.user.id,
      p_email: event.user.email,
      p_token_hash: event.email_data.token_hash,
      p_redirect_to: event.email_data.redirect_to,
    })
    if (error) throw error

    return new Response('{}', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-email-hook:', error)
    return new Response(JSON.stringify({ error: 'No se pudo encolar el correo de autenticación.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
