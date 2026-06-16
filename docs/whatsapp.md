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
  - `tarea: <qué hacer> — <detalle>` → Tarea del mundo Notas (también
    `task:`/`pendiente:`). Hereda los defaults de la tabla (prioridad media,
    semana actual, categoría trabajo, sin hacer); `#etiquetas` salen del texto.
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
- Con caption en **lenguaje natural** que pide Momentos —«subir a momentos»,
  «a momentos», «guardar en momentos», o el escueto «momentos»— → también
  **Momento foto**. `mediaRoute()` (`_lib/whatsapp/media.ts`) detecta la
  intención con `isMomentoCaption()` (acentos foldeados, regex anclada al
  caption completo para no confundir un pie descriptivo que solo mencione la
  palabra, p. ej. «momentos felices del viaje» → sigue siendo Recorte). El
  prefijo explícito (`recorte:`/`cita:`/…) siempre gana primero.
- Con caption `cita:` → **visión/OCR**: el LLM extrae cita + autor de la foto
  (página de libro, pantalla) y se guarda una **Cita**.
- Con caption `nota:` / `texto:` / `ocr:` → **visión/OCR**: transcribe el texto
  visible y guarda una **Nota**.
- Varias imágenes en un mensaje → una fila por imagen para Recortes/visión (la
  última queda como "deshacer"). **Excepción**: en la ruta **Momento** (prefijo
  `momento:` o lenguaje natural «a momentos»), todas las fotos del mismo mensaje
  se agrupan en **un solo Momento foto** (un "episodio", `payload.items[]`), no
  en N momentos sueltos — `deshacer` quita el episodio completo.

**Visión (cita:/nota:/texto:/ocr:).** Estas rutas pasan la imagen por
`askLLMForVision` (OpenAI/Gemini, mismos guards que `extract-from-image`:
`checkMonthlyBudget` + `resolveAIInvocation('extract-image')`). El prompt y el
validador son puros (`_lib/whatsapp/vision.ts`): `quote` exige texto **y** autor
(si falta autor, cae a Nota — nunca pedimos autor por una foto); `text`
transcribe. Si la IA está off, sin presupuesto o falla, **se cae a guardar la
imagen como Recorte** (nunca se pierde lo enviado) y se avisa. Emite
`whatsapp_vision` / `whatsapp_vision_failed`.

**Audio (notas de voz).** Si el adjunto es audio (`audio/ogg` opus de WhatsApp,
mp3, m4a, etc. — los formatos que acepta Whisper; `amr`/`3gpp` quedan fuera y se
avisa), se **transcribe** y se guarda como **Nota**. El audio original se
**conserva** como anexo de esa nota (`notas_attachments`, store
`notas-attachments`, vía `persistVoiceNoteAttachment`), así se puede
**re-escuchar** desde la tarjeta (la nota trae `hasAudio`, espejo de `hasImages`,
y `NoteCard` monta un reproductor `AttachmentAudio`). La transcripción es
**OpenAI-only** (Whisper, `/audio/transcriptions`): `askLLMForTranscription`
(`_lib/llm/`) resuelve la key de OpenAI (con fallback a `AI_API_KEY`); si no hay
key, sin presupuesto (`checkMonthlyBudget`) o la transcripción falla, **no se
inventa nada**: se avisa que no se pudo transcribir. El costo (Whisper cobra por
minuto, estimado del tamaño) se registra en `extraction_log` para que el
cost-cap mensual lo cuente. Helper puro `_lib/whatsapp/transcribe.ts`
(`transcriptionToIntent`). Emite `whatsapp_transcription` /
`whatsapp_transcription_failed`. **Video** todavía se reconoce y se avisa (su
persistencia es el próximo incremento).

Las URLs de media de Twilio son privadas: se bajan con auth básica
(`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`), validando que el host sea de
Twilio (guard SSRF) antes de seguir. `_lib/whatsapp/media.ts` (parse, guard,
download, routing) + `media-store.ts` (subida a Blobs) + `persist-media.ts`
(inserts).

**Límites (robustez):** solo se aceptan imágenes `image/jpeg|png|webp|gif`
(otro formato → aviso "mandá JPG/PNG/WEBP/GIF"); el tope de tamaño es
`MAX_MEDIA_BYTES` = 16 MB, chequeado por `Content-Length` (corta sin transferir)
y revalidado contra el buffer real. Pasarse → aviso "imagen muy pesada". No hay
rate-limit por IP/número a propósito (regla de `AGENTS.md`: el cost-cap mensual
del LLM es el límite). El camino de media **por defecto** (Recorte/Momento) no
llama al LLM, así que no consume presupuesto; las **rutas de visión**
(`cita:`/`nota:`/`texto:`/`ocr:`) sí invocan al LLM y respetan los mismos guards
de presupuesto (`checkMonthlyBudget` + `resolveAIInvocation`).

**Resiliencia de descarga:** `downloadTwilioMedia` tiene timeout por intento
(`TWILIO_FETCH_TIMEOUT_MS` = 15 s vía `AbortController`) y reintenta con backoff
(3 intentos) SOLO en fallas transitorias (red, timeout, 5xx, 429). Los 4xx y
`MEDIA_TOO_LARGE` son permanentes y cortan sin reintentar. Cada reintento emite
`whatsapp_media_retry` (observabilidad); el fallo final emite
`whatsapp_media_failed`.

## Recall — "preguntale a tu Trama"

`buscar: <tema>` o `? <pregunta>` consultan tu segundo cerebro desde WhatsApp
(el puente deja de ser solo-escritura). El webhook arma contexto con
`buildRagContext` (entidades + citas + relaciones, retrieval semántico + HyDE) y:

- con IA disponible → compone una respuesta breve con `askLLMForText` anclada
  **solo** en ese contexto (prompt anti-alucinación) + deep links;
- sin IA (off / sin presupuesto / falla) → lista los mejores resultados con
  deep links, sin LLM.

Prompt y formateadores puros en `_lib/whatsapp/recall.ts`. Es de solo lectura
(va antes del claim de idempotencia; las llamadas LLM están cacheadas, así que
un reintento de Twilio no re-cobra). Cubre entidades y citas (lo que indexa el
RAG hoy); notas/momentos quedan para cuando el RAG los incluya. Observabilidad:
`whatsapp_recall` / `whatsapp_recall_failed`.

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
`20260614030000_whatsapp_media_source`).

En la UI, `<WhatsAppSourceTag>` (`src/components/WhatsAppSourceTag.tsx`) pinta
un iconito discreto de burbuja (tooltip "Capturado desde WhatsApp") cuando el
ítem viene de ese medio. Acepta `origin` o `source`, así que se reusa en
cualquier card. Ya está cableado en Citas (`QuoteItem`), Entidades (`EntityRow`)
y Momentos (`MomentoEntry`); notas y recortes lo mostrarán cuando sus transforms
de `src/api/` expongan la columna `source` al cliente (pendiente). Un filtro por
procedencia en las vistas es el siguiente paso.

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

## Contrato de esquema (tests de integración)

Los tests del webhook mockean SQL, así que no ven si una columna referenciada
falta en el esquema real — eso rompió producción una vez (`whatsapp_links.label`,
PR #208). `scripts/check-whatsapp-schema.mjs` (`npm run check:whatsapp-schema`)
conecta a la DB **migrada de verdad** (vía `pg`) y verifica que cada columna que
el código de WhatsApp toca exista. Corre en el job `migrations` de CI (después
de aplicar migraciones) y localmente con `npm run db:up` levantado. Si agregás
una columna al flujo, sumala a `REQUIRED` en el script Y creá su migración.

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

| Var                                  | Para qué                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TWILIO_AUTH_TOKEN`                  | Verificar la firma de los webhooks entrantes (consola Twilio).                                                                                    |
| `TWILIO_ACCOUNT_SID`                 | Bajar la media entrante (fotos) de la URL privada de Twilio vía auth básica. Sin él, las imágenes no se procesan.                                 |
| `TWILIO_WEBHOOK_URL`                 | Opcional. URL exacta configurada en Twilio si difiere del proxy.                                                                                  |
| `VITE_WHATSAPP_NUMBER`               | Número del bot (E164). Habilita el QR + botón "Abrir WhatsApp". Público (va al cliente). Sin él, el panel cae a copiar/pegar `vincular <código>`. |
| `TWILIO_CONTENT_SID_CAPTURE`         | Opcional. `ContentSid` de la plantilla con botón **[Deshacer]** (ver "Botones interactivos").                                                     |
| `TWILIO_CONTENT_SID_CAPTURE_DESTINO` | Opcional. `ContentSid` de la plantilla con botones **[Deshacer · Momento · Nota]** para capturas ambiguas.                                        |

## Botones interactivos (opt-in)

Por defecto el webhook contesta con **TwiML** (texto + media; sin botones). Para
mostrar **botones de respuesta rápida** —**Deshacer** en cada captura, y
**Momento / Nota** cuando la captura fue ambigua (texto libre clasificado por la
IA)— hay que mandar un mensaje **saliente** con un _Content Template_ de Twilio,
porque TwiML no soporta botones. Es **opt-in con degradación elegante**: si las
plantillas no están configuradas, todo sigue como texto.

Setup:

1. En la consola de Twilio → **Messaging → Content Template Builder**, crear dos
   plantillas tipo **Quick Reply**, ambas con el cuerpo variable `{{1}}`:
   - una con un botón cuyo **título sea exactamente `Deshacer`**;
   - otra con tres botones: **`Deshacer`, `Momento`, `Nota`**.
2. Copiar el `ContentSid` (`HX…`) de cada una a `TWILIO_CONTENT_SID_CAPTURE` y
   `TWILIO_CONTENT_SID_CAPTURE_DESTINO` en Netlify, y **redeploy**.

Por qué esos títulos: cuando el usuario toca un botón, Twilio reenvía el título
como un mensaje entrante normal, así `Deshacer` cae en el camino de `deshacer`
(undo) y `Momento`/`Nota` en la **reclasificación** de la última captura —sin
agregar un parser nuevo—. El envío saliente reusa `TWILIO_ACCOUNT_SID` +
`TWILIO_AUTH_TOKEN`; vive en `_lib/whatsapp/send.ts` (REST) + `interactive.ts`
(elección de plantilla, puro). Si el envío falla, se cae a TwiML de texto: el
usuario nunca se queda sin confirmación. Cada mensaje interactivo es un mensaje
de WhatsApp facturado por Twilio/Meta (el cost-cap de Trama es solo de IA).

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
