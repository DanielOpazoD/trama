import { logEvent } from '../observability.js'
import {
  readInteractiveConfig,
  pickCaptureContentSid,
  captureContentVariables,
  cardContentVariables,
  deepLinkSuffix,
  type CaptureReplyVariant,
} from './interactive.js'
import { sendWhatsAppContent } from './send.js'
import { emptyTwimlResponse, twimlResponse } from './twiml.js'
import { buildCaptureReplyText, helpMessage, openLinkText } from './webhook-replies.js'
import { readWebhookEnv } from './webhook-env.js'

/**
 * Responde la confirmación de una captura. Si hay plantillas de Content API
 * configuradas y credenciales de Twilio, manda un mensaje saliente con botones
 * y devuelve TwiML vacío. Si no, degrada a la respuesta de texto de siempre.
 */
export async function replyWithCapture(
  params: Record<string, string>,
  body: string,
  variant: CaptureReplyVariant,
  opts: { openUrl?: string } = {},
): Promise<Response> {
  const cfg = readInteractiveConfig()
  const accountSid = readWebhookEnv('TWILIO_ACCOUNT_SID')
  const authToken = readWebhookEnv('TWILIO_AUTH_TOKEN')
  const from = params.To ?? params.to
  const to = params.From ?? params.from
  const hasCreds = !!(accountSid && authToken && from && to)

  if (variant === 'simple' && cfg.cardSid && opts.openUrl && hasCreds) {
    const ok = await sendWhatsAppContent({
      accountSid: accountSid!,
      authToken: authToken!,
      from: from!,
      to: to!,
      contentSid: cfg.cardSid,
      contentVariables: cardContentVariables(body, deepLinkSuffix(opts.openUrl)),
    })
    if (ok) {
      logEvent({ event: 'whatsapp_interactive_sent', variant: 'card' })
      return emptyTwimlResponse()
    }
  }

  const bodyWithLink = opts.openUrl ? `${body}\n${openLinkText(opts.openUrl)}` : body
  const contentSid = pickCaptureContentSid(cfg, variant)
  if (contentSid && hasCreds) {
    const ok = await sendWhatsAppContent({
      accountSid: accountSid!,
      authToken: authToken!,
      from: from!,
      to: to!,
      contentSid,
      contentVariables: captureContentVariables(bodyWithLink),
    })
    if (ok) {
      logEvent({ event: 'whatsapp_interactive_sent', variant })
      return emptyTwimlResponse()
    }
  }

  return twimlResponse(buildCaptureReplyText(bodyWithLink, variant))
}

export async function replyWithMenu(params: Record<string, string>): Promise<Response> {
  const { menuSid } = readInteractiveConfig()
  const accountSid = readWebhookEnv('TWILIO_ACCOUNT_SID')
  const authToken = readWebhookEnv('TWILIO_AUTH_TOKEN')
  const from = params.To ?? params.to
  const to = params.From ?? params.from
  if (menuSid && accountSid && authToken && from && to) {
    const ok = await sendWhatsAppContent({
      accountSid,
      authToken,
      from,
      to,
      contentSid: menuSid,
      contentVariables: captureContentVariables('¿Qué quieres hacer?'),
    })
    if (ok) {
      logEvent({ event: 'whatsapp_interactive_sent', variant: 'menu' })
      return emptyTwimlResponse()
    }
  }

  return twimlResponse(helpMessage())
}
