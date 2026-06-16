import { logEvent } from '../observability.js'
import { fetchWithTimeout } from './fetch-timeout.js'

/**
 * Envío SALIENTE de un mensaje de WhatsApp con un Content Template (botones)
 * por la API REST de Twilio. Se usa cuando el webhook quiere responder con
 * botones en vez de TwiML (ver `interactive.ts`).
 *
 * Best-effort: devuelve `true` si Twilio aceptó el envío (2xx), `false` ante
 * cualquier falla. El caller cae a TwiML de texto si devuelve `false`, así un
 * problema de envío nunca deja al usuario sin confirmación.
 *
 * `from`/`to` llegan ya con el prefijo `whatsapp:+…` (como los manda Twilio en
 * el webhook entrante): `from` = número del bot (el `To` del mensaje entrante),
 * `to` = número del usuario (el `From` del entrante).
 */
export async function sendWhatsAppContent(opts: {
  accountSid: string
  authToken: string
  from: string
  to: string
  contentSid: string
  contentVariables: string
}): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    opts.accountSid,
  )}/Messages.json`
  const auth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64')
  const form = new URLSearchParams({
    From: opts.from,
    To: opts.to,
    ContentSid: opts.contentSid,
    ContentVariables: opts.contentVariables,
  })
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!res.ok) {
      // Acotamos también la lectura del body de error para no quedar colgados
      // si Twilio transmite la respuesta de error lentamente.
      const text = await Promise.race([
        res.text().catch(() => ''),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 3000)),
      ])
      logEvent({
        event: 'whatsapp_send_failed',
        status: res.status,
        message: text.slice(0, 200),
      })
      return false
    }
    return true
  } catch (err) {
    logEvent({
      event: 'whatsapp_send_error',
      message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
