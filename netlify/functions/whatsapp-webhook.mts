import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { setCurrentRlsUser, runWithSystemRls } from './_lib/user-rls.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { resolveAIInvocation } from './_lib/ai-mode.js'
import { askLLMForJson } from './_lib/llm.js'
import { validateTwilioSignature } from './_lib/whatsapp/twilio-signature.js'
import { normalizePhone } from './_lib/whatsapp/phone.js'
import { parseInboundMessage } from './_lib/whatsapp/parse-command.js'
import { normalizeLinkCode } from './_lib/whatsapp/link-code.js'
import { buildClassifyPrompt, validateClassification } from './_lib/whatsapp/interpret.js'
import { persistCapture } from './_lib/whatsapp/persist.js'
import { persistImageRecorte, persistImageMomento } from './_lib/whatsapp/persist-media.js'
import {
  parseInboundMedia,
  mediaCategory,
  mediaTarget,
  downloadTwilioMedia,
} from './_lib/whatsapp/media.js'
import { storeMedia } from './_lib/whatsapp/media-store.js'
import { captureDeepLink } from './_lib/whatsapp/deep-link.js'
import { twimlResponse, emptyTwimlResponse } from './_lib/whatsapp/twiml.js'
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

const HELP = [
  'Trama 📚 — capturá desde WhatsApp:',
  '• nota: <texto>',
  '• cita: <frase> — <autor>',
  '• entidad: <nombre> (tipo)',
  '• momento: <qué pasó>',
  'O mandá texto libre y lo clasifico solo.',
  'Para borrar lo último: deshacer.',
].join('\n')

const NOT_LINKED = [
  'Tu número no está vinculado a Trama.',
  'Entrá a Trama → Configuración → WhatsApp, generá un código y enviámelo así:',
  'vincular ABC123',
].join('\n')

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

/** Canjea un código pendiente y lo ata al número, en un CTE atómico. */
async function redeemLinkCode(phone: string, code: string): Promise<boolean> {
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
    ? `↩️ Listo, deshecho. ${noun} se borró.`
    : 'Eso ya no estaba (quizá lo borraste desde la app).'
}

/** Recuerda la última captura del número para que "deshacer" sepa qué borrar. */
function recordLastCapture(
  sql: ReturnType<typeof getSql>,
  phone: string,
  userId: string,
  kind: string,
  id: string,
): void {
  sql`
    UPDATE whatsapp_links
    SET last_capture_kind = ${kind}, last_capture_id = ${id}::uuid,
        last_capture_at = NOW(), updated_at = NOW()
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
  `.catch(() => {})
}

/**
 * Procesa los adjuntos de un mensaje. Hoy solo imágenes: las baja de Twilio,
 * las sube al store y crea Recorte (default) o Momento foto (caption
 * `momento:`). Audio/video se reconocen y se avisan (próximo incremento).
 * Devuelve el texto de confirmación.
 */
async function handleInboundMedia(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  params: Record<string, string>,
  media: ReturnType<typeof parseInboundMedia>,
  origin: string,
): Promise<string> {
  const accountSid = readEnv('TWILIO_ACCOUNT_SID')
  const authToken = readEnv('TWILIO_AUTH_TOKEN')
  const { target, caption } = mediaTarget(params.Body ?? params.body ?? '')
  let saved = 0
  let lastId: string | null = null
  let lastKind = ''
  const skipped = new Set<string>()

  for (const item of media) {
    const cat = mediaCategory(item.contentType)
    if (cat !== 'image') {
      skipped.add(cat)
      continue
    }
    if (!accountSid || !authToken) {
      skipped.add('config')
      continue
    }
    try {
      const { buffer, contentType } = await downloadTwilioMedia(item.url, accountSid, authToken)
      if (target === 'momento') {
        const key = await storeMedia('momentos-media', userId, buffer, contentType)
        const r = await persistImageMomento(sql, userId, key, caption)
        lastId = r.id
        lastKind = 'momento'
      } else {
        const key = await storeMedia('recortes-media', userId, buffer, contentType)
        const r = await persistImageRecorte(sql, userId, key, caption)
        lastId = r.id
        lastKind = 'recorte'
      }
      saved += 1
    } catch (err) {
      skipped.add('error')
      logEvent({
        event: 'whatsapp_media_failed',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (saved > 0 && lastId) {
    recordLastCapture(sql, phone, userId, lastKind, lastId)
    logEvent({ event: 'whatsapp_capture', kind: lastKind, media: true, count: saved })
  }

  const lines: string[] = []
  if (saved > 0) {
    const dest = target === 'momento' ? 'Momentos' : 'Recortes'
    lines.push(
      saved === 1
        ? `📷 Imagen guardada en ${dest}.`
        : `📷 ${saved} imágenes guardadas en ${dest}.`,
    )
    lines.push(`🔗 ${captureDeepLink(origin, lastKind)}`)
    lines.push('↩️ ¿Mal? Respondé: deshacer')
  }
  if (skipped.has('audio') || skipped.has('video')) {
    lines.push('🎧🎬 Audio y video todavía no los proceso — pronto.')
  }
  if (skipped.has('config')) {
    lines.push('Para procesar imágenes falta configurar TWILIO_ACCOUNT_SID en el servidor.')
  }
  if (saved === 0 && skipped.has('error')) {
    lines.push('No pude bajar la imagen. Probá de nuevo en un momento.')
  }
  if (lines.length === 0) lines.push('Recibí el archivo pero no pude procesarlo.')
  return lines.join('\n')
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

    const parsed = parseInboundMessage(params.Body ?? params.body ?? '')
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
          'Código inválido. Generá uno en Trama → Configuración → WhatsApp y reenvialo: vincular ABC123',
        )
      }
      const redeemed = await redeemLinkCode(phone, code)
      return twimlResponse(
        redeemed
          ? '✅ Número vinculado. Ya podés mandarme notas, citas, entidades y momentos.'
          : 'Código vencido o inválido. Generá uno nuevo en Trama → Configuración → WhatsApp.',
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

    if (parsed.kind === 'undo' && media.length === 0) {
      return twimlResponse(await undoLastCapture(sql, userId, phone))
    }

    // Idempotencia: si Twilio reintenta este mensaje (latencia/5xx), no lo
    // reprocesamos ni volvemos a pagar el LLM. El claim va ANTES de clasificar.
    const messageSid = params.MessageSid ?? params.SmsMessageSid ?? params.SmsSid
    if (messageSid) {
      const claimed = await claimInboundMessage(sql, messageSid, userId)
      if (!claimed) return emptyTwimlResponse()
    }

    sql`
      UPDATE whatsapp_links SET last_message_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `.catch(() => {})

    // Adjuntos (foto): se procesan antes que el texto. El caption decide
    // destino (default Recortes; `momento:` → Momentos).
    if (media.length > 0) {
      return twimlResponse(
        await handleInboundMedia(sql, userId, phone, params, media, new URL(req.url).origin),
      )
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
        'Una cita necesita autor. Mandá: cita: <texto> — <autor>  (ej: cita: el tiempo es relativo — Einstein)',
      )
    }

    try {
      const { message, id } = await persistCapture(sql, userId, intent)
      // Recordamos la última captura para que "deshacer" sepa qué borrar.
      if (id) recordLastCapture(sql, phone, userId, intent.kind, id)
      logEvent({
        event: 'whatsapp_capture',
        kind: intent.kind,
        viaLLM: parsed.kind === 'freeform',
      })
      // Reply accionable: confirmación + deep link a la vista + cómo deshacer.
      const link = captureDeepLink(new URL(req.url).origin, intent.kind)
      const reply = id ? `${message}\n🔗 ${link}\n↩️ ¿Mal? Respondé: deshacer` : message
      return twimlResponse(reply)
    } catch (err) {
      logEvent({
        event: 'whatsapp_capture_failed',
        kind: intent.kind,
        message: err instanceof Error ? err.message : String(err),
      })
      return twimlResponse('Ups, no pude guardarlo. Probá de nuevo en un momento.')
    }
  },
)

export const config: Config = {
  path: '/api/whatsapp-webhook',
}
