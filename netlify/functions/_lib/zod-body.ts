import type { z } from 'zod'
import { ApiErrors } from './api-error.js'

/**
 * Helper compartido para parsear el JSON body de un request contra un
 * schema Zod. Devuelve un discriminated union para que el caller pueda
 * decidir: si `ok: true` usa `data` con tipo inferido; si `ok: false`
 * devuelve `response` directamente al cliente (Response ya armado con
 * ApiErrors.validation + details estructurados).
 *
 * Uso típico:
 *
 *   const parsed = await parseJsonBody(req, EntityCreateBody, requestId)
 *   if (!parsed.ok) return parsed.response
 *   const { name, type } = parsed.data
 *
 * Tres modos de fallo:
 *   - JSON inválido → "Body JSON inválido"
 *   - Schema fail → ApiErrors.validation con `details.issues` (Zod issues)
 *   - Body vacío → ApiErrors.validation
 *
 * Por qué un helper: el patrón anterior repetía try/catch + cast +
 * validación manual en cada endpoint. Centralizado garantiza:
 *   - Mismos códigos de error y shape
 *   - `details.issues` consistente en el log y para el cliente
 *   - Sin "as Record<string, unknown>" perdido en cada handler
 */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response }

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  requestId: string,
): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      ok: false,
      response: ApiErrors.validation(requestId, 'Body JSON inválido'),
    }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    // Zod issues tiene path + message — útil para que el cliente sepa
    // qué campo falló. Lo metemos en `details.issues` que el shape
    // canónico de ApiErrors acepta como payload estructurado.
    return {
      ok: false,
      response: ApiErrors.validation(requestId, 'Body inválido', {
        issues: result.error.issues.map((iss) => ({
          path: iss.path.join('.'),
          message: iss.message,
        })),
      }),
    }
  }
  return { ok: true, data: result.data }
}
