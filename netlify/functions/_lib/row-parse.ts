import { z } from 'zod'

/**
 * E6 — validación runtime opt-in del shape de filas de un SELECT.
 *
 * `sqlTyped<Row>()` (ver db.ts) castea el resultado al tipo `Row` SIN
 * validar en runtime: si un SELECT omite una columna o el tipo declarado
 * diverge del SQL real, ni TypeScript ni ningún gate lo detecta — el bug
 * aparece recién en los datos. `parseRows` cierra ese hueco de forma
 * SELECTIVA: lo aplicás solo a los SELECT críticos donde el drift de
 * columnas duele.
 *
 * Valida cada fila contra `rowSchema` con `z.array(rowSchema)`. Si alguna
 * fila no matchea (columna faltante, tipo equivocado, enum fuera de rango),
 * lanza un Error descriptivo que incluye `context` (qué query falló) y las
 * issues de Zod. El throw es intencional: dentro de un handler envuelto por
 * `withObservability`, ese Error se persiste en `error_log` con su
 * `request_id` y se devuelve como 500 canónico — un drift de SELECT pasa de
 * "datos corruptos silenciosos" a "fila de log trazable".
 *
 * @example
 *   const RowSchema = z.object({ id: z.string(), name: z.string() })
 *   const rows = parseRows(
 *     await sqlTyped(sql`SELECT id, name FROM entities`),
 *     RowSchema,
 *     'entities.list',
 *   )
 *   rows[0].name // string, validado en runtime
 *
 * No reemplaza a `sqlTyped` en los ~50 call sites: es opt-in por diseño
 * (parsear cada read tiene un costo y la mayoría no lo necesita).
 */
export function parseRows<Schema extends z.ZodTypeAny>(
  rows: unknown,
  rowSchema: Schema,
  context: string,
): z.infer<Schema>[] {
  const result = z.array(rowSchema).safeParse(rows)
  if (!result.success) {
    // Mismo formato de issues que zod-body.ts (path + message) para que el
    // mensaje del Error sea legible en error_log y en el reporte de un usuario.
    const issues = result.error.issues
      .map((iss) => `${iss.path.join('.') || '(raíz)'}: ${iss.message}`)
      .join('; ')
    throw new Error(`Shape de fila inválido en ${context}: ${issues}`)
  }
  return result.data
}
