import { describe, expect, it } from 'vitest'
import { compileQuery, encodeCursor, QueryCompileError } from './compile'
import type { QueryInput } from './ast'

function compile(input: QueryInput) {
  const { builder, limit } = compileQuery(input)
  return { text: builder.toText(), values: builder.values, limit }
}

describe('compileQuery — estructura básica', () => {
  it('eq sobre un campo del kind → SQL parametrizado', () => {
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'type', op: 'eq', value: 'persona' },
    })
    expect(text).toContain('FROM entities WHERE deleted_at IS NULL AND')
    expect(text).toContain('type = $1')
    expect(text).toContain('ORDER BY q.sort_val DESC, q.id DESC')
    expect(values).toContain('persona')
  })

  it('limit por defecto pide limit+1 (para detectar siguiente página)', () => {
    const { values } = compile({ from: ['entity'] })
    expect(values[values.length - 1]).toBe(26) // 25 default + 1
  })

  it('respeta limit explícito', () => {
    const { values } = compile({ from: ['note'], limit: 10 })
    expect(values[values.length - 1]).toBe(11)
  })
})

describe('compileQuery — combinadores', () => {
  it('and/or/not anidados', () => {
    const { text } = compile({
      from: ['entity'],
      where: {
        and: [
          { field: 'type', op: 'eq', value: 'persona' },
          {
            or: [
              { field: 'year', op: 'gte', value: 1900 },
              { not: { field: 'year', op: 'lt', value: 1800 } },
            ],
          },
        ],
      },
    })
    expect(text).toContain(' AND ')
    expect(text).toContain(' OR ')
    expect(text).toContain('NOT (')
  })

  it('between en fechas castea a timestamptz', () => {
    const { text, values } = compile({
      from: ['momento'],
      where: { field: 'captured_at', op: 'between', value: ['2024-01-01', '2024-12-31'] },
    })
    expect(text).toContain('captured_at BETWEEN $1::timestamptz AND $2::timestamptz')
    expect(values).toEqual(['2024-01-01', '2024-12-31', 26])
  })

  it('in expande a un parámetro por elemento', () => {
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'year', op: 'in', value: [1960, 1980] },
    })
    expect(text).toContain('year IN ($1, $2)')
    expect(values).toEqual([1960, 1980, 26])
  })
})

describe('compileQuery — tags y texto', () => {
  it('tags has_any → && ::text[] sólo en kinds con tags', () => {
    const { text, values } = compile({
      from: ['note'],
      where: { field: 'tags', op: 'has_any', value: ['work', 'idea'] },
    })
    expect(text).toContain('tags && $1::text[]')
    expect(values[0]).toEqual(['work', 'idea'])
  })

  it('matches usa FTS donde hay search_vector, ILIKE donde no', () => {
    const ent = compile({ from: ['entity'], where: { op: 'matches', value: 'borges' } })
    expect(ent.text).toContain("search_vector @@ websearch_to_tsquery('simple', $1)")
    const note = compile({ from: ['note'], where: { op: 'matches', value: 'borges' } })
    expect(note.text).toContain('content ILIKE $1')
    expect(note.values[0]).toBe('%borges%')
  })
})

describe('compileQuery — cross-tipo', () => {
  it('campo no aplicable a un kind compila a FALSE para ese kind', () => {
    const { text } = compile({
      from: ['entity', 'note'],
      where: { field: 'year', op: 'gte', value: 1900 },
    })
    expect(text).toContain('UNION ALL')
    // entity tiene year; note no → FALSE
    expect(text).toContain('year >= $1')
    expect(text).toContain('FALSE')
  })

  it('dedup de kinds repetidos', () => {
    const { text } = compile({ from: ['entity', 'entity'] })
    expect(text.match(/FROM entities/g)?.length).toBe(1)
  })
})

describe('compileQuery — cursor / keyset', () => {
  it('agrega WHERE keyset cuando hay cursor', () => {
    const cursor = encodeCursor({ v: '2024-06-01T00:00:00Z', id: 'abc' })
    const { text, values } = compile({ from: ['entity'], cursor })
    expect(text).toContain('q.sort_val <')
    expect(text).toContain('q.id <')
    expect(values).toContain('2024-06-01T00:00:00Z')
    expect(values).toContain('abc')
  })

  it('cursor inválido lanza QueryCompileError', () => {
    expect(() => compile({ from: ['entity'], cursor: 'no-es-base64-json' })).toThrow(
      QueryCompileError,
    )
  })

  it('sort asc invierte el operador del keyset', () => {
    const cursor = encodeCursor({ v: '2024-06-01T00:00:00Z', id: 'abc' })
    const { text } = compile({
      from: ['entity'],
      cursor,
      sort: { field: 'created_at', dir: 'asc' },
    })
    expect(text).toContain('q.sort_val >')
    expect(text).toContain('ORDER BY q.sort_val ASC, q.id ASC')
  })
})

describe('compileQuery — validación y seguridad', () => {
  it('op no permitido para el campo lanza error', () => {
    expect(() =>
      compile({ from: ['entity'], where: { field: 'type', op: 'lt', value: 'x' } }),
    ).toThrow(/no permitido/)
  })

  it('condición demasiado anidada lanza error', () => {
    let cond: QueryInput['where'] = { field: 'type', op: 'eq', value: 'persona' }
    for (let i = 0; i < 8; i++) cond = { not: cond }
    expect(() => compile({ from: ['entity'], where: cond })).toThrow(/anidada/)
  })

  it('inyección: el valor queda como parámetro, nunca en el SQL', () => {
    const evil = "'; DROP TABLE entities; --"
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'name', op: 'eq', value: evil },
    })
    expect(text).not.toContain('DROP TABLE')
    expect(text).toContain('name = $1')
    expect(values).toContain(evil)
  })

  it('valor numérico inválido para campo number lanza error', () => {
    expect(() =>
      compile({ from: ['entity'], where: { field: 'year', op: 'eq', value: 'no-num' } }),
    ).toThrow(/numérico/)
  })
})

describe('compileQuery — Fase 2: propiedades, contains, exists, linked_to', () => {
  it('prop:<key> eq → properties ->> $key = $value (clave y valor parametrizados)', () => {
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'prop:team', op: 'eq', value: 'marketing' },
    })
    expect(text).toContain('properties ->> $1 = $2')
    expect(values).toEqual(['team', 'marketing', 26])
  })

  it('prop in expande valores', () => {
    const { text } = compile({
      from: ['note'],
      where: { field: 'prop:status', op: 'in', value: ['a', 'b'] },
    })
    expect(text).toContain('properties ->> $1 IN ($2, $3)')
  })

  it('prop exists → jsonb_exists con clave parametrizada', () => {
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'prop:team', op: 'exists' },
    })
    expect(text).toContain('jsonb_exists(properties, $1)')
    expect(values[0]).toBe('team')
  })

  it('clave de propiedad inválida lanza error', () => {
    expect(() =>
      compile({
        from: ['entity'],
        where: { field: 'prop:bad key!', op: 'eq', value: 'x' },
      }),
    ).toThrow(/clave de propiedad/)
  })

  it('contains en campo de texto → ILIKE parametrizado', () => {
    const { text, values } = compile({
      from: ['entity'],
      where: { field: 'name', op: 'contains', value: 'bor' },
    })
    expect(text).toContain('name ILIKE $1')
    expect(values[0]).toBe('%bor%')
  })

  it('tags has_any ahora aplica a entity (no FALSE)', () => {
    const { text } = compile({
      from: ['entity'],
      where: { field: 'tags', op: 'has_any', value: ['x'] },
    })
    expect(text).toContain('tags && $1::text[]')
    expect(text).not.toContain('FALSE')
  })

  it('linked_to compila distinto por kind', () => {
    const id = '00000000-0000-0000-0000-000000000001'
    expect(compile({ from: ['quote'], where: { op: 'linked_to', id } }).text).toContain(
      'entity_id = $1::uuid',
    )
    expect(compile({ from: ['momento'], where: { op: 'linked_to', id } }).text).toContain(
      'momento_entities',
    )
    expect(compile({ from: ['entity'], where: { op: 'linked_to', id } }).text).toContain(
      'relationships',
    )
    expect(compile({ from: ['note'], where: { op: 'linked_to', id } }).text).toContain(
      'FALSE',
    )
  })
})
