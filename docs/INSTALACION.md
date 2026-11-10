# Instalación y configuración de servicios externos

Esta guía deja la plataforma operativa con base de datos real, autenticación, archivos en Google Drive y publicación PWA.

---

## 0. Requisitos

- Node.js 20 o superior
- Cuenta de Supabase (plan gratuito suficiente para iniciar)
- Cuenta de Google con acceso a Google Cloud Console y Google Drive
- Dominio o subdominio para publicar (Vercel, Netlify o Cloudflare Pages)

---

## 1. Proyecto Supabase

1. Crea un proyecto en <https://supabase.com> y anota:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`
2. Instala la CLI y vincula el proyecto:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <ref-del-proyecto>
```

3. Aplica las migraciones (esquema, RLS, triggers, auditoría):

```bash
supabase db push
```

   O bien, si prefieres el panel: copia y ejecuta el contenido de
   `supabase/migrations/0001_schema_rls.sql` en **SQL Editor**, y después `0002_seed.sql`.

4. Verifica que las políticas quedaron activas:

```sql
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename;
select relname, relrowsecurity from pg_class where relname in
  ('participants','payments','attendance','documents','audit_log');
```

---

## 2. Usuarios y roles

1. **Authentication → Users → Add user**: crea las cuentas de la directiva
   (por ejemplo `admin@arcangel2004.org`, `directiva@arcangel2004.org`, `control@arcangel2004.org`) con contraseña y correo confirmado.
2. Edita los correos en `supabase/migrations/0002_seed.sql` y vuelve a ejecutarlo, o asigna el rol manualmente:

```sql
update public.profiles set role = 'superadmin'
where email = 'admin@arcangel2004.org';
```

3. **Desactiva el registro público** en *Authentication → Providers → Email* si solo la directiva crea cuentas; los participantes se registran desde `/registro` y su perfil se crea con rol `participante`.

> Importante: sin la fila correspondiente en `public.profiles`, un usuario autenticado no tiene permisos. El registro desde la app crea ambos registros.

---

## 3. Google Drive (cuenta de servicio)

Se usa una **cuenta de servicio** para que los archivos vivan en el Drive de la asociación sin depender de una persona.

1. En <https://console.cloud.google.com> crea un proyecto y habilita **Google Drive API**.
2. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio** (sin roles de proyecto).
3. Crea una **clave JSON** y descarga el archivo. Anota:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (mantén los `\n`)
4. En Google Drive crea la carpeta **ASOCIACION** y **compártela** con el `client_email` como **Editor**.
5. Copia el ID de la carpeta desde la URL (`https://drive.google.com/drive/folders/<ESTE_ID>`) → `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
6. Si usas una **Unidad compartida**, copia también su ID → `GOOGLE_DRIVE_SHARED_DRIVE_ID`.

La Edge Function crea automáticamente:

```
ASOCIACION/
├── 01_PARTICIPANTES/ASO-0001/ASO-0001_SELFIE.jpg, ASO-0001_PAGO_01.jpg…
├── 02_EVENTOS/EVENTO_2026/
├── 03_DOCUMENTACION/{ESTATUTOS,REGLAMENTOS,COMUNICADOS,CRONOGRAMAS}/
├── 04_REPORTES/{INSCRIPCIONES,RECAUDACION,DEUDAS,ASISTENCIAS}/
└── 05_ADMINISTRACION/{CONFIGURACION,HISTORIAL}/
```

---

## 4. Variables de entorno

Crea `.env` en la raíz (copia de `.env.example`):

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_APP_NAME=Comparsa San Miguel Arcángel 2004
```

Solo las claves `anon` van al frontend. La `service_role` **nunca** se expone: se configura como secreto de las Edge Functions.

---

## 5. Edge Functions

```bash
supabase secrets set \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="plataforma@tu-proyecto.iam.gserviceaccount.com" \
  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  GOOGLE_DRIVE_ROOT_FOLDER_ID="1AbCdEfGh..." \
  ALLOWED_ORIGINS="https://tu-dominio.com"

supabase functions deploy drive-sync
supabase functions deploy verify-qr
```

Prueba la sincronización (desde un usuario de la directiva):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/drive-sync" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind":"selfie","code":"ASO-0001","storagePath":"participantes/ASO-0001/ASO-0001_SELFIE.jpg","fileName":"ASO-0001_SELFIE.jpg"}'
```

Si la carpeta no existe, la función la crea y devuelve `fileId`.

---

## 6. Compilación y publicación

```bash
npm install
npm run build      # genera dist/
npm run preview    # comprobación local del build
```

**Vercel**: importa el repositorio, framework *Vite*, añade las variables `VITE_*` y publica.
Añade `vercel.json` si usas rutas profundas:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Netlify**: build `npm run build`, publish `dist`, y `_redirects` con `/* /index.html 200`.

Requisitos para que la PWA sea instalable: HTTPS, `manifest.webmanifest` accesible y service worker registrado (ambos ya incluidos).

---

## 7. Copias de seguridad

**Base de datos** (diaria, desde un equipo de la directiva):

```bash
supabase db dump -f respaldo_$(date +%F).sql
```

**Archivos**: Google Drive mantiene versionado y papelera de 30 días. Se recomienda además una copia mensual de `ASOCIACION/04_REPORTES` en un disco externo.

---

## 8. Lista de verificación

- [ ] `supabase db push` ejecutado sin errores
- [ ] `select * from pg_policies where schemaname='public'` devuelve las políticas
- [ ] Usuario `superadmin` creado y visible en `profiles`
- [ ] Inscripción de prueba: la selfie es obligatoria y se rechaza sin cámara
- [ ] DNI repetido: aparece en *Inscripciones → Registros duplicados*
- [ ] Comprobante con el mismo N° de operación: se bloquea
- [ ] Aprobación de pago: el saldo cambia y queda registro en `payment_reviews`
- [ ] Escaneo de QR: segunda lectura avisa la hora del primer ingreso
- [ ] Documentos: bloqueados sin pago validado, visibles con pago
- [ ] `npm run build` sin errores
- [ ] App instalada en Android y iPhone (Añadir a pantalla de inicio)
- [ ] Archivo visible en `ASOCIACION/01_PARTICIPANTES/ASO-0001/` en Drive
