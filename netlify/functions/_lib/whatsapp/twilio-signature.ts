import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validación de la firma `X-Twilio-Signature` de un webhook entrante.
 *
 * Twilio firma cada request así (HMAC-SHA1, base64):
 *   1. Toma la URL completa configurada en la consola (incluida la query).
 *   2. Ordena los parámetros POST por nombre y los concatena como
 *      `clave + valor` (sin separadores), pegados al final de la URL.
 *   3. HMAC-SHA1 de ese string con el Auth Token como clave → base64.
 *
 * Replicamos eso y comparamos en tiempo constante. Sin esto, cualquiera que
 * conozca la URL del webhook podría inyectar notas/citas en la base.
 *
 * Doc: https://www.twilio.com/docs/usage/security#validating-requests
 */
export function expectedTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function validateTwilioSignature(opts: {
  authToken: string
  url: string
  params: Record<string, string>
  signature: string | null | undefined
}): boolean {
  if (!opts.signature) return false
  const expected = expectedTwilioSignature(opts.authToken, opts.url, opts.params)
  const a = Buffer.from(expected)
  const b = Buffer.from(opts.signature)
  // timingSafeEqual exige mismo largo; si difieren, ya es inválida.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
