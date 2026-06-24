import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from '../db.js'
import { withObservability } from '../handler-wrap.js'
import { ApiErrors } from '../api-error.js'
import { logEvent } from '../observability.js'
import {
  extractPhotoCapturedAt,
  pickOldestCapturedAt,
} from '../../../../src/lib/photoExif.js'
import { setCurrentRlsUser, runWithSystemRls } from '../user-rls.js'
import { ensureUserRow } from '../user-provisioning.js'
import { checkMonthlyBudget } from '../cost-cap.js'
import { resolveAIInvocation } from '../ai-mode.js'
import {
  askLLMForJson,
  askLLMForVision,
  askLLMForText,
  askLLMForTranscription,
} from '../llm.js'
import { buildRagContext } from '../rag-context.js'
import { validateTwilioSignature } from './twilio-signature.js'
import { normalizePhone } from './phone.js'
import { parseInboundMessage } from './parse-command.js'
import { normalizeLinkCode } from './link-code.js'
import { buildClassifyPrompt, validateClassification } from './interpret.js'
import { persistCapture } from './persist.js'
import {
  persistImageRecorte,
  persistImageRecorteEvent,
  persistImageMomentoEpisode,
  persistVideoRecorte,
  persistVoiceNoteAttachment,
} from './persist-media.js'
import {
  parseInboundMedia,
  mediaCategory,
  mediaRoute,
  isVisionRoute,
  downloadTwilioMedia,
  isAllowedImageMime,
  isAllowedVideoMime,
  isTranscribableAudioMime,
  audioExtFromMime,
  MEDIA_TOO_LARGE,
} from './media.js'
import { parseWhatsAppMediaDirectives } from './media-directives.js'
import {
  maybeStorePendingMediaPrompt,
  pendingMediaDestinationFromText,
  resolvePendingMediaDestination,
} from './pending-media.js'
import { buildPhotoPrompt, validatePhotoExtraction } from './vision.js'
import type { PhotoMode } from './vision.js'
import { transcriptionToIntent } from './transcribe.js'
import { formatStatus } from './status.js'
import {
  buildRecallPrompt,
  formatRecallAnswer,
  formatRecallFallback,
  recallHasResults,
} from './recall.js'
import { storeMedia } from './media-store.js'
import {
  reclassifyRecorteToMomento,
  reclassifyRecorteToNote,
} from './reclassify-media.js'
import { readRecentMediaCapture, appendSplitAlbum } from './album.js'
import {
  setAwaitingDescription,
  consumeAwaitingDescription,
  applyDescription,
} from './description.js'
import { persistWhatsAppEvent } from './events.js'
import { captureDeepLink } from './deep-link.js'
import {
  NOUN_BY_KIND,
  readCaptureText,
  readLastPointer,
  recordLastCapture,
  softDeleteCapture,
  undoLastCapture,
} from './last-capture.js'
import { twimlResponse, emptyTwimlResponse } from './twiml.js'
import type { CaptureIntent } from './types.js'
import {
  buildMediaReply,
  helpMessage,
  notLinkedMessage,
  openInTramaLine,
  parseInlineTags,
  welcomeMessage,
} from './webhook-replies.js'
import { replyWithCapture, replyWithMenu } from './webhook-interactive-replies.js'
import { readWebhookEnv } from './webhook-env.js'
import type { CaptureReplyVariant } from './interactive.js'

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
    return 'No hay ninguna foto reciente para describir. Manda una foto y después su descripción.'
  }
  if (text.trim()) {
    const ok = await applyDescription(sql, userId, last.kind, last.id, text)
    if (!ok) return 'No pude agregar la descripción (¿la borraste desde la app?).'
    return `✍️ Descripción agregada.\n${openInTramaLine(origin, last.kind)}`
  }
  await setAwaitingDescription(sql, phone, userId, last.kind, last.id)
  return '✍️ Perfecto, mándame la descripción y se la agrego.'
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
  toKind: 'note' | 'momento' | 'entity' | 'task',
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

  // Una tarea es texto/acción: no lleva imagen. Si la última captura es un
  // recorte (foto), no la convertimos en tarea —perdería la imagen—; el menú
  // «Tarea» vive en las capturas de texto, no en las fotos.
  if (last.kind === 'recorte' && toKind === 'task') {
    return 'Una foto no se vuelve tarea (perdería la imagen). Déjala en Recortes, pásala a Nota o Momento, o manda la tarea aparte con «tarea: …».'
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
        : toKind === 'task'
          ? { kind: 'task', title: text, detail: null }
          : { kind: 'entity', name: text, entityType: 'concepto', description: null }
  const { message, id } = await persistCapture(sql, userId, intent)
  if (!id) return 'No pude reclasificarla en este momento. Vuelve a intentarlo.'
  await softDeleteCapture(sql, userId, last.kind, last.id)
  await recordLastCapture(sql, phone, userId, intent.kind, id)
  const link = captureDeepLink(origin, intent.kind)
  return `🔄 Reclasificado. ${message}\n🔗 Ábrelo en Trama: ${link}\n↩️ ¿No era así? Responde «deshacer».`
}

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
    const { content, usage, fromCache } = await askLLMForVision(
      system,
      user,
      imageBase64,
      mimeType,
      { provider: invocation.provider, model: invocation.model },
    )
    // Costo de la visión al cost-cap mensual. Antes NO se registraba → la visión
    // por WhatsApp no contaba contra el presupuesto (hueco de costo: el usuario
    // podía gastar sin tope). Awaited: en serverless un floating promise puede no
    // alcanzar a escribir antes de que se congele la instancia.
    await getSql()`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${'[imagen]'}, ${JSON.stringify({ vision: true, mode })}::jsonb, ${usage.provider}, ${usage.model}, ${usage.tokensIn}, ${usage.tokensOut}, ${fromCache ? 0 : usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    // Observabilidad: la visión SÍ se intentó y salió bien (cuenta a la tasa de
    // fallas honesta del panel, no solo las capturas).
    await persistWhatsAppEvent(getSql(), userId, { event: 'vision', ok: true })
    return validatePhotoExtraction(content, mode, caption)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logEvent({ event: 'whatsapp_vision_failed', message: detail })
    await persistWhatsAppEvent(getSql(), userId, { event: 'vision', ok: false, detail })
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
    // Costo de la transcripción al cost-cap (Whisper cobra por minuto, estimado).
    // Awaited para que quede registrado antes de responder (la instancia se
    // congela tras el return y un floating promise podría no escribir).
    await sql`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${'[nota de voz]'}, ${JSON.stringify({ transcribed: true })}::jsonb, ${usage.provider}, ${usage.model}, ${0}, ${0}, ${usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    logEvent({ event: 'whatsapp_transcription', chars: text.trim().length })
    await persistWhatsAppEvent(sql, userId, { event: 'transcription', ok: true })
    return transcriptionToIntent(text)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logEvent({ event: 'whatsapp_transcription_failed', message: detail })
    await persistWhatsAppEvent(sql, userId, { event: 'transcription', ok: false, detail })
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
  openUrl?: string
}> {
  const accountSid = readWebhookEnv('TWILIO_ACCOUNT_SID')
  const authToken = readWebhookEnv('TWILIO_AUTH_TOKEN')
  const mediaDirectives = parseWhatsAppMediaDirectives(params.Body ?? params.body ?? '')
  const { route, caption } = mediaRoute(mediaDirectives.body)
  let saved = 0
  let lastId: string | null = null
  let lastKind = ''
  const skipped = new Set<string>()
  // Fotos del route 'momento': se acumulan y se persisten como UN solo momento
  // foto (episodio) tras el loop, en vez de N momentos sueltos.
  const momentoKeys: string[] = []
  const momentoCapturedAts: Array<string | null> = []
  // Imágenes del route 'recorte' (default): se acumulan y, si son 2+, se
  // guardan como UN recorte-evento (varias imágenes en una entrada).
  const recorteKeys: Array<{ key: string; mime: string; capturedAt?: string | null }> = []

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

    if (cat === 'video') {
      if (!isAllowedVideoMime(item.contentType)) {
        skipped.add('video_format')
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
        const key = await storeMedia(
          'recortes-media',
          userId,
          buffer,
          contentType || item.contentType,
        )
        const r = await persistVideoRecorte(sql, userId, key, caption)
        lastId = r.id
        lastKind = 'recorte'
        saved += 1
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

      // Rutas de visión: si IA falla, caemos a guardar la imagen como Recorte.
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
        const capturedAt =
          mediaDirectives.explicitCapturedAt ?? extractPhotoCapturedAt(buffer)
        const key = await storeMedia('momentos-media', userId, buffer, contentType)
        momentoKeys.push(key)
        momentoCapturedAts.push(capturedAt)
      } else {
        // Tampoco persistimos aún: juntamos las imágenes y, tras el loop,
        // creamos un recorte único (1 imagen) o un recorte-evento (2+).
        const capturedAt =
          mediaDirectives.explicitCapturedAt ?? extractPhotoCapturedAt(buffer)
        const key = await storeMedia('recortes-media', userId, buffer, contentType)
        recorteKeys.push({ key, mime: contentType, capturedAt })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skipped.add(msg === MEDIA_TOO_LARGE ? 'toolarge' : 'error')
      logEvent({ event: 'whatsapp_media_failed', message: msg })
    }
  }

  const pendingPrompt = await maybeStorePendingMediaPrompt(sql, userId, phone, {
    route,
    body: mediaDirectives.body,
    grouping: mediaDirectives.grouping,
    recorteImages: recorteKeys,
    momentoImageCount: momentoKeys.length,
  })
  if (pendingPrompt) {
    return {
      message: pendingPrompt,
      saved: 0,
      offerDestino: false,
      offerDescription: false,
    }
  }

  // Álbum partido: ¿estas fotos nuevas se anexan a la captura de media reciente?
  // La decisión + las 4 ramas cross-store (con rollback) viven en album.ts; acá
  // solo orquestamos. `appendSplitAlbum` vacía las keys cuando confirma.
  let appendedTotal: number | null = null
  const newImageCount = momentoKeys.length + recorteKeys.length
  const isRawMediaRoute = route === 'momento' || route === 'recorte'
  const canAppendToRecent = mediaDirectives.grouping === 'append'
  if (newImageCount > 0 && isRawMediaRoute && canAppendToRecent) {
    const recent = await readRecentMediaCapture(sql, userId, phone)
    if (recent) {
      const appended = await appendSplitAlbum(sql, userId, recent, {
        route,
        newImageCount,
        momentoKeys,
        momentoCapturedAts,
        recorteKeys,
        softDeleteCapture,
      })
      appendedTotal = appended.appendedTotal
      if (appendedTotal !== null) {
        lastId = appended.lastId
        lastKind = appended.lastKind
        saved += newImageCount
      }
    }
  }

  // Episodio foto: todas las fotos del route 'momento' en un solo momento.
  if (momentoKeys.length > 0) {
    try {
      const r = await persistImageMomentoEpisode(
        sql,
        userId,
        momentoKeys,
        caption,
        pickOldestCapturedAt(momentoCapturedAts),
      )
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

  // Ensamblado del texto de respuesta (copy puro en webhook-replies.ts). Las
  // longitudes de keys se leen acá (la persistencia de episodio/evento no las
  // vacía; el álbum partido sí, pero entonces appendedTotal != null y no se usan).
  const explicitDateApplied =
    mediaDirectives.explicitCapturedAt !== null &&
    lastKind === 'momento' &&
    appendedTotal === null
  const { message, offerDestino } = buildMediaReply({
    saved,
    lastKind,
    appendedTotal,
    newImageCount,
    momentoCount: momentoKeys.length,
    recorteCount: recorteKeys.length,
    explicitDateApplied,
    dateLabel: mediaDirectives.dateLabel,
    wantsDescription,
    skipped,
  })
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
    message,
    saved,
    offerDestino,
    offerDescription: wantsDescription,
    openUrl: saved > 0 && lastId ? captureDeepLink(origin, lastKind) : undefined,
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
    await persistWhatsAppEvent(sql, userId, { event: 'recall', ok: true })
    return formatRecallAnswer(answer, ctx, origin)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logEvent({ event: 'whatsapp_recall_failed', message: detail })
    await persistWhatsAppEvent(sql, userId, { event: 'recall', ok: false, detail })
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
    // Registro en extraction_log para que el cost-cap mensual contabilice el
    // gasto (un cache hit no cobra: cost_cents = 0). Awaited para que quede
    // escrito antes de responder (la instancia se congela tras el return).
    await getSql()`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${text}, ${JSON.stringify(classified ?? {})}::jsonb, ${usage.provider}, ${usage.model}, ${usage.tokensIn}, ${usage.tokensOut}, ${fromCache ? 0 : usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    return classified ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Ejecuta un handler de comando y SIEMPRE devuelve un TwiML. El MessageSid ya
 * fue reclamado (idempotencia), así que si el handler lanza —un hipo de DB, por
 * ejemplo— y dejáramos propagar, withObservability respondería un 500: Twilio
 * reintentaría, el claim deduplicaría el reintento y el usuario quedaría sin
 * respuesta para siempre. En cambio respondemos una disculpa amable (200) y
 * dejamos rastro en el log.
 */
async function commandReply(
  command: string,
  produce: () => Promise<string>,
): Promise<Response> {
  try {
    return twimlResponse(await produce())
  } catch (err) {
    logEvent({
      event: 'whatsapp_command_failed',
      command,
      message: err instanceof Error ? err.message : String(err),
    })
    return twimlResponse(
      'No pude completar esa acción ahora. Vuelve a intentarlo en unos segundos.',
    )
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
    const authToken = readWebhookEnv('TWILIO_AUTH_TOKEN')
    if (authToken) {
      const url = readWebhookEnv('TWILIO_WEBHOOK_URL') || req.url
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
      return twimlResponse(helpMessage())
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
    if (!userId) return twimlResponse(notLinkedMessage())

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
      return commandReply('undo', () => undoLastCapture(sql, userId, phone))
    }

    if (parsed.kind === 'status' && media.length === 0) {
      return commandReply('status', () => buildStatusReply(sql, userId, phone))
    }

    if (parsed.kind === 'query' && media.length === 0) {
      const { text } = parsed
      return commandReply('query', () =>
        handleQuery(req, sql, userId, requestId, text, new URL(req.url).origin),
      )
    }

    const pendingDestination = pendingMediaDestinationFromText(params.Body ?? '')
    if (pendingDestination && media.length === 0) {
      const origin = new URL(req.url).origin
      const resolved = await resolvePendingMediaDestination(
        sql,
        userId,
        phone,
        pendingDestination,
        origin,
      )
      if (resolved) {
        await recordLastCapture(sql, phone, userId, resolved.kind, resolved.id)
        return twimlResponse(`${resolved.message}\n↩️ ¿No era así? Responde «deshacer».`)
      }
    }

    if (parsed.kind === 'recategorize' && media.length === 0) {
      const { toKind } = parsed
      return commandReply('recategorize', () =>
        recategorizeLast(sql, userId, phone, toKind, new URL(req.url).origin),
      )
    }

    if (parsed.kind === 'retitle' && media.length === 0) {
      const { title } = parsed
      return commandReply('retitle', () => retitleLast(sql, userId, phone, title))
    }

    if (parsed.kind === 'tag' && media.length === 0) {
      const { tags } = parsed
      return commandReply('tag', () => tagLast(sql, userId, phone, tags))
    }

    // Botón [Descripción] (vuelve como "Descripción") → describe la última foto.
    if (parsed.kind === 'describe' && media.length === 0) {
      const { text } = parsed
      return commandReply('describe', () =>
        describeLast(sql, userId, phone, text, new URL(req.url).origin),
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
      const { message, saved, offerDestino, offerDescription, openUrl } =
        await handleInboundMedia(
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
      // hay plantillas configuradas, cae a texto con la misma afordancia. El deep
      // link va como botón [Abrir en Trama] (Card) en el caso 'simple', o texto.
      const variant: CaptureReplyVariant = offerDescription
        ? 'foto'
        : offerDestino
          ? 'ambiguous'
          : 'simple'
      return saved > 0
        ? replyWithCapture(params, message, variant, { openUrl })
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
      // Reply accionable: confirmación + deep link (botón [Abrir en Trama] en el
      // Card de capturas explícitas; texto si no) + corregir. Texto libre = la IA
      // clasificó (ambiguo): además se ofrece elegir destino.
      const link = captureDeepLink(new URL(req.url).origin, intent.kind)
      return replyWithCapture(params, message, viaLLM ? 'ambiguous' : 'simple', {
        openUrl: link,
      })
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
