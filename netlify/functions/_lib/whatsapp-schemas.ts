import { z } from 'zod'

/** Bodies del módulo WhatsApp (vincular número ↔ usuario). */

export const WhatsAppLinkCreateBody = z.object({
  /** Etiqueta opcional para reconocer el dispositivo/número. */
  label: z.string().trim().min(1).max(60).optional(),
})
