// ═══════════════════════════════════════════════════════════════════════════
//  Edge Function: drive-sync
//  Guarda la selfie, los comprobantes, los documentos y los reportes en
//  Google Drive usando una CUENTA DE SERVICIO. Las credenciales viven
//  únicamente en los secretos de Supabase, nunca en el frontend.
//
//  Estructura creada automáticamente:
//  ASOCIACION/01_PARTICIPANTES/ASO-0025/ASO-0025_SELFIE.jpg
//  ASOCIACION/01_PARTICIPANTES/ASO-0025/ASO-0025_PAGO_01.jpg
//  02_EVENTOS / 03_DOCUMENTACION / 04_REPORTES / 05_ADMINISTRACION
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SA_EMAIL = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!
const SA_KEY = (Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
const ROOT = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!
const SHARED_DRIVE = Deno.env.get('GOOGLE_DRIVE_SHARED_DRIVE_ID') || ''
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim())

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': ALLOWED.includes('*') ? '*' : ALLOWED[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

type FolderMap = Record<string, string>

/* ── JWT de cuenta de servicio (OAuth2) ─────────────────────────────────── */
function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pemToKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', raw, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const key = await pemToKey(SA_KEY)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))
  const jwt = `${header}.${payload}.${b64url(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google OAuth: ${JSON.stringify(json)}`)
  return json.access_token as string
}

/* ── Helpers de Drive ───────────────────────────────────────────────────── */
async function findFolder(token: string, name: string, parent: string): Promise<string | null> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parent}' in parents`,
    'trashed = false',
  ].join(' and ')
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  if (SHARED_DRIVE) { url.searchParams.set('corpora', 'drive'); url.searchParams.set('driveId', SHARED_DRIVE) }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  return json.files?.[0]?.id ?? null
}

async function ensureFolder(token: string, name: string, parent: string, cache: FolderMap): Promise<string> {
  const key = `${parent}/${name}`
  if (cache[key]) return cache[key]
  const found = await findFolder(token, name, parent)
  if (found) { cache[key] = found; return found }
  const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    }),
  })
  const json = await res.json()
  if (!json.id) throw new Error(`No se pudo crear la carpeta ${name}: ${JSON.stringify(json)}`)
  cache[key] = json.id
  return json.id as string
}

async function uploadFile(token: string, name: string, parent: string, bytes: Uint8Array, mime: string): Promise<string> {
  const boundary = 'arcangel' + crypto.randomUUID()
  const meta = JSON.stringify({ name, parents: [parent] })
  const pre = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  )
  const post = new TextEncoder().encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(pre.length + bytes.length + post.length)
  body.set(pre, 0)
  body.set(bytes, pre.length)
  body.set(post, pre.length + bytes.length)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const json = await res.json()
  if (!json.id) throw new Error(`No se pudo subir ${name}: ${JSON.stringify(json)}`)
  return json.id as string
}

/* ── Estructura institucional ───────────────────────────────────────────── */
async function ensureStructure(token: string, cache: FolderMap) {
  const tree: FolderMap = {}
  tree['ASOCIACION'] = await ensureFolder(token, 'ASOCIACION', ROOT, cache)
  const root = tree['ASOCIACION']
  const l1 = ['01_PARTICIPANTES', '02_EVENTOS', '03_DOCUMENTACION', '04_REPORTES', '05_ADMINISTRACION']
  for (const f of l1) tree[f] = await ensureFolder(token, f, root, cache)
  for (const f of ['ESTATUTOS', 'REGLAMENTOS', 'COMUNICADOS', 'CRONOGRAMAS']) {
    tree[`DOC_${f}`] = await ensureFolder(token, f, tree['03_DOCUMENTACION'], cache)
  }
  for (const f of ['INSCRIPCIONES', 'RECAUDACION', 'DEUDAS', 'ASISTENCIAS']) {
    tree[`REP_${f}`] = await ensureFolder(token, f, tree['04_REPORTES'], cache)
  }
  for (const f of ['CONFIGURACION', 'HISTORIAL']) {
    tree[`ADM_${f}`] = await ensureFolder(token, f, tree['05_ADMINISTRACION'], cache)
  }
  return tree
}

/* ── Handler ────────────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization') || ''
    const jwt = auth.replace('Bearer ', '')
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors })
    }

    const body = await req.json()
    const kind = body.kind as 'selfie' | 'receipt' | 'document' | 'report'
    const cache: FolderMap = body.folderCache || {}

    const token = await getAccessToken()
    const tree = await ensureStructure(token, cache)

    // Carpetas de eventos del año en curso
    const year = new Date().getFullYear()
    await ensureFolder(token, `EVENTO_${year}`, tree['02_EVENTOS'], cache)

    if (!body.code) {
      return new Response(JSON.stringify({ ok: true, tree }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const code = String(body.code).replace(/[^A-Za-z0-9-]/g, '')
    const participantFolder = await ensureFolder(token, code, tree['01_PARTICIPANTES'], cache)

    let folderId = participantFolder
    if (kind === 'document') folderId = tree['DOC_REGLAMENTOS']
    if (kind === 'report') folderId = tree['REP_ASISTENCIAS']

    // Descarga el archivo desde Storage privado (nunca desde el cliente)
    let bytes: Uint8Array | null = null
    let mime = 'image/jpeg'
    let name = body.fileName as string

    if (body.storagePath) {
      const { data, error } = await admin.storage.from('private-files').download(body.storagePath)
      if (error || !data) throw new Error(`Storage: ${error?.message || 'archivo no encontrado'}`)
      bytes = new Uint8Array(await data.arrayBuffer())
      mime = data.type || mime
      name = name || String(body.storagePath).split('/').pop()!
    }

    if (!bytes) return new Response(JSON.stringify({ error: 'Sin archivo para sincronizar' }), { status: 400, headers: cors })

    const fileId = await uploadFile(token, name, folderId, bytes, mime)

    // Guarda la referencia en la base de datos
    if (kind === 'receipt' && body.paymentId) {
      await admin.from('payments').update({ receipt_drive_id: name }).eq('id', body.paymentId)
    }
    if (kind === 'selfie' && body.participantId) {
      await admin.from('participants').update({ photo_drive_id: name }).eq('id', body.participantId)
    }

    return new Response(JSON.stringify({ ok: true, fileId, name, folderId }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('drive-sync', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
