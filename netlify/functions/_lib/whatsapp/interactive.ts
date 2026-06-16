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
  /** Plantilla para fotos SIN pie: botones [Descripción · Momento · Nota]. */
  fotoSid: string | null
  /** Menú de ayuda interactivo (list picker con acciones frecuentes). */
  menuSid: string | null
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
    fotoSid: read('TWILIO_CONTENT_SID_CAPTURE_FOTO') || null,
    menuSid: read('TWILIO_CONTENT_SID_MENU') || null,
  }
}

/** Variante de respuesta a una captura, en orden de especificidad. */
export type CaptureReplyVariant = 'foto' | 'ambiguous' | 'simple'

/**
 * Plantilla a usar según la variante de la captura. Degrada con elegancia: si la
 * plantilla específica no está configurada, cae a una más genérica y, en última
 * instancia, a `null` → el webhook responde TwiML de texto.
 *   - `foto`      → [Descripción · Momento · Nota] (foto sin pie); cae a destino.
 *   - `ambiguous` → [Deshacer · Momento · Nota] (texto libre clasificado por IA).
 *   - `simple`    → [Deshacer] (captura explícita).
 */
export function pickCaptureContentSid(
  cfg: InteractiveConfig,
  variant: CaptureReplyVariant,
): string | null {
  if (variant === 'foto') {
    return cfg.fotoSid ?? cfg.destinoSid ?? cfg.captureSid ?? null
  }
  if (variant === 'ambiguous') return cfg.destinoSid ?? cfg.captureSid ?? null
  return cfg.captureSid ?? null
}

/** El cuerpo de la plantilla es `{{1}}`; le pasamos la confirmación como var 1. */
export function captureContentVariables(body: string): string {
  return JSON.stringify({ '1': body })
}
