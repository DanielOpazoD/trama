import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { setCurrentRlsUser, runWithSystemRls } from './_lib/user-rls.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { resolveAIInvocation } from './_lib/ai-mode.js'
import {
  askLLMForJson,
  askLLMForVision,
  askLLMForText,
  askLLMForTranscription,
} from './_lib/llm.js'
import { buildRagContext } from './_lib/rag-context.js'
import { validateTwilioSignature } from './_lib/whatsapp/twilio-signature.js'
import { normalizePhone } from './_lib/whatsapp/phone.js'
import { parseInboundMessage } from './_lib/whatsapp/parse-command.js'
import { normalizeLinkCode } from './_lib/whatsapp/link-code.js'
import { buildClassifyPrompt, validateClassification } from './_lib/whatsapp/interpret.js'
import { persistCapture } from './_lib/whatsapp/persist.js'
import {
  persistImageRecorte,
  persistImageRecorteEvent,
  persistImageMomentoEpisode,
  persistVoiceNoteAttachment,
} from './_lib/whatsapp/persist-media.js'
import {
  parseInboundMedia,
  mediaCategory,
  mediaRoute,
  isVisionRoute,
  downloadTwilioMedia,
  isAllowedImageMime,
  isTranscribableAudioMime,
  audioExtFromMime,
  MEDIA_TOO_LARGE,
} from './_lib/whatsapp/media.js'
import { buildPhotoPrompt, validatePhotoExtraction } from './_lib/whatsapp/vision.js'
import type { PhotoMode } from './_lib/whatsapp/vision.js'
import { transcriptionToIntent } from './_lib/whatsapp/transcribe.js'
import { formatStatus } from './_lib/whatsapp/status.js'
import {
  buildRecallPrompt,
  formatRecallAnswer,
  formatRecallFallback,
  recallHasResults,
} from './_lib/whatsapp/recall.js'
import { storeMedia } from './_lib/whatsapp/media-store.js'
import {
  reclassifyRecorteToMomento,
  reclassifyRecorteToNote,
} from './_lib/whatsapp/reclassify-media.js'
import {
  readRecentMediaCapture,
  appendImagesToMomento,
  appendImagesToRecorteEvent,
} from './_lib/whatsapp/album.js'
import { copyRecorteImageToStore, removeBlob } from './_lib/recorte-to-momento.js'
import {
  setAwaitingDescription,
  consumeAwaitingDescription,
  applyDescription,
} from './_lib/whatsapp/description.js'
import { persistWhatsAppEvent } from './_lib/whatsapp/events.js'
import { captureDeepLink } from './_lib/whatsapp/deep-link.js'
import { twimlResponse, emptyTwimlResponse } from './_lib/whatsapp/twiml.js'
import {
  readInteractiveConfig,
  pickCaptureContentSid,
  captureContentVariables,
  type CaptureReplyVariant,
} from './_lib/whatsapp/interactive.js'
import { sendWhatsAppContent } from './_lib/whatsapp/send.js'
import type { CaptureIntent, CaptureKind } from './_lib/whatsapp/types.js'

/**
 * Webhook entrante de WhatsApp vía Twilio. Captura rápida desde el bolsillo:
 * un mensaje se convierte en nota, cita, entidad o momento.
 *
 * Auth: NO usa Clerk ni PAT. Es un endpoint público que Twilio firma con
 * `X-Twilio-Signature` (HMAC con el Auth Token). Resolvemos el usuario por el
 * número del remitente (whatsapp_links). Sin firma válida → 401.
 *
 * Interpretación HÍBRIDA: si el mensaje trae prefijo (`nota:`, `cita:`,
 * `entidad:`, `momento:`) se respeta sin gastar tokens; si es texto libre, un
 * LLM lo clasifica (con el cost-cap mensual del usuario). Responde con TwiML
 * (XML) que Twilio entrega como respuesta — sin llamadas salientes.
 */

function readEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
}

/**
 * Responde la confirmación de una captura. Si hay plantillas de Content API
 * configuradas (env vars) y credenciales de Twilio, manda un mensaje SALIENTE
 * con botones (Deshacer; y Momento/Nota cuando la captura fue ambigua) y
 * contesta TwiML vacío. Si no, o si el envío falla, cae a la respuesta de texto
 * de siempre con la afordancia "responde deshacer". `body` NO debe incluir la
 * línea de deshacer: la agrega acá el camino de TwiML (en botones, sobra).
 */
async function replyWithCapture(
  params: Record<string, string>,
  body: string,
  variant: CaptureReplyVariant,
): Promise<Response> {
  const contentSid = pickCaptureContentSid(readInteractiveConfig(), variant)
  const accountSid = readEnv('TWILIO_ACCOUNT_SID')
  const authToken = readEnv('TWILIO_AUTH_TOKEN')
  const from = params.To ?? params.to // número del bot (whatsapp:+…)
  const to = params.From ?? params.from // número del usuario
  if (contentSid && accountSid && authToken && from && to) {
    const ok = await sendWhatsAppContent({
      accountSid,
      authToken,
      from,
      to,
      contentSid,
      contentVariables: captureContentVariables(body),
    })
    if (ok) {
      logEvent({ event: 'whatsapp_interactive_sent', variant })
      return emptyTwimlResponse()
    }
  }
  const fix =
    variant === 'foto'
      ? '↩️ Respondé con una descripción, o «deshacer» · «momento» · «nota».'
      : variant === 'ambiguous'
        ? '↩️ ¿No era así? Responde «deshacer», o reclasifícalo: nota · momento · entidad.'
        : '↩️ ¿No era así? Responde «deshacer».'
  return twimlResponse(`${body}\n${fix}`)
}

/**
 * Comando/botón [Descripción]: describe la última foto del número. Con texto en
 * el mismo mensaje («descripción una tarde») lo aplica directo; sin texto (el
 * botón solo manda "Descripción") deja el estado conversacional y pide el texto
 * — que el siguiente mensaje libre consume (flujo de PR3).
 */
async function describeLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  text: string,
  origin: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last || (last.kind !== 'recorte' && last.kind !== 'momento')) {
    return 'No hay ninguna foto reciente para describir. Mandá una foto y después su descripción.'
  }
  if (text.trim()) {
    const ok = await applyDescription(sql, userId, last.kind, last.id, text)
    if (!ok) return 'No pude agregar la descripción (¿la borraste desde la app?).'
    return `✍️ Descripción agregada.\n🔗 Ábrelo en Trama: ${captureDeepLink(origin, last.kind)}`
  }
  await setAwaitingDescription(sql, phone, userId, last.kind, last.id)
  return '✍️ Perfecto, mandame la descripción y se la agrego.'
}

/**
 * Menú interactivo (list picker de acciones frecuentes) si está configurado
 * `TWILIO_CONTENT_SID_MENU`; si no, el texto de ayuda de siempre. Cada fila de la
 * lista (en Twilio) tiene por título un comando que el parser ya entiende
 * (Estado, Ayuda, Buscar…), así el toque vuelve como ese comando.
 */
async function replyWithMenu(params: Record<string, string>): Promise<Response> {
  const { menuSid } = readInteractiveConfig()
  const accountSid = readEnv('TWILIO_ACCOUNT_SID')
  const authToken = readEnv('TWILIO_AUTH_TOKEN')
  const from = params.To ?? params.to
  const to = params.From ?? params.from
  if (menuSid && accountSid && authToken && from && to) {
    const ok = await sendWhatsAppContent({
      accountSid,
      authToken,
      from,
      to,
      contentSid: menuSid,
      contentVariables: captureContentVariables('¿Qué querés hacer?'),
    })
    if (ok) {
      logEvent({ event: 'whatsapp_interactive_sent', variant: 'menu' })
      return emptyTwimlResponse()
    }
  }
  return twimlResponse(HELP)
}

const HELP = [
  'Trama 📚 — tu segundo cerebro, ahora desde WhatsApp.',
  '',
  'Captura al instante:',
  '• nota: <texto>',
  '• cita: <frase> — <autor>',
  '• entidad: <nombre> (tipo)',
  '• momento: <qué pasó>',
  '• tarea: <qué hacer> — <detalle>',
  'O escribe libremente y yo lo clasifico por ti.',
  '',
  '📷 Fotos: la imagen va a Recortes. Con «cita:» o «nota:» leo el texto (OCR).',
  '🎤 Notas de voz: las transcribo y las guardo como Nota.',
  '🔎 Pregunta: «buscar: <tema>» o «? <pregunta>» para consultar tu Trama.',
  '',
  'Después de guardar puedes responder:',
  '• «título <texto>» para nombrarlo',
  '• «etiqueta <palabras>» para clasificarlo',
  '• «nota», «momento» o «entidad» para reclasificarlo',
  '',
  'Atajos: «deshacer» revierte lo último · «estado» muestra tu resumen.',
].join('\n')

const NOT_LINKED = [
  'Tu número todavía no está conectado a Trama.',
  'Abre Trama → Configuración → WhatsApp, genera un código y envíalo así:',
  'vincular ABC123',
].join('\n')

/** Bienvenida tras conectar: confirma + invita a probar (onboarding). */
function welcomeMessage(label?: string): string {
  const head = label
    ? `✅ ¡Listo! Conecté este dispositivo como «${label}».`
    : '✅ ¡Listo! Tu número quedó conectado a Trama.'
  return [
    head,
    '',
    'Pruébalo ahora mismo:',
    '• nota: comprar pan',
    '• cita: el tiempo es relativo — Einstein',
    '• momento: hoy empecé algo nuevo',
    '',
    'Escribe «ayuda» cuando quieras ver todo lo que puedo hacer.',
  ].join('\n')
}

/** Resuelve el dueño del número (bypass de RLS: aún no hay usuario en contexto). */
async function resolveUserByPhone(phone: string): Promise<string | null> {
  return runWithSystemRls(async () => {
    const sql = getSql()
    const rows = await sqlTyped<{ user_id: string }>(sql`
      SELECT user_id FROM whatsapp_links
      WHERE phone_e164 = ${phone} AND verified_at IS NOT NULL AND deleted_at IS NULL
      LIMIT 1
    `)
    return rows[0]?.user_id ?? null
  })
}

/** Canjea un código pendiente y lo ata al número, en un CTE atómico. La
 *  etiqueta opcional nombra el dispositivo (multidispositivo). */
async function redeemLinkCode(
  phone: string,
  code: string,
  label?: string,
): Promise<boolean> {
  return runWithSystemRls(async () => {
    const sql = getSql()
    const rows = await sqlTyped<{ id: string }>(sql`
      WITH pending AS (
        SELECT id FROM whatsapp_links
        WHERE link_code = ${code} AND deleted_at IS NULL AND verified_at IS NULL
          AND link_code_expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      ),
      release_existing AS (
        UPDATE whatsapp_links
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE phone_e164 = ${phone} AND deleted_at IS NULL
          AND id <> (SELECT id FROM pending)
          AND EXISTS (SELECT 1 FROM pending)
        RETURNING 1
      )
      UPDATE whatsapp_links
      SET phone_e164 = ${phone},
          verified_at = NOW(),
          link_code = NULL,
          link_code_expires_at = NULL,
          label = COALESCE(${label ?? null}, label),
          updated_at = NOW()
      WHERE id = (SELECT id FROM pending)
      RETURNING id
    `)
    return rows.length > 0
  })
}

/**
 * Reclama un MessageSid como procesado (idempotencia). INSERT ... ON CONFLICT
 * DO NOTHING: si ya estaba, devuelve false y el webhook corta sin re-escribir
 * — así un reintento de Twilio (por latencia/5xx) no duplica la captura ni
 * vuelve a pagar el LLM. Corre bajo el RLS del dueño (ya seteado).
 */
async function claimInboundMessage(
  sql: ReturnType<typeof getSql>,
  messageSid: string,
  userId: string,
): Promise<boolean> {
  const rows = await sqlTyped<{ message_sid: string }>(sql`
    INSERT INTO whatsapp_processed_messages (message_sid, user_id)
    VALUES (${messageSid}, ${userId})
    ON CONFLICT (message_sid) DO NOTHING
    RETURNING message_sid
  `)
  return rows.length > 0
}

/** Sustantivo legible por kind, para las confirmaciones. */
const NOUN_BY_KIND: Record<string, string> = {
  note: 'La nota',
  quote: 'La cita',
  entity: 'La entidad',
  momento: 'El momento',
  recorte: 'El recorte',
  task: 'La tarea',
}

/** Soft-delete de la última captura según su kind. Devuelve si borró algo. */
async function softDeleteCapture(
  sql: ReturnType<typeof getSql>,
  userId: string,
  kind: string,
  id: string,
): Promise<boolean> {
  const del = (q: Promise<unknown>) => sqlTyped<{ id: string }>(q)
  let rows: { id: string }[] = []
  if (kind === 'note') {
    rows = await del(sql`UPDATE notes SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'momento') {
    rows = await del(sql`UPDATE momentos SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'entity') {
    rows = await del(sql`UPDATE entities SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'quote') {
    rows = await del(sql`UPDATE quotes SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'recorte') {
    rows = await del(sql`UPDATE recortes SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'task') {
    rows = await del(sql`UPDATE tasks SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  }
  return rows.length > 0
}

/**
 * Deshace la última captura del número: lee last_capture_*, la soft-deletea y
 * limpia el puntero (naturalmente idempotente — un segundo "deshacer" ya no
 * encuentra nada). Corre bajo el RLS del dueño (ya seteado).
 */
async function undoLastCapture(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<string> {
  const rows = await sqlTyped<{ kind: string | null; cap_id: string | null }>(sql`
    SELECT last_capture_kind AS kind, last_capture_id AS cap_id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const last = rows[0]
  if (!last?.kind || !last.cap_id) {
    return 'No hay nada reciente para deshacer.'
  }
  const deleted = await softDeleteCapture(sql, userId, last.kind, last.cap_id)
  sql`
    UPDATE whatsapp_links
    SET last_capture_kind = NULL, last_capture_id = NULL, updated_at = NOW()
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
  `.catch(() => {})
  const noun = NOUN_BY_KIND[last.kind as CaptureKind] ?? 'La última captura'
  return deleted
    ? `↩️ Hecho. ${noun} se eliminó.`
    : 'Eso ya no estaba (quizá lo eliminaste desde la app).'
}

/**
 * Recuerda la última captura del número para que "deshacer" sepa qué borrar.
 * Se AWAITea (no fire-and-forget): en serverless la función puede terminar
 * antes de que una promesa suelta complete su escritura, y si eso pasa el
 * "deshacer" del usuario apuntaría a la captura anterior (o a nada). Es
 * best-effort igual: si el UPDATE falla, "deshacer" simplemente no tendrá
 * target, pero la captura ya quedó guardada.
 */
async function recordLastCapture(
  sql: ReturnType<typeof getSql>,
  phone: string,
  userId: string,
  kind: string,
  id: string,
): Promise<void> {
  try {
    await sql`
      UPDATE whatsapp_links
      SET last_capture_kind = ${kind}, last_capture_id = ${id}::uuid,
          last_capture_at = NOW(), updated_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `
  } catch {
    // best-effort: si falla, "deshacer" no tendrá target pero la captura quedó.
  }
}

/** Puntero a la última captura del número (kind + id), o null. */
async function readLastPointer(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<{ kind: string; id: string } | null> {
  const rows = await sqlTyped<{ kind: string | null; cap_id: string | null }>(sql`
    SELECT last_capture_kind AS kind, last_capture_id AS cap_id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const r = rows[0]
  return r?.kind && r.cap_id ? { kind: r.kind, id: r.cap_id } : null
}

/** Lee el texto fuente de una captura para poder reclasificarla. */
async function readCaptureText(
  sql: ReturnType<typeof getSql>,
  kind: string,
  id: string,
  userId: string,
): Promise<string | null> {
  const one = (q: Promise<unknown>) => sqlTyped<{ t: string | null }>(q)
  let rows: { t: string | null }[] = []
  if (kind === 'note') {
    rows = await one(sql`SELECT content AS t FROM notes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'momento') {
    rows = await one(sql`SELECT payload->>'bodyText' AS t FROM momentos
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'entity') {
    rows = await one(sql`SELECT name AS t FROM entities
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'quote') {
    rows = await one(sql`SELECT text AS t FROM quotes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'recorte') {
    rows = await one(sql`SELECT text AS t FROM recortes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  }
  const t = rows[0]?.t
  return t && t.trim() ? t.trim() : null
}

/** "trabajo, ideas" / "#a #b" → ['trabajo','ideas'] (sin #, sin vacíos, máx 10). */
function parseInlineTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]+|\s+/)
        .map((t) => t.trim().replace(/^#/, '').slice(0, 40))
        .filter((t) => t.length > 0),
    ),
  ].slice(0, 10)
}

/** Comando `título <texto>`: nombra la última captura (notas/entidades). */
async function retitleLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  title: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para titular.'
  const clean = title.trim().slice(0, 200)
  let rows: { id: string }[] = []
  if (last.kind === 'note') {
    rows = await sqlTyped<{
      id: string
    }>(sql`UPDATE notes SET title = ${clean}, updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'entity') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE entities SET name = ${clean}
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else {
    return 'Ese tipo de captura no lleva título. Puedes ajustarlo desde la app.'
  }
  return rows.length
    ? `🏷️ Título actualizado: «${clean}».`
    : 'No encontré esa captura (quizá la eliminaste desde la app).'
}

/** Comando `etiqueta <palabras>`: agrega tags (dedup) a la última captura. */
async function tagLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  tagsRaw: string,
): Promise<string> {
  const tags = parseInlineTags(tagsRaw)
  if (tags.length === 0) {
    return 'Dime qué etiquetas agregar. Por ejemplo: etiqueta trabajo, ideas'
  }
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para etiquetar.'
  let rows: { id: string }[] = []
  if (last.kind === 'note') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE notes
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[])), updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'quote') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE quotes
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[]))
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'entity') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE entities
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[]))
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'momento') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE momentos
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[])), updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else {
    return 'Ese tipo de captura todavía no admite etiquetas por aquí.'
  }
  return rows.length
    ? `🏷️ Etiquetas agregadas: ${tags.join(', ')}.`
    : 'No encontré esa captura (quizá la eliminaste desde la app).'
}

/** Comando de reclasificación (palabra suelta): re-archiva la última captura
 *  como otro tipo reusando su texto fuente. */
async function recategorizeLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  toKind: 'note' | 'momento' | 'entity',
  origin: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para reclasificar.'
  if (last.kind === toKind) {
    return `Eso ya está guardado como ${NOUN_BY_KIND[toKind] ?? 'esa categoría'}.`
  }

  // Reclasificación NO destructiva de un recorte CON imágenes: copiamos las
  // fotos al destino (Momento foto episódico o Nota con adjuntos) en vez de
  // arrastrar solo el texto. Si el recorte no tiene imágenes (texto/enlace), el
  // helper devuelve null y caemos al camino de texto de abajo.
  if (last.kind === 'recorte' && (toKind === 'momento' || toKind === 'note')) {
    const caption = (await readCaptureText(sql, 'recorte', last.id, userId)) ?? ''
    const result =
      toKind === 'momento'
        ? await reclassifyRecorteToMomento(sql, userId, last.id, caption)
        : await reclassifyRecorteToNote(sql, userId, last.id, caption)
    if (result.status === 'ok') {
      // El destino quedó con TODAS las imágenes: recién ahora borramos el recorte.
      await softDeleteCapture(sql, userId, last.kind, last.id)
      await recordLastCapture(sql, phone, userId, toKind, result.id)
      const link = captureDeepLink(origin, toKind)
      const msg =
        toKind === 'momento'
          ? '🔄 Reclasificado como Momento con sus imágenes.'
          : '🔄 Reclasificado como Nota con sus imágenes.'
      return `${msg}\n🔗 Ábrelo en Trama: ${link}\n↩️ ¿No era así? Responde «deshacer».`
    }
    if (result.status === 'failed') {
      // La copia falló a medias: el recorte sigue intacto con sus fotos, no lo
      // borramos. No caemos al camino de texto (perdería las imágenes).
      return 'No pude mover las imágenes ahora mismo. Tu recorte sigue en Recortes con sus fotos; vuelve a intentarlo en un momento.'
    }
    // result.status === 'no-images' → recorte de texto/enlace: sigue al camino
    // de texto de abajo (ahí sí reusar el texto es correcto).
  }

  const text = await readCaptureText(sql, last.kind, last.id, userId)
  if (!text) {
    return 'No pude leer esa captura para reclasificarla. Puedes recrearla con el prefijo correcto.'
  }
  const intent: CaptureIntent =
    toKind === 'note'
      ? { kind: 'note', content: text }
      : toKind === 'momento'
        ? { kind: 'momento', bodyText: text }
        : { kind: 'entity', name: text, entityType: 'concepto', description: null }
  const { message, id } = await persistCapture(sql, userId, intent)
  if (!id) return 'No pude reclasificarla en este momento. Vuelve a intentarlo.'
  await softDeleteCapture(sql, userId, last.kind, last.id)
  await recordLastCapture(sql, phone, userId, intent.kind, id)
  const link = captureDeepLink(origin, intent.kind)
  return `🔄 Reclasificado. ${message}\n🔗 Ábrelo en Trama: ${link}\n↩️ ¿No era así? Responde «deshacer».`
}

/**
 * Procesa los adjuntos de un mensaje. Hoy solo imágenes: las baja de Twilio,
 * las sube al store y crea Recorte (default) o Momento foto (caption
 * `momento:`). Audio/video se reconocen y se avisan (próximo incremento).
 * Devuelve el texto de confirmación.
 */
/**
 * Pasa una imagen por el LLM de visión y devuelve la `CaptureIntent` extraída
 * (cita o nota), o `null` si no se puede usar IA (off / sin presupuesto / falla
 * del modelo) para que el caller caiga a guardar la imagen como Recorte.
 */
async function extractPhotoIntent(
  req: Request,
  userId: string,
  requestId: string,
  buffer: ArrayBuffer,
  mimeType: string,
  mode: PhotoMode,
  caption: string,
): Promise<CaptureIntent | null> {
  const overBudget = await checkMonthlyBudget(userId, requestId)
  if (overBudget) return null
  const invocation = await resolveAIInvocation(req, 'extract-image', userId)
  if (invocation.kind === 'off') return null
  try {
    const { system, user } = buildPhotoPrompt(mode)
    const imageBase64 = Buffer.from(buffer).toString('base64')
    const { content } = await askLLMForVision(system, user, imageBase64, mimeType, {
      provider: invocation.provider,
      model: invocation.model,
    })
    return validatePhotoExtraction(content, mode, caption)
  } catch (err) {
    logEvent({
      event: 'whatsapp_vision_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Transcribe una nota de voz a texto (Whisper) y la convierte en una Nota.
 * Devuelve `null` si no se puede transcribir —sin presupuesto, sin key de
 * OpenAI, o falla del modelo— para que el caller avise. Registra el costo
 * estimado en `extraction_log` para que el cost-cap mensual lo cuente.
 */
async function transcribeAudioIntent(
  userId: string,
  requestId: string,
  sql: ReturnType<typeof getSql>,
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<CaptureIntent | null> {
  const overBudget = await checkMonthlyBudget(userId, requestId)
  if (overBudget) return null
  try {
    const fileName = `voz.${audioExtFromMime(mimeType)}`
    const { text, usage } = await askLLMForTranscription(buffer, mimeType, fileName)
    // Registro best-effort del costo (Whisper cobra por minuto, estimado).
    sql`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${'[nota de voz]'}, ${JSON.stringify({ transcribed: true })}::jsonb, ${usage.provider}, ${usage.model}, ${0}, ${0}, ${usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    logEvent({ event: 'whatsapp_transcription', chars: text.trim().length })
    return transcriptionToIntent(text)
  } catch (err) {
    logEvent({
      event: 'whatsapp_transcription_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function handleInboundMedia(
  req: Request,
  requestId: string,
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  params: Record<string, string>,
  media: ReturnType<typeof parseInboundMedia>,
  origin: string,
): Promise<{
  message: string
  saved: number
  offerDestino: boolean
  offerDescription: boolean
}> {
  const accountSid = readEnv('TWILIO_ACCOUNT_SID')
  const authToken = readEnv('TWILIO_AUTH_TOKEN')
  const { route, caption } = mediaRoute(params.Body ?? params.body ?? '')
  let saved = 0
  let lastId: string | null = null
  let lastKind = ''
  const skipped = new Set<string>()
  // Fotos del route 'momento': se acumulan y se persisten como UN solo momento
  // foto (episodio) tras el loop, en vez de N momentos sueltos.
  const momentoKeys: string[] = []
  // Imágenes del route 'recorte' (default): se acumulan y, si son 2+, se
  // guardan como UN recorte-evento (varias imágenes en una entrada).
  const recorteKeys: Array<{ key: string; mime: string }> = []

  for (const item of media) {
    const cat = mediaCategory(item.contentType)

    // Audio → nota de voz: se baja y se transcribe (Whisper) a una Nota.
    if (cat === 'audio') {
      if (!isTranscribableAudioMime(item.contentType)) {
        skipped.add('audio_format')
        continue
      }
      if (!accountSid || !authToken) {
        skipped.add('config')
        continue
      }
      try {
        const { buffer, contentType } = await downloadTwilioMedia(
          item.url,
          accountSid,
          authToken,
          {
            onRetry: (attempt, reason) =>
              logEvent({ event: 'whatsapp_media_retry', attempt, reason }),
          },
        )
        const intent = await transcribeAudioIntent(
          userId,
          requestId,
          sql,
          buffer,
          contentType || item.contentType,
        )
        if (intent) {
          const r = await persistCapture(sql, userId, intent)
          // Conservamos el audio como anexo de la nota para poder re-escucharlo.
          // Best-effort: si falla, la nota transcrita ya quedó guardada.
          if (r.id) {
            try {
              await persistVoiceNoteAttachment(
                sql,
                userId,
                r.id,
                buffer,
                contentType || item.contentType,
              )
            } catch (audioErr) {
              logEvent({
                event: 'whatsapp_voice_audio_failed',
                message: audioErr instanceof Error ? audioErr.message : String(audioErr),
              })
            }
          }
          lastId = r.id
          lastKind = intent.kind
          saved += 1
          continue
        }
        skipped.add('audio_ai')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        skipped.add(msg === MEDIA_TOO_LARGE ? 'toolarge' : 'error')
        logEvent({ event: 'whatsapp_media_failed', message: msg })
      }
      continue
    }

    if (cat !== 'image') {
      skipped.add(cat)
      continue
    }
    if (!isAllowedImageMime(item.contentType)) {
      skipped.add('format')
      continue
    }
    if (!accountSid || !authToken) {
      skipped.add('config')
      continue
    }
    try {
      const { buffer, contentType } = await downloadTwilioMedia(
        item.url,
        accountSid,
        authToken,
        {
          onRetry: (attempt, reason) =>
            logEvent({ event: 'whatsapp_media_retry', attempt, reason }),
        },
      )

      // Rutas de visión (cita:/nota:/texto:/ocr:): la imagen pasa por el LLM
      // de visión y se persiste lo EXTRAÍDO (cita o nota). Si la IA está off,
      // sin presupuesto o falla, caemos a guardar la imagen como Recorte —
      // nunca se pierde lo que mandó el usuario.
      if (isVisionRoute(route)) {
        const mode: PhotoMode = route === 'quote' ? 'quote' : 'text'
        const intent = await extractPhotoIntent(
          req,
          userId,
          requestId,
          buffer,
          contentType,
          mode,
          caption,
        )
        if (intent) {
          const r = await persistCapture(sql, userId, intent)
          lastId = r.id
          lastKind = intent.kind
          saved += 1
          logEvent({ event: 'whatsapp_vision', mode, kind: intent.kind })
          continue
        }
        skipped.add('vision')
        // fallback ↓ guarda la imagen como recorte
      }

      if (route === 'momento') {
        // No persistimos aún: juntamos las keys y creamos un solo episodio.
        const key = await storeMedia('momentos-media', userId, buffer, contentType)
        momentoKeys.push(key)
      } else {
        // Tampoco persistimos aún: juntamos las imágenes y, tras el loop,
        // creamos un recorte único (1 imagen) o un recorte-evento (2+).
        const key = await storeMedia('recortes-media', userId, buffer, contentType)
        recorteKeys.push({ key, mime: contentType })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skipped.add(msg === MEDIA_TOO_LARGE ? 'toolarge' : 'error')
      logEvent({ event: 'whatsapp_media_failed', message: msg })
    }
  }

  // --- Álbum partido: ¿esta foto continúa el álbum recién capturado? ----------
  // Si llegó media "cruda" (route momento/recorte) y el número tuvo una captura
  // de media hace pocos segundos, la anexamos a esa captura en vez de crear otra
  // — así las fotos que WhatsApp parte en mensajes separados comparten destino.
  // Las rutas de visión (cita:/nota:) NO continúan álbum (son intención por foto).
  let appendedTotal: number | null = null
  const newImageCount = momentoKeys.length + recorteKeys.length
  const isRawMediaRoute = route === 'momento' || route === 'recorte'
  if (newImageCount > 0 && isRawMediaRoute) {
    const recent = await readRecentMediaCapture(sql, userId, phone)
    if (recent) {
      try {
        if (route === 'momento') {
          // Fotos nuevas ya en momentos-media (momentoKeys).
          if (recent.kind === 'momento') {
            appendedTotal = await appendImagesToMomento(
              sql,
              userId,
              recent.id,
              momentoKeys,
            )
            if (appendedTotal !== null) {
              lastId = recent.id
              lastKind = 'momento'
            }
          } else {
            // El lote reciente era un recorte y esta foto dice "a momento":
            // subimos TODO el álbum a un momento (reclasificación) y anexamos.
            const res = await reclassifyRecorteToMomento(sql, userId, recent.id, '')
            if (res.status === 'ok') {
              await softDeleteCapture(sql, userId, 'recorte', recent.id)
              appendedTotal = await appendImagesToMomento(
                sql,
                userId,
                res.id,
                momentoKeys,
              )
              if (appendedTotal !== null) {
                lastId = res.id
                lastKind = 'momento'
              }
            }
          }
        } else {
          // route 'recorte' (sin caption de destino). Fotos en recortes-media.
          if (recent.kind === 'recorte') {
            appendedTotal = await appendImagesToRecorteEvent(
              sql,
              userId,
              recent.id,
              recorteKeys,
            )
            if (appendedTotal !== null) {
              lastId = recent.id
              lastKind = 'recorte'
            }
          } else {
            // El lote reciente era un momento: una foto sin caption se une a él.
            // Copiamos los blobs a momentos-media y limpiamos los de recortes.
            const copied: string[] = []
            for (const rk of recorteKeys) {
              const c = await copyRecorteImageToStore('momentos-media', rk.key, userId)
              if (c) {
                copied.push(c.storageKey)
                await removeBlob('recortes-media', rk.key)
              }
            }
            if (copied.length > 0) {
              appendedTotal = await appendImagesToMomento(sql, userId, recent.id, copied)
              if (appendedTotal !== null) {
                lastId = recent.id
                lastKind = 'momento'
              }
            }
          }
        }
      } catch (err) {
        logEvent({
          event: 'whatsapp_media_failed',
          message: err instanceof Error ? err.message : String(err),
        })
        appendedTotal = null
      }
      if (appendedTotal !== null) {
        saved += newImageCount
        // Anexado: vaciamos las keys para que NO se cree además una captura nueva.
        momentoKeys.length = 0
        recorteKeys.length = 0
        logEvent({
          event: 'whatsapp_album_append',
          kind: lastKind,
          count: newImageCount,
          total: appendedTotal,
        })
      }
    }
  }

  // Episodio foto: todas las fotos del route 'momento' en un solo momento.
  if (momentoKeys.length > 0) {
    try {
      const r = await persistImageMomentoEpisode(sql, userId, momentoKeys, caption)
      lastId = r.id
      lastKind = 'momento'
      saved += momentoKeys.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skipped.add('error')
      logEvent({ event: 'whatsapp_media_failed', message: msg })
    }
  }

  // Recorte: una imagen → un recorte; varias → un recorte-evento.
  if (recorteKeys.length > 0) {
    try {
      const r =
        recorteKeys.length === 1
          ? await persistImageRecorte(sql, userId, recorteKeys[0]!.key, caption)
          : await persistImageRecorteEvent(sql, userId, recorteKeys, caption)
      lastId = r.id
      lastKind = 'recorte'
      saved += recorteKeys.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skipped.add('error')
      logEvent({ event: 'whatsapp_media_failed', message: msg })
    }
  }

  if (saved > 0 && lastId) {
    await recordLastCapture(sql, phone, userId, lastKind, lastId)
    logEvent({ event: 'whatsapp_capture', kind: lastKind, media: true, count: saved })
  }

  // Si la foto quedó SIN pie, ofrecemos agregarle una descripción: el siguiente
  // texto libre del número se aplicará a ESTA captura (estado conversacional).
  // Solo cuando falta contexto (no preguntamos si ya vino un caption).
  const wantsDescription =
    saved > 0 &&
    !!lastId &&
    caption.trim() === '' &&
    (lastKind === 'recorte' || lastKind === 'momento')
  if (wantsDescription && lastId) {
    await setAwaitingDescription(sql, phone, userId, lastKind, lastId)
  }

  const DEST_BY_KIND: Record<string, string> = {
    momento: 'Momentos',
    recorte: 'Recortes',
    quote: 'Citas',
    note: 'Notas',
  }
  const lines: string[] = []
  if (saved > 0) {
    const dest = DEST_BY_KIND[lastKind] ?? 'Trama'
    if (appendedTotal !== null) {
      // Continuación de álbum: anexamos a la captura reciente (confirmación
      // suave, sin "guardado" de nuevo — es el mismo evento que crece).
      const noun = lastKind === 'momento' ? 'tu momento' : 'tu evento en Recortes'
      lines.push(
        newImageCount === 1
          ? `📸 +1 foto · ${noun} ahora tiene ${appendedTotal}.`
          : `📸 +${newImageCount} fotos · ${noun} ahora tiene ${appendedTotal}.`,
      )
    } else {
      // Eventos: varias fotos en un SOLO momento, o varias imágenes en un solo
      // recorte — no N elementos sueltos.
      const isPhotoEpisode =
        lastKind === 'momento' && momentoKeys.length > 1 && saved === momentoKeys.length
      const isRecorteEvent =
        lastKind === 'recorte' && recorteKeys.length > 1 && saved === recorteKeys.length
      lines.push(
        saved === 1
          ? `✅ Guardado en ${dest}.`
          : isPhotoEpisode
            ? `✅ ${saved} fotos guardadas en un momento.`
            : isRecorteEvent
              ? `✅ ${saved} imágenes guardadas como un evento en Recortes.`
              : `✅ ${saved} elementos guardados.`,
      )
    }
    if (skipped.has('vision')) {
      lines.push('(No pude leer el texto, así que guardé la imagen tal cual.)')
    }
    lines.push(`🔗 Ábrelo en Trama: ${captureDeepLink(origin, lastKind)}`)
    if (wantsDescription) {
      lines.push('✍️ Respondé con una descripción y se la agrego.')
    }
    // La afordancia de deshacer (botón o texto) la agrega el caller según haya
    // captura guardada (saved > 0) o no.
  }
  if (skipped.has('video')) {
    lines.push('🎬 El video todavía no lo proceso, pero muy pronto.')
  }
  if (skipped.has('audio_format')) {
    lines.push(
      '🎤 Ese formato de audio no lo puedo transcribir (mandá una nota de voz normal).',
    )
  }
  if (skipped.has('audio_ai')) {
    lines.push(
      '🎤 No pude transcribir la nota de voz ahora (quizá se agotó el presupuesto de IA).',
    )
  }
  if (skipped.has('format')) {
    lines.push('🖼️ Ese formato no lo soporto aún. Envía JPG, PNG, WEBP o GIF.')
  }
  if (skipped.has('toolarge')) {
    lines.push('📦 La imagen pesa demasiado (máximo 16 MB). Envíala más liviana.')
  }
  if (skipped.has('config')) {
    lines.push(
      'Para procesar imágenes falta configurar TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el servidor.',
    )
  }
  if (saved === 0 && skipped.has('error')) {
    lines.push('No pude descargar el archivo. Vuelve a intentarlo en un momento.')
  }
  if (lines.length === 0) lines.push('Recibí el archivo, pero no pude procesarlo.')
  // Una captura de imagen guardada como Recorte (default) puede redirigirse sin
  // pérdida a Momento o Nota con sus imágenes: ofrecemos esos botones de destino
  // (además de Deshacer). Las fotos que ya fueron a Momentos no necesitan botón.
  const offerDestino = saved > 0 && lastKind === 'recorte'
  // Observabilidad: un evento de captura por mensaje de media (ok si guardó algo;
  // si no, la razón). Best-effort — nunca tumba la captura.
  await persistWhatsAppEvent(sql, userId, {
    event: 'capture',
    kind: saved > 0 ? lastKind : null,
    ok: saved > 0,
    detail: saved > 0 ? null : [...skipped].join(',') || 'sin_resultado',
  })
  // Foto sin pie → ofrecemos el botón [Descripción] (dispara el flujo de PR3).
  return {
    message: lines.join('\n'),
    saved,
    offerDestino,
    offerDescription: wantsDescription,
  }
}

/**
 * Comando `estado`: lee el vínculo + un conteo de mensajes de este mes y arma
 * el resumen (formato puro en status.ts). Corre bajo el RLS del dueño.
 */
async function buildStatusReply(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<string> {
  const linkRows = await sqlTyped<{
    verified_at: string | null
    label: string | null
    last_capture_kind: string | null
    last_capture_at: string | null
  }>(sql`
    SELECT verified_at, label, last_capture_kind, last_capture_at
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const countRows = await sqlTyped<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM whatsapp_processed_messages
    WHERE user_id = ${userId} AND created_at >= date_trunc('month', NOW())
  `)
  const link = linkRows[0]
  return formatStatus({
    verifiedAt: link?.verified_at ?? null,
    deviceLabel: link?.label ?? null,
    lastCaptureKind: link?.last_capture_kind ?? null,
    lastCaptureAt: link?.last_capture_at ?? null,
    monthCount: countRows[0]?.n ?? 0,
  })
}

/**
 * Recall ("preguntale a tu Trama"): arma contexto con RAG (entidades + citas +
 * relaciones) y compone una respuesta anclada en lo que el usuario ya guardó.
 * Si la IA está off / sin presupuesto / falla, cae a un listado con deep links.
 * Corre bajo el RLS del dueño.
 */
async function handleQuery(
  req: Request,
  sql: ReturnType<typeof getSql>,
  userId: string,
  requestId: string,
  query: string,
  origin: string,
): Promise<string> {
  const overBudget = await checkMonthlyBudget(userId, requestId)
  const invocation = overBudget
    ? ({ kind: 'off' } as const)
    : await resolveAIInvocation(req, 'chat', userId)
  const aiOn = invocation.kind === 'ready'

  // HyDE solo si vamos a usar IA igual (sino agrega latencia/costo sin sentido).
  const ctx = await buildRagContext(sql, query, userId, {
    hyde: aiOn,
    requestId,
  })
  if (!recallHasResults(ctx)) {
    return 'Todavía no encontré nada sobre eso. Prueba con otras palabras o guarda algo nuevo y vuelve a preguntar.'
  }
  if (!aiOn) return formatRecallFallback(ctx, origin)
  try {
    const { content } = await askLLMForText(buildRecallPrompt(query, ctx), {
      provider: invocation.provider,
      model: invocation.model,
    })
    // askLLMForText tipa `content` como unknown (shape compartido con el modo
    // JSON); en modo texto es string. Si no lo es, caemos al listado.
    const answer = typeof content === 'string' ? content.trim() : ''
    if (!answer) return formatRecallFallback(ctx, origin)
    logEvent({ event: 'whatsapp_recall', usedRag: ctx.usedRag, usedHyde: ctx.usedHyde })
    return formatRecallAnswer(answer, ctx, origin)
  } catch (err) {
    logEvent({
      event: 'whatsapp_recall_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    return formatRecallFallback(ctx, origin)
  }
}

/** Texto libre → CaptureIntent vía LLM, con fallback a nota si algo falla. */
async function classifyFreeform(
  req: Request,
  userId: string,
  text: string,
  requestId: string,
): Promise<CaptureIntent> {
  const fallback: CaptureIntent = { kind: 'note', content: text }
  const overBudget = await checkMonthlyBudget(userId, requestId)
  if (overBudget) return fallback
  const invocation = await resolveAIInvocation(req, 'classify', userId)
  if (invocation.kind === 'off') return fallback
  try {
    const { content, usage, fromCache } = await askLLMForJson(buildClassifyPrompt(text), {
      provider: invocation.provider,
      model: invocation.model,
    })
    const classified = validateClassification(content)
    // Registro best-effort en extraction_log para que el cost-cap mensual
    // contabilice el gasto (un cache hit no cobra: cost_cents = 0).
    getSql()`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${text}, ${JSON.stringify(classified ?? {})}::jsonb, ${usage.provider}, ${usage.model}, ${usage.tokensIn}, ${usage.tokensOut}, ${fromCache ? 0 : usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    return classified ?? fallback
  } catch {
    return fallback
  }
}

export default withObservability(
  'whatsapp-webhook',
  async (req: Request, _context: Context, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const rawBody = await req.text()
    const params = Object.fromEntries(new URLSearchParams(rawBody))

    // Verificación de firma. Si TWILIO_AUTH_TOKEN no está configurado (dev /
    // local), se omite — igual que el modo legacy sin Clerk.
    const authToken = readEnv('TWILIO_AUTH_TOKEN')
    if (authToken) {
      const url = readEnv('TWILIO_WEBHOOK_URL') || req.url
      const ok = validateTwilioSignature({
        authToken,
        url,
        params,
        signature: req.headers.get('x-twilio-signature'),
      })
      if (!ok) {
        logEvent({ event: 'whatsapp_signature_rejected' })
        return ApiErrors.unauthenticated(requestId, 'Firma de Twilio inválida')
      }
    }

    const phone = normalizePhone(params.From ?? params.from)
    if (!phone) return emptyTwimlResponse()

    // Un toque en un botón de respuesta rápida vuelve como un mensaje normal:
    // Twilio pone el título del botón en `Body` (y en `ButtonText`). Preferimos
    // `ButtonText` para que «Deshacer»/«Momento»/«Nota» se parseen igual que si
    // el usuario los hubiera escrito (undo / reclasificar) — sin camino nuevo.
    const inboundText = params.ButtonText ?? params.Body ?? params.body ?? ''
    const parsed = parseInboundMessage(inboundText)
    const media = parseInboundMedia(params)

    // Sin adjuntos, un mensaje vacío o "ayuda" muestra el menú. (Con media,
    // el Body suele ser el caption, así que no cortamos acá.)
    if (media.length === 0 && (parsed.kind === 'empty' || parsed.kind === 'help')) {
      return twimlResponse(HELP)
    }

    if (parsed.kind === 'link') {
      const code = normalizeLinkCode(parsed.rawCode)
      if (!code) {
        return twimlResponse(
          'No reconozco ese código. Genéralo en Trama → Configuración → WhatsApp y reenvíalo así: vincular ABC123',
        )
      }
      const label = parsed.label?.slice(0, 40)
      const redeemed = await redeemLinkCode(phone, code, label)
      return twimlResponse(
        redeemed
          ? welcomeMessage(label)
          : 'Ese código venció o no es válido. Genera uno nuevo en Trama → Configuración → WhatsApp.',
      )
    }

    // parsed.kind === 'intent' | 'freeform' | 'undo' → necesita usuario vinculado.
    const userId = await resolveUserByPhone(phone)
    if (!userId) return twimlResponse(NOT_LINKED)

    // A partir de acá, todas las escrituras corren bajo el RLS del dueño.
    setCurrentRlsUser(userId)
    const sql = getSql()
    // Provisioning defensivo: el row de users ya existe (se creó al vincular),
    // pero lo aseguramos antes de escribir para no chocar con la FK users(id).
    await ensureUserRow(sql, { id: userId })

    // Idempotencia: si Twilio reintenta este mensaje (latencia/5xx), no lo
    // reprocesamos. El claim va ANTES de TODO comando (undo/status/query) y de
    // la captura, así un reintento no re-corre RAG/LLM ni re-deshace ni
    // distorsiona el conteo mensual.
    const messageSid = params.MessageSid ?? params.SmsMessageSid ?? params.SmsSid
    if (messageSid) {
      const claimed = await claimInboundMessage(sql, messageSid, userId)
      if (!claimed) return emptyTwimlResponse()
    }

    sql`
      UPDATE whatsapp_links SET last_message_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `.catch(() => {})

    if (parsed.kind === 'undo' && media.length === 0) {
      return twimlResponse(await undoLastCapture(sql, userId, phone))
    }

    if (parsed.kind === 'status' && media.length === 0) {
      return twimlResponse(await buildStatusReply(sql, userId, phone))
    }

    if (parsed.kind === 'query' && media.length === 0) {
      return twimlResponse(
        await handleQuery(
          req,
          sql,
          userId,
          requestId,
          parsed.text,
          new URL(req.url).origin,
        ),
      )
    }

    if (parsed.kind === 'recategorize' && media.length === 0) {
      return twimlResponse(
        await recategorizeLast(
          sql,
          userId,
          phone,
          parsed.toKind,
          new URL(req.url).origin,
        ),
      )
    }

    if (parsed.kind === 'retitle' && media.length === 0) {
      return twimlResponse(await retitleLast(sql, userId, phone, parsed.title))
    }

    if (parsed.kind === 'tag' && media.length === 0) {
      return twimlResponse(await tagLast(sql, userId, phone, parsed.tags))
    }

    // Botón [Descripción] (vuelve como "Descripción") → describe la última foto.
    if (parsed.kind === 'describe' && media.length === 0) {
      return twimlResponse(
        await describeLast(sql, userId, phone, parsed.text, new URL(req.url).origin),
      )
    }

    if (parsed.kind === 'menu' && media.length === 0) {
      return replyWithMenu(params)
    }

    // Adjuntos (foto): se procesan antes que el texto. El caption decide
    // destino (default Recortes; `momento:` → Momentos).
    // ¿Es la descripción que pedimos para la última foto sin pie? Un texto libre
    // (sin prefijo) que llega poco después de una captura sin descripción se
    // aplica a esa captura, en vez de clasificarse como una captura nueva.
    if (parsed.kind === 'freeform' && media.length === 0) {
      const desc = await consumeAwaitingDescription(sql, userId, phone, parsed.text)
      if (desc) {
        const link = captureDeepLink(new URL(req.url).origin, desc.kind)
        return twimlResponse(`✍️ Descripción agregada.\n🔗 Ábrelo en Trama: ${link}`)
      }
    }

    if (media.length > 0) {
      const { message, saved, offerDestino, offerDescription } = await handleInboundMedia(
        req,
        requestId,
        sql,
        userId,
        phone,
        params,
        media,
        new URL(req.url).origin,
      )
      // Botones según el caso: foto sin pie → [Descripción · Momento · Nota];
      // recorte con pie → [Deshacer · Momento · Nota]; resto → [Deshacer]. Si no
      // hay plantillas configuradas, cae a texto con la misma afordancia.
      const variant: CaptureReplyVariant = offerDescription
        ? 'foto'
        : offerDestino
          ? 'ambiguous'
          : 'simple'
      return saved > 0
        ? replyWithCapture(params, message, variant)
        : twimlResponse(message)
    }

    // Acá ya no hay media (se devolvió arriba) y empty/help/link/undo también
    // se resolvieron: solo quedan intent | freeform.
    const intent: CaptureIntent | null =
      parsed.kind === 'intent'
        ? parsed.intent
        : parsed.kind === 'freeform'
          ? await classifyFreeform(req, userId, parsed.text, requestId)
          : null
    if (!intent) return emptyTwimlResponse()

    if (intent.kind === 'quote' && !intent.author.trim()) {
      return twimlResponse(
        'Una cita necesita su autor. Envíala así: cita: <texto> — <autor>  (ejemplo: cita: el tiempo es relativo — Einstein)',
      )
    }

    const viaLLM = parsed.kind === 'freeform'
    try {
      const { message, id } = await persistCapture(sql, userId, intent)
      // Recordamos la última captura para que "deshacer" sepa qué borrar.
      if (id) await recordLastCapture(sql, phone, userId, intent.kind, id)
      logEvent({ event: 'whatsapp_capture', kind: intent.kind, viaLLM })
      await persistWhatsAppEvent(sql, userId, {
        event: 'capture',
        kind: intent.kind,
        ok: true,
      })
      if (!id) return twimlResponse(message)
      // Reply accionable: confirmación + deep link + botón/atajo para corregir.
      // Cuando lo clasificó la IA (texto libre = ambiguo), ofrecemos elegir el
      // destino (Momento/Nota) además de Deshacer.
      const link = captureDeepLink(new URL(req.url).origin, intent.kind)
      return replyWithCapture(
        params,
        `${message}\n🔗 Ábrelo en Trama: ${link}`,
        viaLLM ? 'ambiguous' : 'simple',
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      logEvent({ event: 'whatsapp_capture_failed', kind: intent.kind, message: detail })
      await persistWhatsAppEvent(sql, userId, {
        event: 'capture',
        kind: intent.kind,
        ok: false,
        detail,
      })
      return twimlResponse(
        'No pude guardarlo en este momento. Vuelve a intentarlo en unos segundos.',
      )
    }
  },
)

export const config: Config = {
  path: '/api/whatsapp-webhook',
}
