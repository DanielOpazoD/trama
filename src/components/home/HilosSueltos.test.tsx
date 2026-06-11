import { describe, it, expect } from 'vitest'
import { findHilosSueltos } from './HilosSueltos'
import { collectEfemerides } from './Efemerides'
import type { Entity, Quote, Relationship } from '../../types'

function entity(id: string, name: string, createdAt: string): Entity {
  return {
    id,
    type: 'escritor',
    name,
    origin: { kind: 'manual' },
    createdAt,
    updatedAt: createdAt,
  } as Entity
}

function rel(id: string, fromId: string, toId: string): Relationship {
  return {
    id,
    fromId,
    toId,
    type: 'influye_en',
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function quote(id: string, entityId: string, text: string, createdAt: string): Quote {
  return {
    id,
    entityId,
    text,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt,
    updatedAt: createdAt,
  }
}

describe('findHilosSueltos', () => {
  const ents = [
    entity('a', 'Borges', '2026-01-01T00:00:00.000Z'),
    entity('b', 'Piazzolla', '2026-02-01T00:00:00.000Z'),
    entity('c', 'Mistral', '2026-03-01T00:00:00.000Z'),
  ]

  it('devuelve solo entidades sin ninguna relación', () => {
    const sueltos = findHilosSueltos(ents, [rel('r1', 'a', 'b')])
    expect(sueltos.map((e) => e.id)).toEqual(['c'])
  })

  it('vacío cuando todo está conectado', () => {
    expect(findHilosSueltos(ents, [rel('r1', 'a', 'b'), rel('r2', 'b', 'c')])).toEqual([])
  })

  it('ordena por más reciente y respeta el límite', () => {
    const sueltos = findHilosSueltos(ents, [], 2)
    expect(sueltos.map((e) => e.id)).toEqual(['c', 'b'])
  })
})

describe('collectEfemerides', () => {
  // "Hoy" fijo: 10 de junio de 2026.
  const TODAY = new Date('2026-06-10T12:00:00')

  it('detecta citas y entidades del mismo día/mes de años anteriores', () => {
    const ents = [
      entity('a', 'Borges', '2024-06-10T08:00:00.000Z'),
      entity('b', 'Piazzolla', '2026-01-15T00:00:00.000Z'),
    ]
    const qs = [quote('q1', 'a', 'El sur ya existía', '2025-06-10T10:00:00.000Z')]
    const items = collectEfemerides(ents, qs, TODAY)
    expect(items).toHaveLength(2)
    // Más años primero: la entidad (2) antes que la cita (1).
    expect(items[0]).toMatchObject({ kind: 'entity', yearsAgo: 2, name: 'Borges' })
    expect(items[1]).toMatchObject({
      kind: 'quote',
      yearsAgo: 1,
      entityName: 'Borges',
    })
  })

  it('ignora lo creado hoy y otros días', () => {
    const ents = [
      entity('hoy', 'De hoy', '2026-06-10T08:00:00.000Z'),
      entity('otro', 'Otro día', '2025-06-09T08:00:00.000Z'),
    ]
    expect(collectEfemerides(ents, [], TODAY)).toEqual([])
  })

  it('cap a 3 elementos', () => {
    // Mediodía para que el día de calendario no se corra con la zona horaria.
    const ents = [
      entity('a', 'Uno', '2025-06-10T12:00:00.000Z'),
      entity('b', 'Dos', '2024-06-10T12:00:00.000Z'),
      entity('c', 'Tres', '2023-06-10T12:00:00.000Z'),
      entity('d', 'Cuatro', '2022-06-10T12:00:00.000Z'),
    ]
    expect(collectEfemerides(ents, [], TODAY)).toHaveLength(3)
  })
})
