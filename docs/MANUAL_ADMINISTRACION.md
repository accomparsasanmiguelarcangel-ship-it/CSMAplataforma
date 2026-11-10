# Manual de administración

Guía operativa para la directiva de la Asociación Cultural Comparsa San Miguel Arcángel 2004.

---

## 1. Ingreso al sistema

Cada miembro de la directiva tiene un correo y una contraseña. Al entrar, el sistema lo dirige automáticamente según su rol:

| Rol | Entra a | Puede hacer |
|---|---|---|
| Superadministrador | Panel general | Todo: configuración, usuarios, integraciones, auditoría |
| Administrador | Panel general | Participantes, pagos, documentos, eventos, reportes |
| Controlador | Escáner QR | Escanear, verificar identidad, registrar asistencia |
| Participante | Mi cuenta | Solo su información, pagos, QR y documentos habilitados |

Si alguien olvida su contraseña, se restablece desde **Supabase → Authentication → Users**. El sistema no guarda contraseñas en texto plano.

---

## 2. Ciclo de vida de un participante

```
Inscripción (selfie obligatoria) → Pendiente → Revisión → Activo
                                        ↓
                                   Observado / Rechazado (con motivo)
```

1. El participante completa el formulario y **debe** tomarse la selfie con la cámara frontal; no puede elegir una foto de la galería.
2. Al finalizar, el sistema le asigna un código correlativo (`ASO-0001`), crea su cuenta, su QR y su carpeta en Drive, y guarda el archivo `<código>_SELFIE.jpg`.
3. En **Inscripciones**, la directiva revisa la ficha y la fotografía:
   - **Activar**: habilita el envío de pagos y la documentación.
   - **Observar**: pide regularizar algo (el participante ve el motivo en su panel).
   - **Rechazar**: cierra la inscripción con motivo.
4. Si alguien intenta inscribirse con un DNI ya registrado, el sistema **no crea el registro** y anota el intento en *Registros duplicados* para revisión.

---

## 3. Pagos y cuotas

### Configuración previa
En **Configuración** se define: costo total, adelanto obligatorio, número de cuotas, primer vencimiento y datos de Yape (número y titular). Estos valores se muestran al participante y alimentan el cálculo de saldo.

### Flujo del participante
1. **Mis pagos → Enviar comprobante**.
2. Ve el número y QR de Yape, el monto sugerido (adelanto o cuota) y su saldo.
3. Transfiere y sube la captura indicando monto y **número de operación**.
4. El comprobante entra como **pendiente de validación**. El archivo se guarda como `<código>_PAGO_01.jpg`, `_02`, `_03`…

### Validación (bandeja)
**Validar comprobantes** muestra los pendientes uno por uno:

| Acción | Efecto |
|---|---|
| **Aprobar** | El pago pasa a `validado`, se actualiza el saldo y se notifica al participante |
| **Rechazar** | Queda `rechazado` con el motivo; el participante debe subir uno nuevo |
| **Solicitar nuevo** | Vuelve a `pendiente` con una observación |

Reglas que el sistema impone:
- Un comprobante **no** se considera pagado solo por recibir la imagen.
- El **número de operación no puede repetirse**: se bloquea el envío duplicado.
- Se puede **corregir el monto** al aprobar (si el comprobante difiere de lo declarado).
- Cada aprobación o rechazo queda como **evento adicional** en el historial: nunca se borra el registro original.
- Un pago ya aprobado **no se puede editar**; cualquier ajuste se registra como operación nueva.

### Estados de cuenta
`Sin pagos` → `Pendiente de validación` → `Pago parcial` → `Al día` → `Pago completo` (o `Deuda pendiente` si está atrasado respecto al cronograma).

---

## 4. Control de asistencia por QR

1. **Escáner QR**: elige la **jornada activa** (evento + jornada del día).
2. Escanea la credencial del participante.
3. La pantalla muestra: **fotografía**, nombres, código, grupo, estado de inscripción, autorización de ingreso y estado de cuenta.
4. **Compara la fotografía con la persona presente.** Ese paso es la verificación real de identidad.
5. **Confirmar ingreso** registra código, evento, jornada, fecha, hora exacta y el usuario que escaneó.

Advertencias automáticas:
- Si el QR se escanea **por segunda vez** en la misma jornada, aparece la hora del primer ingreso y se requiere confirmación explícita para registrar un duplicado.
- Si el participante **no está activo** o **no cumple el requisito de pago** del evento, el ingreso aparece como restringido con el motivo.
- Si olvidó su QR, use **Registro manual** por código, DNI o nombre; queda registrado quién lo hizo y con qué método.

### Faltas
En **Asistencias** aparecen los participantes sin registro; se marca `Falta justificada` o `Falta injustificada`. En **Faltas** se pueden aprobar justificaciones y se ve el resumen por participante (injustificadas, justificadas, tardanzas).

La **tardanza** se calcula automáticamente contra la hora límite configurada en cada jornada.

---

## 5. Eventos y jornadas

Cada evento define nombre, descripción, lugar, fecha y horas, categorías, **requisito financiero de ingreso** y estado. Un evento puede tener varias **jornadas**, cada una con su propio horario y hora límite de tardanza, y su registro de asistencia independiente.

Tres conceptos separados, que no deben confundirse:
- **Acceso a documentos**: depende del estado de inscripción y de tener un pago validado.
- **Estado financiero**: saldo del participante.
- **Autorización de ingreso a un evento**: se configura por evento (monto mínimo validado).

---

## 6. Documentación institucional

En **Documentación** se suben estatutos, reglamentos, comunicados, cronogramas y actas. Por cada documento se define:
- Categoría y descripción.
- **Publicado** o borrador (los borradores no los ve nadie).
- **Requiere pago confirmado** o acceso libre al estar inscrito.

El participante solo verá los documentos publicados y, si el documento lo exige, únicamente cuando tenga al menos un pago validado.

---

## 7. Reportes

**Reportes** genera, con cabecera institucional y fecha de emisión:

1. **Padrón de participantes**
2. **Estado de cuentas** (costo, pagado, saldo, estado)
3. **Relación de deudores**
4. **Historial de pagos**
5. **Listado de asistencia**

Cada uno en **Excel** y **PDF**. Los mismos listados aparecen con botones de exportación en Participantes y Gestión financiera.

---

## 8. Usuarios, auditoría y seguridad

- **Usuarios y roles**: crear, habilitar/deshabilitar y asignar rol. La contraseña se gestiona en Supabase Auth.
- **Historial de operaciones**: usuario, acción, tabla, registro afectado, valor anterior y valor nuevo, con fecha y hora. Es **inmutable**: no admite edición ni borrado.
- Los participantes **nunca** pueden consultar información de otros: la política de base de datos limita cada fila a su propio `profile_id`.
- Las fotografías y comprobantes están en un bucket **privado** y en carpetas de Drive no compartidas públicamente.

---

## 9. Rutinas recomendadas

| Frecuencia | Tarea |
|---|---|
| Diaria (en periodo de cuotas) | Validar comprobantes pendientes |
| Diaria (día de evento) | Verificar que la jornada correcta esté activa antes de escanear |
| Semanal | Revisar inscripciones pendientes y registros duplicados |
| Mensual | Exportar *Estado de cuentas* y *Relación de deudores*; respaldar la base |
| Por evento | Exportar el listado de asistencia y archivarlo en `04_REPORTES/ASISTENCIAS` |
| Al cierre de año | Respaldo completo y acta de cierre en `03_DOCUMENTACION/ACTAS` |

---

## 10. Preguntas frecuentes

**Un participante dice que pagó pero no figura.** Verifique que el comprobante esté **aprobado**, no solo enviado. Un comprobante pendiente no afecta el saldo.

**Escaneó dos veces al mismo tiempo.** El sistema avisa con la hora del primer ingreso; no registre el duplicado salvo que sea una salida y reingreso real.

**Necesita cambiar el costo de participación.** En **Configuración** actualice el monto y guarde: el cálculo de saldos se recalcula, pero los pagos ya aprobados se conservan.

**Un documento no aparece al participante.** Revise que esté **publicado** y, si requiere pago, que el participante tenga al menos un pago validado.

**La cámara no funciona.** La app exige HTTPS. En iPhone, la cámara solo se habilita en Safari con conexión segura (o en la app instalada).
