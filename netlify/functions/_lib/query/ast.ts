import { z } from 'zod'

/**
 * AST de queries componibles de Trama (Fase 1 del motor de queries).
 *
 * Una query es un OBJETO serializable (no SQL): el cliente describe QUÉ quiere
 * ver y el compilador (`compile.ts`) lo traduce a SQL parametrizado y scopeado
 * por RLS. Nunca se interpola input del usuario en el SQL: los nombres de campo
 * salen del whitelist de `field-registry.ts` y los valores van como parámetros.
 *
 * Cubre la promesa "filtrá por tipo de objeto, fecha, tags y texto, combinando
 * condiciones". Semántico (`near`), propiedades de usuario y queries guardadas
 * son fases siguientes.
 */

export const OBJECT_KINDS = ['entity', 'quote', 'momento', 'note'] as const
export type ObjectKind = (typeof OBJECT_KINDS)[number]

/** Valor escalar admitido en un predicado de comparación. */
const ScalarValue = z.union([z.string().max(2000), z.number(), z.boolean()])

const FieldName = z.string().min(1).max(40)

const ComparePredicate = z.object({
  field: FieldName,
  op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains']),
  value: ScalarValue,
})
const BetweenPredicate = z.object({
  field: FieldName,
  op: z.literal('between'),
  value: z.tuple([ScalarValue, ScalarValue]),
})
const InPredicate = z.object({
  field: FieldName,
  op: z.literal('in'),
  value: z.array(ScalarValue).min(1).max(100),
})
const TagsPredicate = z.object({
  field: z.literal('tags'),
  op: z.enum(['has_any', 'has_all']),
  value: z.array(z.string().min(1).max(120)).min(1).max(50),
})
/** Texto libre: FTS (`websearch_to_tsquery`) donde hay search_vector; ILIKE si no. */
const MatchesPredicate = z.object({
  op: z.literal('matches'),
  value: z.string().min(1).max(200),
})
/** ¿Existe la propiedad/campo? (`prop:<key>` → jsonb_exists; columna → IS NOT NULL). */
const ExistsPredicate = z.object({
  field: FieldName,
  op: z.literal('exists'),
})
/** El objeto está vinculado a una entidad (cita→entidad, momento→junction, relación). */
const LinkedToPredicate = z.object({
  op: z.literal('linked_to'),
  id: z.string().uuid(),
})

export const Predicate = z.union([
  ComparePredicate,
  BetweenPredicate,
  InPredicate,
  TagsPredicate,
  MatchesPredicate,
  ExistsPredicate,
  LinkedToPredicate,
])
export type Predicate = z.infer<typeof Predicate>

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | Predicate

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(Condition).min(1).max(20) }),
    z.object({ or: z.array(Condition).min(1).max(20) }),
    z.object({ not: Condition }),
    Predicate,
  ]),
)

const Sort = z.object({
  field: z.enum(['created_at', 'occurred_at']),
  dir: z.enum(['asc', 'desc']),
})
export type Sort = z.infer<typeof Sort>

export const QueryBody = z.object({
  /** Tipos de objeto a consultar (al menos uno). */
  from: z.array(z.enum(OBJECT_KINDS)).min(1).max(OBJECT_KINDS.length),
  where: Condition.optional(),
  sort: Sort.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  /** Cursor keyset opaco devuelto por la respuesta anterior. */
  cursor: z.string().max(500).optional(),
  version: z.literal(1).optional(),
})
export type QueryInput = z.infer<typeof QueryBody>
