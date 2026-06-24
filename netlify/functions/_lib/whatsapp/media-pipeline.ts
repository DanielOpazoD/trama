import { getSql } from '../db.js'
import {
  extractPhotoCapturedAt,
  pickOldestCapturedAt,
} from '../../../../src/lib/photoExif.js'
import { checkMonthlyBudget } from '../cost-cap.js'
import { resolveAIInvocation } from '../ai-mode.js'
import { askLLMForVision, askLLMForTranscription } from '../llm.js'
import { logEvent } from '../observability.js'
import { persistCapture } from './persist.js'
import {
  persistImageMomentoEpisode,
  persistImageRecorte,
  persistImageRecorteEvent,
  persistVideoRecorte,
  persistVoiceNoteAttachment,
} from './persist-media.js'
import {
  MEDIA_TOO_LARGE,
  audioExtFromMime,
  downloadTwilioMedia,
  isAllowedImageMime,
  isAllowedVideoMime,
  isTranscribableAudioMime,
  isVisionRoute,
  mediaCategory,
  mediaRoute,
  parseInboundMedia,
} from './media.js'
import { parseWhatsAppMediaDirectives } from './media-directives.js'
import { maybeStorePendingMediaPrompt } from './pending-media.js'
import { buildPhotoPrompt, validatePhotoExtraction } from './vision.js'
import type { PhotoMode } from './vision.js'
import { transcriptionToIntent } from './transcribe.js'
import { storeMedia } from './media-store.js'
import { appendSplitAlbum, readRecentMediaCapture } from './album.js'
import { setAwaitingDescription } from './description.js'
import { persistWhatsAppEvent } from './events.js'
import { captureDeepLink } from './deep-link.js'
import { readWebhookEnv } from './webhook-env.js'
import { recordLastCapture, softDeleteCapture } from './last-capture.js'
import type { CaptureIntent } from './types.js'
import { buildMediaReply } from './webhook-replies.js'

/**
 * Pipeline de media entrante de WhatsApp: descarga los adjuntos de Twilio, los
 * rutea por tipo (audio → nota de voz, video → recorte, imagen → visión /
 * momento / recorte) y arma la respuesta. Incluye los helpers de IA por-asset
 * (extractPhotoIntent / transcribeAudioIntent) que degradan a Recorte/Nota
 * cuando la IA está off o sin presupuesto. Corre bajo el RLS del dueño.
 */

/**
 * Pasa una imagen por el LLM de visión y devuelve la `CaptureIntent` extraída
 * (cita o nota), o `null` si no se puede usar IA (off / sin presupuesto / falla
 * del modelo) para que el caller caiga a guardar la imagen como Recorte.
 */
export async function extractPhotoIntent(
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
export async function transcribeAudioIntent(
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

export async function handleInboundMedia(
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
