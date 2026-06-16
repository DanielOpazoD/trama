/**
 * Mensajes interactivos de WhatsApp (botones de respuesta rápida) vía Twilio
 * Content API. TwiML —lo que el webhook contesta por defecto— solo soporta
 * texto + media, así que para mostrar botones hay que MANDAR un mensaje saliente
 * con un Content Template (ver `send.ts`).
 *
 * Diseño OPT-IN con degradación elegante: los botones se activan solo si están
 * configuradas las plantillas (sus `ContentSid` en env vars). Si no, el webhook
 * sigue contestando texto por TwiML como siempre. Así el feature se mergea
 * seguro y se enciende cuando el operador crea las plantillas en Twilio.
 *
 * Dos plantillas (ambas con el cuerpo variable `{{1}}` = la confirmación):
 *   - `TWILIO_CONTENT_SID_CAPTURE`          → botón [Deshacer].
 *   - `TWILIO_CONTENT_SID_CAPTURE_DESTINO`  → botones [Deshacer, Momento, Nota],
 *     para cuando la captura fue ambigua (texto libre clasificado por la IA) y
 *     conviene ofrecer corregir el destino en un toque.
 *
 * Los TÍTULOS de los botones se eligen para que el toque vuelva como un comando
 * que el parser de entrada YA entiende: «Deshacer» → undo, «Momento»/«Nota» →
 * reclasificar la última captura. Así el camino de entrada no cambia.
 */

export type InteractiveConfig = {
  captureSid: string | null
  destinoSid: string | null
}

type EnvReader = (key: string) => string | undefined

const defaultReader: EnvReader = (key) => {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
}

export function readInteractiveConfig(
  read: EnvReader = defaultReader,
): InteractiveConfig {
  return {
    captureSid: read('TWILIO_CONTENT_SID_CAPTURE') || null,
    destinoSid: read('TWILIO_CONTENT_SID_CAPTURE_DESTINO') || null,
  }
}

/**
 * Plantilla a usar según si la captura fue ambigua. Devuelve `null` si no hay
 * plantilla aplicable → el webhook cae a TwiML. Una captura explícita NO usa la
 * plantilla con botones de destino (sería ruido: el usuario ya eligió).
 */
export function pickCaptureContentSid(
  cfg: InteractiveConfig,
  ambiguous: boolean,
): string | null {
  if (ambiguous) return cfg.destinoSid ?? cfg.captureSid ?? null
  return cfg.captureSid ?? null
}

/** El cuerpo de la plantilla es `{{1}}`; le pasamos la confirmación como var 1. */
export function captureContentVariables(body: string): string {
  return JSON.stringify({ '1': body })
}
