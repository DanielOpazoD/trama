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
  /** List Picker post-captura «⚡ Acciones» (filas Deshacer · Momento · Nota ·
   *  Tarea): ÚNICO menú, sirve para fotos Y para texto ambiguo. Los títulos
   *  vuelven como comandos. La descripción de una foto NO va acá —se agrega
   *  respondiendo con texto, que Trama pide sola—. Preferido sobre las
   *  quick-replies cuando está. */
  actionsSid: string | null
  /** Card para capturas explícitas (nota:/momento:/…): cuerpo `{{1}}` + botón
   *  URL **[Abrir en Trama]** (`{{2}}` = sufijo del deep link) + [Deshacer]. El
   *  link deja de ser texto y pasa a ser un botón. */
  cardSid: string | null
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
    actionsSid: read('TWILIO_CONTENT_SID_CAPTURE_ACTIONS') || null,
    cardSid: read('TWILIO_CONTENT_SID_CAPTURE_CARD') || null,
    menuSid: read('TWILIO_CONTENT_SID_MENU') || null,
  }
}

/** Variante de respuesta a una captura, en orden de especificidad. */
export type CaptureReplyVariant = 'foto' | 'ambiguous' | 'simple'

/**
 * Plantilla a usar según la variante de la captura. Degrada con elegancia: si la
 * plantilla específica no está configurada, cae a una más genérica y, en última
 * instancia, a `null` → el webhook responde TwiML de texto.
 *   - `foto`      → List Picker «⚡ Acciones» (Deshacer · Momento · Nota · Tarea);
 *                  cae a la quick-reply de foto, luego a destino/Deshacer.
 *   - `ambiguous` → la MISMA lista «⚡ Acciones» (texto libre clasificado por IA);
 *                  cae a la quick-reply de destino, luego a Deshacer.
 *   - `simple`    → [Deshacer] (captura explícita).
 */
export function pickCaptureContentSid(
  cfg: InteractiveConfig,
  variant: CaptureReplyVariant,
): string | null {
  if (variant === 'foto') {
    return cfg.actionsSid ?? cfg.fotoSid ?? cfg.destinoSid ?? cfg.captureSid ?? null
  }
  if (variant === 'ambiguous') {
    return cfg.actionsSid ?? cfg.destinoSid ?? cfg.captureSid ?? null
  }
  return cfg.captureSid ?? null
}

/** El cuerpo de la plantilla es `{{1}}`; le pasamos la confirmación como var 1. */
export function captureContentVariables(body: string): string {
  return JSON.stringify({ '1': body })
}

/**
 * Variables del Card: `{{1}}` = confirmación, `{{2}}` = sufijo del deep link que
 * el botón URL [Abrir en Trama] anexa a su base fija (el dominio de Trama, en la
 * plantilla). Pasamos solo el sufijo (path+query) para no acoplar el dominio.
 */
export function cardContentVariables(body: string, linkSuffix: string): string {
  return JSON.stringify({ '1': body, '2': linkSuffix })
}

/**
 * Sufijo (path + query) de un deep link para el botón URL del Card. La base
 * (`https://<dominio>`) la fija la plantilla; acá va lo que se le anexa. Si la
 * URL no parsea, devuelve '/' (el botón abre la home, nunca rompe).
 */
export function deepLinkSuffix(fullUrl: string): string {
  try {
    const u = new URL(fullUrl)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return '/'
  }
}
