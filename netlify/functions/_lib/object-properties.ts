import { z } from 'zod'
import { sqlTyped, type SqlClient } from './db.js'
import { OBJECT_KINDS } from './query/ast.js'
import { KIND_META } from './query/field-registry.js'
import { SqlBuilder, asTemplateStrings } from './query/builder.js'

/**
 * Escritura de propiedades de usuario + tags sobre cualquier objeto consultable
 * (Fase 2). `PATCH /api/object-properties` setea/borra claves de `properties`
 * (JSONB) y/o reemplaza `tags`, parametrizado y bajo RLS (vía tagged template).
 *
 * Las claves de propiedad se validan por formato en el schema; los valores van
 * como parámetros. La whitelist de tablas sale de KIND_META (nunca del input).
 */

const ScalarValue = z.union([z.string().max(2000), z.number(), z.boolean()])
const PropKey = z.string().regex(/^[a-z0-9_]{1,40}$/i, 'clave de propiedad inválida')

export const ObjectPropertiesBody = z
  .object({
    kind: z.enum(OBJECT_KINDS),
    id: z.string().uuid(),
    setProps: z.record(PropKey, ScalarValue).optional(),
    unsetProps: z.array(PropKey).max(50).optional(),
    setTags: z.array(z.string().min(1).max(120)).max(100).optional(),
  })
  .refine(
    (b) =>
      (b.setProps && Object.keys(b.setProps).length > 0) ||
      (b.unsetProps && b.unsetProps.length > 0) ||
      b.setTags !== undefined,
    { message: 'nada para actualizar (setProps / unsetProps / setTags)' },
  )
export type ObjectPropertiesInput = z.infer<typeof ObjectPropertiesBody>

/** Construye el UPDATE (puro, parametrizado). */
export function buildPropertiesUpdate(input: ObjectPropertiesInput): SqlBuilder {
  const meta = KIND_META[input.kind]
  const b = new SqlBuilder()
  b.raw(`UPDATE ${meta.table} SET `)

  let first = true
  const sep = () => {
    if (!first) b.raw(', ')
    first = false
  }

  const hasSet = input.setProps && Object.keys(input.setProps).length > 0
  const hasUnset = input.unsetProps && input.unsetProps.length > 0
  if (hasSet || hasUnset) {
    sep()
    b.raw('properties = (properties')
    if (hasUnset) b.raw(' - ').param(input.unsetProps).raw('::text[]')
    b.raw(')')
    if (hasSet) b.raw(' || ').param(JSON.stringify(input.setProps)).raw('::jsonb')
  }
  if (input.setTags !== undefined) {
    sep()
    b.raw('tags = ').param(input.setTags).raw('::text[]')
  }
  sep()
  b.raw('updated_at = NOW()')
  b.raw(' WHERE id = ').param(input.id).raw('::uuid AND deleted_at IS NULL RETURNING id')
  return b
}

export async function applyObjectProperties(
  sql: SqlClient,
  input: ObjectPropertiesInput,
): Promise<{ id: string } | null> {
  const b = buildPropertiesUpdate(input)
  const tagged = sql as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>
  const rows = await sqlTyped<{ id: string }>(
    tagged(asTemplateStrings(b.parts), ...b.values),
  )
  return rows[0] ?? null
}
