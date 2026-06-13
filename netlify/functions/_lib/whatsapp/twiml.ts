/**
 * Respuesta TwiML. La forma más simple de contestar un webhook de Twilio:
 * devolver un XML `<Response><Message>…</Message></Response>` con
 * `Content-Type: text/xml` y Twilio entrega ese texto al usuario. No hace
 * falta SDK ni una llamada saliente a la API (ni credenciales de envío) para
 * el ack — el Auth Token alcanza para verificar la firma de entrada.
 */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Construye el XML de una respuesta con un solo mensaje. */
export function buildTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`
}

/** Respuesta HTTP TwiML lista para devolver desde el handler. */
export function twimlResponse(message: string): Response {
  return new Response(buildTwiml(message), {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

/** TwiML vacío: 200 que NO manda ningún mensaje de vuelta. */
export function emptyTwimlResponse(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}
