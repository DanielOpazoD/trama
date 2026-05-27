/**
 * Helper compartido para normalizar el campo `origin` en las tablas
 * principales (entities, quotes, relationships, momentos).
 *
 * El campo `origin` en la DB es `JSONB NOT NULL DEFAULT '{"kind":"manual"}'`
 * pero el cliente puede mandar:
 *   - un objeto bien formado `{ kind: 'ai', provider: 'openai', ... }`
 *   - un string legacy `'ai'` o `'manual'`
 *   - nada (undefined/null)
 *
 * Esta función acepta los 3 inputs y devuelve siempre el shape canónico
 * para insertar como JSONB. Vivía duplicado idénticamente en 5 archivos
 * (entities, quotes, relationships, momentos, import) — un copy-paste
 * que era riesgo de divergencia. Ahora cualquier cambio al shape lo
 * tocás en un solo lugar.
 *
 * @example
 *   const origin = JSON.stringify(normalizeOrigin(body.origin))
 *   await sql`INSERT … (origin) VALUES (${origin}::jsonb)`
 */
export type Origin = { kind: string; [key: string]: unknown }

export function normalizeOrigin(value: unknown): Origin {
  if (
    value &&
    typeof value === 'object' &&
    'kind' in (value as Record<string, unknown>)
  ) {
    return value as Origin
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}
