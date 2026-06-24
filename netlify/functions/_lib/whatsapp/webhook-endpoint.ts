import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from '../db.js'
import { withObservability } from '../handler-wrap.js'
import { ApiErrors } from '../api-error.js'
import { logEvent } from '../observability.js'
import { setCurrentRlsUser, runWithSystemRls } from '../user-rls.js'
import { ensureUserRow } from '../user-provisioning.js'
import { validateTwilioSignature } from './twilio-signature.js'
import { normalizePhone } from './phone.js'
import { parseInboundMessage } from './parse-command.js'
import { normalizeLinkCode } from './link-code.js'
import { persistCapture } from './persist.js'
import { parseInboundMedia } from './media.js'
import {
  pendingMediaDestinationFromText,
  resolvePendingMediaDestination,
} from './pending-media.js'
import { consumeAwaitingDescription } from './description.js'
import { persistWhatsAppEvent } from './events.js'
import { captureDeepLink } from './deep-link.js'
import { recordLastCapture, undoLastCapture } from './last-capture.js'
import { describeLast, recategorizeLast, retitleLast, tagLast } from './capture-edits.js'
import { handleInboundMedia } from './media-pipeline.js'
import { buildStatusReply, classifyFreeform, handleQuery } from './text-intelligence.js'
import { twimlResponse, emptyTwimlResponse } from './twiml.js'
import type { CaptureIntent } from './types.js'
import { helpMessage, notLinkedMessage, welcomeMessage } from './webhook-replies.js'
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
