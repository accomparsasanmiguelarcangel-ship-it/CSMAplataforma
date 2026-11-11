import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AuthHookEvent = {
  user: { id: string; email: string; new_email?: string }
  email_data: {
    redirect_to?: string
    email_action_type: string
    token?: string
    token_hash?: string
    token_new?: string
    token_hash_new?: string
  }
}

const verifyUrl = (base: string, tokenHash: string, action: string, redirectTo = '') =>
  `${base}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(action)}&redirect_to=${encodeURIComponent(redirectTo)}`

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
    const event = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as AuthHookEvent
    const action = event.email_data.email_action_type

    if (action !== 'signup') {
      const apiKey = Deno.env.get('RESEND_API_KEY')
      const from = Deno.env.get('AUTH_EMAIL_FROM')
      if (!apiKey || !from) throw new Error('Email provider is not configured')

      const subjects: Record<string, string> = {
        recovery: 'Restablece tu contraseña',
        invite: 'Invitación a la plataforma',
        magiclink: 'Enlace para iniciar sesión',
        email_change: 'Confirma el cambio de correo',
        password_changed_notification: 'Tu contraseña fue cambiada',
        email_changed_notification: 'Tu correo fue cambiado',
        phone_changed_notification: 'Tu teléfono fue cambiado',
        identity_linked_notification: 'Se vinculó un método de acceso',
        identity_unlinked_notification: 'Se desvinculó un método de acceso',
        mfa_factor_enrolled_notification: 'Se agregó un método de verificación',
        mfa_factor_unenrolled_notification: 'Se quitó un método de verificación',
      }
      const subject = subjects[action] || 'Notificación de seguridad de tu cuenta'
      const send = async (to: string, html: string) => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, html }),
        })
        if (!response.ok) throw new Error(`Email provider error: ${await response.text()}`)
      }
      const linkHtml = (url: string) =>
        `<p>Hola,</p><p>Para continuar con la solicitud de tu cuenta, utiliza este enlace:</p><p><a href="${url}">Continuar</a></p><p>Si no solicitaste este mensaje, puedes ignorarlo.</p>`

      if (action === 'email_change' && event.email_data.token_hash_new && event.email_data.token_new && event.email_data.token_hash && event.user.new_email) {
        await send(event.user.email, linkHtml(verifyUrl(supabaseUrl, event.email_data.token_hash_new, action, event.email_data.redirect_to)))
        await send(event.user.new_email, linkHtml(verifyUrl(supabaseUrl, event.email_data.token_hash, action, event.email_data.redirect_to)))
      } else if (['invite', 'magiclink', 'recovery', 'email_change', 'email', 'reauthentication'].includes(action)) {
        const recipient = action === 'email_change' ? (event.user.new_email || event.user.email) : event.user.email
        const tokenHash = event.email_data.token_hash
        if (!tokenHash) throw new Error(`Missing confirmation token for ${action}`)
        await send(recipient, linkHtml(verifyUrl(supabaseUrl, tokenHash, action, event.email_data.redirect_to)))
      } else {
        await send(event.user.email, `<p>Hola,</p><p>Se registró esta actividad en tu cuenta: ${subject}.</p><p>Si no reconoces esta actividad, comunícate con la directiva.</p>`)
      }

      return new Response('{}', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const random = crypto.getRandomValues(new Uint8Array(32))
    const confirmationToken = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(confirmationToken))
    const confirmationTokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { error } = await supabase.rpc('enqueue_registration_confirmation', {
      p_user_id: event.user.id,
      p_email: event.user.email,
      p_confirmation_token: confirmationToken,
      p_confirmation_token_hash: confirmationTokenHash,
      p_redirect_to: event.email_data.redirect_to || '',
      p_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) throw error

    return new Response('{}', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-email-hook:', error)
    return new Response(JSON.stringify({ error: 'No se pudo procesar el correo de autenticación.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
