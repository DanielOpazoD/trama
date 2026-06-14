# WhatsApp — captura por mensaje (vía Twilio)

Permite agregar **notas, citas, entidades y momentos** a Trama mandando un
mensaje de WhatsApp. Pensado para captura rápida desde el bolsillo; la
curaduría fina (vincular entidades, ediciones) se hace después en la app.

## Arquitectura

```
WhatsApp ──> Twilio ──POST /api/whatsapp-webhook──> Trama
                         (firma X-Twilio-Signature)
```

- **`netlify/functions/whatsapp-webhook.mts`** — endpoint público. Verifica la
  firma de Twilio, resuelve el número → usuario (`whatsapp_links`), interpreta
  el mensaje y escribe. Responde con **TwiML** (XML) que Twilio entrega como
  respuesta — no hace falta llamada saliente ni credenciales de envío.
- **`netlify/functions/whatsapp-link.mts`** — endpoint autenticado (sesión
  real). Genera/lista/borra vínculos. UI en Configuración → WhatsApp.
- **`_lib/whatsapp/`** — piezas puras y testeadas:
  - `twilio-signature.ts` — HMAC-SHA1 del algoritmo de Twilio.
  - `phone.ts` — normaliza `whatsapp:+56…` → E164.
  - `link-code.ts` — código de un solo uso (alfabeto sin ambigüedades).
  - `parse-command.ts` — parser híbrido: prefijos (`nota:`, `cita:`,
    `entidad:`, `momento:`) y comandos (`vincular`, `ayuda`).
  - `interpret.ts` — prompt + validador del clasificador IA (texto libre).
  - `persist.ts` — escribe en cada dominio reusando tags/embeddings.
  - `twiml.ts` — respuesta XML.
- **Tabla `whatsapp_links`** (migración `20260613230000_whatsapp_links`):
  mapea `phone_e164 → user_id`, con códigos pendientes y soft-delete. RLS por
  usuario; el webhook la lee con bypass de sistema (igual que un PAT).

## Vinculación (prueba de propiedad del número)

1. En la app: Configuración → WhatsApp → **generar código**. Crea una fila
   pendiente con un código que vence en 15 min.
2. El usuario manda `vincular <CÓDIGO>` por WhatsApp.
3. El webhook canjea el código (CTE atómico): ata el número, marca
   `verified_at`, limpia el código. A partir de ahí ese número escribe como
   ese usuario.

Sin vínculo verificado, el webhook responde con instrucciones y **no escribe
nada**.

## Interpretación híbrida

- **Con prefijo** → instantáneo, sin costo de LLM:
  - `nota: <texto>` → Nota.
  - `cita: <frase> — <autor>` → Cita (busca/crea la entidad del autor).
  - `entidad: <nombre> (tipo)` → Entidad (tipo default `concepto`).
  - `momento: <qué pasó>` → Momento (`kind=nota`, fechado hoy).
- **Sin prefijo (texto libre)** → un LLM clasifica en una de las cuatro y
  extrae los campos (`classify`, mismo cost-cap mensual que `extract`). Ante
  la duda cae a **nota**. Si el presupuesto está agotado o la IA está en modo
  Off, también cae a nota — la captura nunca se bloquea.

Una cita necesita autor (la entidad a la que cuelga). Si no viene, el webhook
pide reenviarla con `cita: <texto> — <autor>`.

## Media entrante (fotos)

Si el mensaje trae adjuntos (`NumMedia`/`MediaUrl{i}`), se procesan antes que el
texto. Hoy: **imágenes**.

- Default → **Recorte** (`image_key` en store `recortes-media`, `capture_mode`
  'image'); el caption es el texto del recorte.
- Con caption `momento:` → **Momento foto** (`payload.storageKey` en
  `momentos-media`).
- Varias imágenes en un mensaje → una fila por imagen (la última queda como
  "deshacer").

Las URLs de media de Twilio son privadas: se bajan con auth básica
(`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`), validando que el host sea de
Twilio (guard SSRF) antes de seguir. `_lib/whatsapp/media.ts` (parse, guard,
download, routing) + `media-store.ts` (subida a Blobs) + `persist-media.ts`
(inserts). **Audio y video** se reconocen y se avisan; su persistencia
(transcripción opcional, modelo de video) es el próximo incremento.

**Límites (robustez):** solo se aceptan imágenes `image/jpeg|png|webp|gif`
(otro formato → aviso "mandá JPG/PNG/WEBP/GIF"); el tope de tamaño es
`MAX_MEDIA_BYTES` = 16 MB, chequeado por `Content-Length` (corta sin transferir)
y revalidado contra el buffer real. Pasarse → aviso "imagen muy pesada". No hay
rate-limit por IP/número a propósito (regla de `AGENTS.md`: el cost-cap mensual
del LLM es el límite); el camino de media no llama LLM, así que no consume
presupuesto.

**Resiliencia de descarga:** `downloadTwilioMedia` tiene timeout por intento
(`TWILIO_FETCH_TIMEOUT_MS` = 15 s vía `AbortController`) y reintenta con backoff
(3 intentos) SOLO en fallas transitorias (red, timeout, 5xx, 429). Los 4xx y
`MEDIA_TOO_LARGE` son permanentes y cortan sin reintentar. Cada reintento emite
`whatsapp_media_retry` (observabilidad); el fallo final emite
`whatsapp_media_failed`.

## Comando `estado`

`estado` (o `status`) devuelve un resumen desde el teléfono: si el vínculo está
activo, cuál fue la última captura (con tiempo relativo) y cuántos mensajes se
procesaron este mes. Es de solo lectura (no reclama `MessageSid` ni cuenta como
captura). Formato puro en `_lib/whatsapp/status.ts`; el webhook solo le pasa los
datos leídos de `whatsapp_links` + `whatsapp_processed_messages`.

## Procedencia ("vía WhatsApp")

Toda captura que entra por WhatsApp queda marcada: las tablas con `origin`
JSONB (momentos, entities, quotes) llevan `origin.importedFrom = 'whatsapp'`;
recortes y notes llevan una columna `source = 'whatsapp'` (migración
`20260614030000_whatsapp_media_source`). Habilita el iconito "vía WhatsApp" y
un filtro por procedencia en la UI.

## Confirmación accionable (deep link + deshacer)

Cada captura responde con: la confirmación, un **deep link** a la vista de la
app que contiene el item (`?view=citas|entidades|momentos`, `?world=notas` —
la app lee esos params al primer render vía `useInitialView`/`readWorldDeepLink`;
helper puro en `_lib/whatsapp/deep-link.ts`), y la opción de **deshacer**.

El webhook recuerda la última captura por número en las columnas
`last_capture_kind/id` de `whatsapp_links` (migración
`20260614010000_whatsapp_last_capture`). Si el usuario responde **`deshacer`**
(o `undo`), soft-deletea esa última captura y limpia el puntero — naturalmente
idempotente: un segundo `deshacer` ya no encuentra nada. No deep-linkeamos el
item exacto porque la app aún no rutea por id.

## Seguridad

- **Firma obligatoria en producción.** Si `TWILIO_AUTH_TOKEN` está seteado, un
  webhook sin `X-Twilio-Signature` válida devuelve 401. Sin el token (dev
  local) la verificación se omite.
- El webhook resuelve el usuario por número; solo números **verificados**
  escriben, y siempre bajo el RLS del dueño.

## Idempotencia

Twilio reintenta el webhook si no recibe un 200 a tiempo (~15s) o ante un 5xx.
Como la captura hace embeddings y, en texto libre, una llamada LLM **antes** de
responder, un reintento podía duplicar la nota/cita y volver a pagar el LLM. El
webhook **reclama el `MessageSid`** en la tabla `whatsapp_processed_messages`
(`INSERT ... ON CONFLICT DO NOTHING`) **antes** de clasificar/persistir: si el
SID ya estaba, corta con TwiML vacío sin re-escribir. Es un ledger append-only
(sin `deleted_at`), RLS por usuario. Migración
`20260614003000_whatsapp_processed_messages`.

## Variables de entorno

| Var                    | Para qué                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TWILIO_AUTH_TOKEN`    | Verificar la firma de los webhooks entrantes (consola Twilio).                                                                                    |
| `TWILIO_ACCOUNT_SID`   | Bajar la media entrante (fotos) de la URL privada de Twilio vía auth básica. Sin él, las imágenes no se procesan.                                 |
| `TWILIO_WEBHOOK_URL`   | Opcional. URL exacta configurada en Twilio si difiere del proxy.                                                                                  |
| `VITE_WHATSAPP_NUMBER` | Número del bot (E164). Habilita el QR + botón "Abrir WhatsApp". Público (va al cliente). Sin él, el panel cae a copiar/pegar `vincular <código>`. |

## Onboarding de un toque (QR + deep link)

Si `VITE_WHATSAPP_NUMBER` está configurado, el panel Configuración → WhatsApp
genera, junto al código, un **QR** y un botón **"Abrir WhatsApp"** que apuntan
a `https://wa.me/<número>?text=vincular%20<código>`. El usuario escanea (desde
otro celular) o toca el botón (si ya está en el teléfono) → WhatsApp abre con
el mensaje `vincular <código>` ya escrito → solo aprieta enviar. Cero copiar y
pegar. El helper puro vive en `src/lib/whatsappLink.ts` (testeado); el QR usa
`qrcode` con import perezoso, igual que `MomentoQRModal`.

## Setup externo (lo que hace el usuario)

Ver la sección "paso a paso" en la conversación de implementación, resumida:

1. Crear cuenta en [twilio.com](https://www.twilio.com) y activar el **WhatsApp
   Sandbox** (Messaging → Try it out → WhatsApp), o un número de WhatsApp
   Business aprobado.
2. Unirse al sandbox enviando el código `join <palabras>` al número de Twilio
   desde tu WhatsApp.
3. En Twilio, configurar **"When a message comes in"** →
   `https://<tu-dominio>/api/whatsapp-webhook` (POST).
4. Copiar el **Auth Token** de Twilio y setear `TWILIO_AUTH_TOKEN` en las env
   vars de Netlify. Redeploy.
5. En Trama: Configuración → WhatsApp → generar código → mandar
   `vincular <código>` por WhatsApp.
6. Listo: `nota: …`, `cita: … — autor`, `entidad: …`, `momento: …` o texto
   libre.

> El sandbox de Twilio caduca la sesión cada 24-72 h (hay que reenviar el
> `join`). Para uso permanente, registrar un número de WhatsApp Business.

## Troubleshooting (no me llegan / no responde)

Síntoma → qué revisar, en orden:

1. **El bot no responde nada.**
   - ¿El webhook de Twilio apunta a `https://<dominio>/api/whatsapp-webhook` con
     método **POST**? (Messaging → Sandbox/Sender settings → "When a message
     comes in".)
   - **Sandbox:** ¿enviaste el `join <palabras>` en las últimas 24-72 h? Caduca;
     reenvialo.
   - Revisá los logs de la función en Netlify y el "Debugger" de Twilio
     (Monitor → Logs → Errors).

2. **Responde "Firma de Twilio inválida" / 401.**
   - `TWILIO_AUTH_TOKEN` en Netlify no coincide con el Auth Token actual de
     Twilio (¿rotaste el token? ¿copiaste el de otra subcuenta?).
   - La URL firmada no coincide: si hay proxy/redirect, seteá `TWILIO_WEBHOOK_URL`
     con la URL **exacta** configurada en Twilio.
   - Tras cambiar env vars, **redeploy** (las funciones las leen en build/boot).

3. **Responde "Tu número no está vinculado".**
   - Generá un código en Configuración → WhatsApp y enviá `vincular <código>`
     (vence en 15 min). El número remitente debe ser el mismo que vinculaste.

4. **Texto libre cae siempre a nota (no clasifica).**
   - La IA está en modo **Off** o se agotó el **cost-cap mensual** → fallback a
     nota a propósito (la captura nunca se bloquea). Revisá Configuración → IA y
     el gasto en Estado.

5. **Se duplicó una nota/cita.**
   - No debería: el webhook deduplica por `MessageSid`
     (`whatsapp_processed_messages`). Si pasó, confirmá que la migración
     `20260614003000_whatsapp_processed_messages` está aplicada en ese entorno.

6. **El QR / botón "Abrir WhatsApp" no aparece.**
   - Falta `VITE_WHATSAPP_NUMBER` (es público, se inyecta en build → redeploy).
     Sin él, el panel cae a copiar/pegar `vincular <código>`.
