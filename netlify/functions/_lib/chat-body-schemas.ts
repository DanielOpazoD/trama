import { z } from 'zod'

/**
 * Schemas Zod para los bodies de los endpoints de chat y ask.
 *
 * Endpoints cubiertos:
 *   - POST /api/chat/threads        → ChatThreadCreateBody
 *   - POST /api/chat/threads/:id/messages → ChatMessageSendBody
 *   - POST /api/ask                 → AskBody
 *
 * Todos comparten el patrón "texto opcional con trim", así que el
 * archivo único reduce churn al agregar campos a uno u otro.
 */

/**
 * Body para crear un thread de chat. Ambos campos opcionales — un
 * thread sin título queda como (sin título) y el caller decide después.
 */
export const ChatThreadCreateBody = z.object({
  title: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
})
export type ChatThreadCreateBodyT = z.infer<typeof ChatThreadCreateBody>

/**
 * Body para enviar un mensaje a un thread. `content` requerido — el
 * handler valida después que tenga texto no vacío (rejecta whitespace
 * puro). Aceptamos solo string aquí; el trim lo hace el handler.
 */
export const ChatMessageSendBody = z.object({
  content: z.string().min(1, 'content requerido'),
})
export type ChatMessageSendBodyT = z.infer<typeof ChatMessageSendBody>

/**
 * Body para POST /api/ask. `text` requerido; los demás opcionales.
 * `view` se valida después contra VALID_VIEWS en el handler.
 */
export const AskBody = z.object({
  text: z.string().min(1, 'text requerido'),
  // El cliente manda `null` (no `undefined`) cuando no hay contexto —
  // `ai.ask` hace `view: options?.view ?? null`. Zod `.optional()` rechaza
  // `null`, así que sin `.nullable()` el body "soledad" daba 400 "Body
  // inválido". El handler ya tolera null en los tres (chequea truthy/typeof).
  view: z.string().nullable().optional(),
  selectedEntityId: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
})
export type AskBodyT = z.infer<typeof AskBody>
