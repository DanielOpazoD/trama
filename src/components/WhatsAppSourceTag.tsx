import type { Origin } from '../types/origin'
import { ChatBubbleIcon } from './Icons'

/**
 * Marcador de procedencia "vía WhatsApp": un iconito discreto (burbuja de
 * mensaje) que indica que el ítem se capturó desde WhatsApp. Renderiza algo
 * SOLO si el ítem viene de ese medio; si no, es silencioso (null), así se puede
 * dropear en cualquier card sin checks en el call site.
 *
 * La procedencia vive en dos formas según la tabla:
 *  - `origin.importedFrom === 'whatsapp'` (momentos, entidades, citas).
 *  - columna `source === 'whatsapp'` (notas, recortes).
 * El componente acepta ambas para reusarse en todos los renderers.
 */
export function isWhatsAppOrigin(origin?: Origin | null): boolean {
  return origin?.importedFrom === 'whatsapp'
}

export function isFromWhatsApp({
  origin,
  source,
}: {
  origin?: Origin | null
  source?: string | null
}): boolean {
  return isWhatsAppOrigin(origin) || source?.trim().toLowerCase() === 'whatsapp'
}

export function WhatsAppSourceTag({
  origin,
  source,
  size = 10,
  className = '',
}: {
  origin?: Origin | null
  source?: string | null
  size?: number
  className?: string
}) {
  if (!isFromWhatsApp({ origin, source })) return null
  return (
    <span
      className={`ml-1.5 inline-flex items-center text-ink-300 align-middle ${className}`}
      title="Capturado desde WhatsApp"
      aria-label="Capturado desde WhatsApp"
    >
      <ChatBubbleIcon size={size} />
    </span>
  )
}
