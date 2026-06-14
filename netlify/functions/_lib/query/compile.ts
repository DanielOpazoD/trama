import type { Condition, ObjectKind, Predicate, QueryInput, Sort } from './ast.js'
import { FIELDS, KIND_META, type CompareOp, type FieldDef } from './field-registry.js'
import { SqlBuilder } from './builder.js'

/**
 * Compilador AST → SQL parametrizado (puro, sin DB). Reglas de seguridad:
 * - Los nombres de tabla/columna/op salen SOLO del whitelist (`field-registry`).
 * - Todo valor del usuario va como parámetro (`builder.param`), nunca interpolado.
 * - Un campo que no aplica a un kind compila a FALSE (no rompe queries cross-tipo).
 * - Profundidad acotada (anti-DoS).
 *
 * Produce un `SqlBuilder` (parts+values) que el executor pasa al tagged template
 * del cliente RLS — nunca un string crudo.
 */
export class QueryCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryCompileError'
  }
}

const MAX_DEPTH = 6
const DEFAULT_LIMIT = 25
const DEFAULT_SORT: Sort = { field: 'created_at', dir: 'desc' }

export type CompiledQuery = { builder: SqlBuilder; limit: number; sort: Sort }
type Cursor = { v: string; id: string }

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}
function decodeCursor(raw: string): Cursor {
  try {
    const obj: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (
      obj &&
      typeof obj === 'object' &&
      typeof (obj as Cursor).v === 'string' &&
      typeof (obj as Cursor).id === 'string'
    ) {
      return obj as Cursor
    }
  } catch {
    /* cae al throw de abajo */
  }
  throw new QueryCompileError('cursor inválido')
}

function depthOf(cond: Condition, d = 1): number {
  if ('and' in cond) return Math.max(...cond.and.map((c) => depthOf(c, d + 1)))
  if ('or' in cond) return Math.max(...cond.or.map((c) => depthOf(c, d + 1)))
  if ('not' in cond) return depthOf(cond.not, d + 1)
  return d
}

function coerce(def: FieldDef, value: string | number | boolean): unknown {
  if (def.type === 'number' && typeof value === 'string') {
    const n = Number(value)
    if (!Number.isFinite(n))
      throw new QueryCompileError(`valor numérico inválido: ${value}`)
    return n
  }
  if (def.type === 'bool' && typeof value !== 'boolean') {
    return value === 'true'
  }
  return value
}

/** Cast a aplicar al placeholder de un valor según el campo. */
function castFor(def: FieldDef): string {
  if (def.cast) return def.cast
  if (def.type === 'date') return '::timestamptz'
  return ''
}

function compilePredicate(b: SqlBuilder, kind: ObjectKind, pred: Predicate): void {
  const meta = KIND_META[kind]

  if (pred.op === 'matches') {
    if (meta.fts) {
      b.raw(`${meta.fts} @@ websearch_to_tsquery('simple', `).param(pred.value).raw(')')
    } else if (meta.ftsFallback) {
      b.raw(`${meta.ftsFallback} ILIKE `).param(`%${pred.value}%`)
    } else {
      b.raw('FALSE')
    }
    return
  }

  if (pred.op === 'has_any' || pred.op === 'has_all') {
    if (!meta.hasTags) {
      b.raw('FALSE')
      return
    }
    const opSql = pred.op === 'has_all' ? '@>' : '&&'
    b.raw(`tags ${opSql} `).param(pred.value).raw('::text[]')
    return
  }

  // Predicado de comparación sobre un campo nombrado.
  const def = FIELDS[kind][pred.field]
  if (!def) {
    b.raw('FALSE') // campo no aplica a este kind
    return
  }
  if (!def.ops.includes(pred.op as CompareOp)) {
    throw new QueryCompileError(`op '${pred.op}' no permitido para campo '${pred.field}'`)
  }
  const col = def.sql
  const cast = castFor(def)

  switch (pred.op) {
    case 'eq':
      b.raw(`${col} = `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'neq':
      b.raw(`${col} <> `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'lt':
      b.raw(`${col} < `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'lte':
      b.raw(`${col} <= `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'gt':
      b.raw(`${col} > `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'gte':
      b.raw(`${col} >= `).param(coerce(def, pred.value)).raw(cast)
      return
    case 'between': {
      const [lo, hi] = pred.value
      b.raw(`${col} BETWEEN `)
        .param(coerce(def, lo))
        .raw(`${cast} AND `)
        .param(coerce(def, hi))
        .raw(cast)
      return
    }
    case 'in': {
      b.raw(`${col} IN (`)
      pred.value.forEach((v, i) => {
        if (i > 0) b.raw(', ')
        b.param(coerce(def, v)).raw(cast)
      })
      b.raw(')')
      return
    }
  }
}

function compileCondition(b: SqlBuilder, kind: ObjectKind, cond: Condition): void {
  if ('and' in cond) {
    b.raw('(')
    cond.and.forEach((c, i) => {
      if (i > 0) b.raw(' AND ')
      compileCondition(b, kind, c)
    })
    b.raw(')')
    return
  }
  if ('or' in cond) {
    b.raw('(')
    cond.or.forEach((c, i) => {
      if (i > 0) b.raw(' OR ')
      compileCondition(b, kind, c)
    })
    b.raw(')')
    return
  }
  if ('not' in cond) {
    b.raw('NOT (')
    compileCondition(b, kind, cond.not)
    b.raw(')')
    return
  }
  compilePredicate(b, kind, cond)
}

export function compileQuery(input: QueryInput): CompiledQuery {
  const sort = input.sort ?? DEFAULT_SORT
  const limit = input.limit ?? DEFAULT_LIMIT
  const kinds = [...new Set(input.from)] as ObjectKind[]

  if (input.where && depthOf(input.where) > MAX_DEPTH) {
    throw new QueryCompileError(`condición demasiado anidada (máx ${MAX_DEPTH})`)
  }
  const cursor = input.cursor ? decodeCursor(input.cursor) : null

  const b = new SqlBuilder()
  b.raw('SELECT kind, id, title, snippet, sort_val, created_at, tags FROM (')

  kinds.forEach((kind, i) => {
    if (i > 0) b.raw(' UNION ALL ')
    const meta = KIND_META[kind]
    const sortExpr = sort.field === 'occurred_at' ? meta.occurredAt : 'created_at'
    b.raw(
      `SELECT '${kind}'::text AS kind, id, (${meta.title}) AS title, ` +
        `(${meta.snippet}) AS snippet, (${sortExpr}) AS sort_val, created_at, ` +
        `(${meta.tags}) AS tags FROM ${meta.table} WHERE deleted_at IS NULL AND `,
    )
    if (input.where) compileCondition(b, kind, input.where)
    else b.raw('TRUE')
  })

  b.raw(') q')

  if (cursor) {
    const cmp = sort.dir === 'desc' ? '<' : '>'
    b.raw(` WHERE (q.sort_val ${cmp} `)
      .param(cursor.v)
      .raw('::timestamptz OR (q.sort_val = ')
      .param(cursor.v)
      .raw(`::timestamptz AND q.id ${cmp} `)
      .param(cursor.id)
      .raw('::uuid))')
  }

  const dir = sort.dir === 'desc' ? 'DESC' : 'ASC'
  b.raw(` ORDER BY q.sort_val ${dir}, q.id ${dir} LIMIT `).param(limit + 1)

  return { builder: b, limit, sort }
}
