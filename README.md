# Asociación Cultural Comparsa San Miguel Arcángel 2004
## Plataforma institucional (PWA) — código fuente

Aplicación web progresiva para administrar participantes, inscripciones con **selfie obligatoria**, pagos y cuotas por **Yape**, control de asistencia por **QR**, documentación institucional y reportes, con repositorio de archivos en **Google Drive**.

> **Estado de entrega**: código fuente completo y funcional. La app arranca en **modo demostración** con datos semilla (sin credenciales) y pasa a **modo Supabase** en cuanto configures `.env`. Las credenciales de Supabase y de Google **deben ser provistas por la asociación**: no es posible crearlas desde aquí.

---

### 1. Stack y decisión técnica

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA rápida, tipada, instalable como PWA |
| Estilos | CSS propio con design tokens | Sin dependencias; control total del estilo institucional |
| Backend / DB | **Supabase (PostgreSQL)** | Relacional real (saldos, cuotas, asistencias), **Row Level Security** por rol, triggers, Edge Functions |
| Auth | Supabase Auth (email + contraseña) | Hash gestionado por el proveedor, recuperación de cuenta incluida |
| Archivos | Google Drive API + bucket privado | Drive como repositorio institucional; Storage para lectura privada |
| QR | `qrcode` (generación) + `jsqr` (lectura) | Sin servicios externos; el QR solo contiene un token opaco |
| Reportes | `xlsx` (Excel) + `jspdf` + `jspdf-autotable` (PDF) | Exportación en el cliente, sin coste de servidor |

**¿Por qué Supabase y no Firebase?** El dominio es fuertemente relacional (participante → pagos → validaciones → asistencias → jornadas) y necesita integridad transaccional y consultas agregadas (saldo, deuda total, porcentaje de asistencia). PostgreSQL + RLS + triggers resuelve en la base de datos lo que en Firestore exigiría Cloud Functions y reglas menos expresivas. Además las Edge Functions permiten aislar las credenciales de Google.

---

### 2. Dónde vive cada regla crítica

Ninguna regla de integridad depende de la interfaz. Todas están en `supabase/migrations/0001_schema_rls.sql`:

| Regla | Implementación |
|---|---|
| DNI único (duplicados) | `constraint dni_unique unique (dni)` + tabla `duplicate_flags` para revisión administrativa |
| N° de operación único | `constraint op_number_unique unique (operation_number)` |
| Una asistencia por participante/jornada/tipo | índice único parcial `attendance_unique_entry` (excluye faltas justificadas) |
| Códigos ASO-0001 correlativos | `sequence participant_code_seq` + trigger `set_participant_code` |
| Numeración de pagos ASO-0025_PAGO_01 | trigger `set_payment_seq` (calcula `seq` y el nombre del archivo) |
| Historial de validaciones inmutable | `payment_reviews` es *append-only*; `UPDATE`/`DELETE` bloqueados por política RLS |
| Pago aprobado no editable | trigger `guard_payment_update` |
| Auditoría no borrable | `audit_log` alimentado por triggers; sin políticas de UPDATE/DELETE |
| Participante no aprueba su propio pago | política `payments_insert` exige `status = 'pendiente'`; `payments_update` solo `is_staff()` |
| Acceso a documentos | `docs_unlocked()` = inscrito **y** ≥1 pago validado (configurable) |
| Ingreso a evento | `can_enter_event()` evalúa estado + monto validado contra `events.min_paid_amount` |
| QR sin datos personales | `qr_token` = 16 bytes aleatorios (`gen_random_bytes(16)`); el QR transporta solo `ARCANGEL2004:<token>` |
| Archivos privados | bucket `private-files` **no público**, políticas por carpeta de participante |

Roles: `superadmin`, `admin`, `controlador`, `participante` (enum `app_role`), verificados en la BD mediante `current_role()`, `is_staff()`, `is_controller()`, `my_participant_id()`.

---

### 3. Estructura del proyecto

```
asociacion-arcangel/
├── index.html                     # shell PWA (manifest, theme-color, apple-touch-icon)
├── public/
│   ├── manifest.webmanifest       # iconos, atajos, screenshots, maskable
│   ├── sw.js                      # service worker (network-first nav, cache-first assets)
│   ├── img/logo.png               # LOGOTIPO ORIGINAL sin modificar
│   └── icons/                     # 72→512, maskable, apple-touch, splash, og-image
├── scripts/build-icons.py         # composición de iconos con PIL + CairoSVG
├── src/
│   ├── App.tsx                    # rutas + guardas por rol
│   ├── main.tsx                   # entrada + registro del SW
│   ├── styles.css                 # sistema de diseño institucional
│   ├── components/
│   │   ├── Camera.tsx             # SelfieCapture (getUserMedia) + QrScanner (jsQR)
│   │   ├── Shell.tsx              # navegación lateral + barra móvil + notificaciones
│   │   ├── Splash.tsx             # pantalla de bienvenida
│   │   └── ui.tsx                 # iconos, modal, toast, badges, stat cards
│   ├── lib/
│   │   ├── store.tsx              # estado + reglas de negocio (saldos, duplicados, asistencia)
│   │   ├── remote.ts              # capa Supabase (hidratación y replicación)
│   │   ├── seed.ts                # datos de demostración (24 participantes, eventos, pagos)
│   │   ├── qr.ts                  # generación/parseo del token QR
│   │   ├── export.ts              # Excel y PDF con cabecera institucional
│   │   ├── types.ts               # tipos de dominio
│   │   └── utils.ts               # formato de moneda/fechas, etiquetas de estado
│   └── pages/
│       ├── Auth.tsx               # bienvenida, login, inscripción en 2 pasos
│       ├── Participant.tsx        # inicio, perfil, inscripción, pagos, QR, asistencia, docs
│       ├── Admin.tsx              # dashboard, padrón, ficha, inscripciones, pagos, validación
│       └── AdminOps.tsx           # escáner, eventos, asistencias, faltas, docs, reportes…
├── supabase/
│   ├── migrations/0001_schema_rls.sql
│   ├── migrations/0002_seed.sql
│   └── functions/
│       ├── drive-sync/index.ts     # sube selfies/comprobantes/documentos a Drive
│       └── verify-qr/index.ts      # autoriza ingreso (servidor)
├── docs/INSTALACION.md
├── docs/MANUAL_ADMINISTRACION.md
└── .env.example
```

---

### 4. Módulos implementados

**Participante** — Inicio (estado, saldo, próximo evento), Mi perfil, Mi inscripción (línea de tiempo del proceso), Mis pagos (historial + trazabilidad), Enviar comprobante (Yape), Mi código QR (credencial digital descargable), Mis asistencias, Documentación, Comunicados, Eventos.

**Administración** — Dashboard con 11 indicadores; Participantes (buscador por código/nombre/DNI/grupo + Excel/PDF); Ficha individual (selfie, QR, pagos, asistencias, observaciones); Revisión de inscripciones (activar / observar / rechazar) con panel de duplicados; Gestión financiera con filtros por fecha y estado; Validación de comprobantes (aprobar con corrección de monto, rechazar, solicitar reenvío, detección de operación repetida); Escáner QR con verificación de fotografía, advertencia de doble ingreso y registro manual; Eventos y jornadas; Asistencias por jornada; Faltas y justificaciones; Documentación; Comunicados; Reportes (5 tipos × Excel/PDF); Usuarios y roles; Configuración (código, cuotas, Yape, campos configurables); Historial de operaciones.

**Controlador** — solo escáner, asistencias, faltas y consulta de participantes; sin acceso a información financiera.

---

### 5. Inicio rápido (modo demostración)

```bash
npm install
npm run dev      # http://localhost:5173
```
La pantalla de login ofrece accesos directos a los perfiles de ejemplo (superadmin, administrador, controlador y participantes). Los datos viven en `localStorage` y se pueden restablecer desde **Configuración → Mantenimiento**.

Para conectar Supabase y Google Drive: ver **`docs/INSTALACION.md`**.

---

### 6. Identidad visual

- El logotipo original (`public/img/logo.png`) **se usa tal cual**: no se redibuja, deforma ni recolorea en ninguna pantalla.
- El icono de aplicación se compone alrededor del logo con decoración instrumental vectorial (quena, tinya, guitarra) dibujada aparte y compuesta con PIL, de modo que el logo permanece intacto en el centro.
- Paleta: verde `#2E9E2B` / verde profundo `#12351B`, naranja `#FF5E00`, amarillo `#FFB800`, crema `#F7F5EF`.
- Tipografías: *Fraunces* (títulos) y *Manrope* (interfaz).

---

### 7. Alcance real de esta entrega

Funciona sin credenciales: inscripción con selfie, códigos correlativos, detección de DNI duplicado, envío de comprobante con validación de operación repetida, aprobación/rechazo, cálculo de saldos y cuotas, generación y lectura de QR, asistencias con bloqueo de duplicados, faltas, documentación con regla de acceso, reportes Excel/PDF, auditoría y roles.

Requiere que la asociación aporte: proyecto Supabase, credenciales de Google (cuenta de servicio + carpeta de Drive compartida) y dominio de publicación. Las Edge Functions están escritas y listas para desplegar, pero **no se han ejecutado contra Google Drive en este entorno** porque no existen credenciales reales: en modo demo los archivos se guardan como referencia en el navegador y la subida queda marcada para reintento.
