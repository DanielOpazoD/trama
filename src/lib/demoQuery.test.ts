import { describe, expect, it } from 'vitest'
import { demoQueryResponse, runDemoQuery, type DemoQueryTables } from './demoQuery'

const TABLAS: DemoQueryTables = {
  entities: [
    {
      id: 'e-1',
      name: 'Jorge Luis Borges',
      description: 'escritor',
      created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'e-2',
      name: 'Clarice Lispector',
      description: 'escritora',
      created_at: '2026-01-03T00:00:00Z',
    },
    {
      id: 'e-3',
      name: 'Borrada',
      description: 'borges',
      created_at: '2026-01-04T00:00:00Z',
      deleted_at: '2026-02-01T00:00:00Z',
    },
  ],
  quotes: [
    {
      id: 'q-1',
      text: 'El tiempo es la sustancia',
      source: 'Borges',
      created_at: '2026-01-05T00:00:00Z',
    },
  ],
  momentos: [
    {
      id: 'm-1',
      payload: { bodyText: 'Releí a Bórges en el tren' },
      note: null,
      created_at: '2026-01-06T00:00:00Z',
    },
  ],
  notes: [
    {
      id: 'n-1',
      title: null,
      content: 'Idea: borges y el laberinto',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

describe('demoQuery', () => {
  it('preguntar cae al fallback de texto sobre los cuatro tipos, lo más nuevo primero', () => {
    const res = demoQueryResponse(TABLAS, true, { q: 'Borges' })
    expect(res).toMatchObject({
      source: 'fallback',
      nextCursor: null,
      query: {
        from: ['entity', 'quote', 'momento', 'note'],
        where: { op: 'matches', value: 'Borges' },
      },
    })
    expect(res.items.map((hit) => hit.id)).toEqual(['m-1', 'q-1', 'e-1', 'n-1'])
  })

  it('ignora lo borrado y exige todos los términos, sin tildes', () => {
    const borges = runDemoQuery(TABLAS, {
      from: ['entity'],
      where: { op: 'matches', value: 'borges' },
    })
    expect(borges.items.map((hit) => hit.id)).toEqual(['e-1'])
    const dos = runDemoQuery(TABLAS, {
      from: ['note'],
      where: { op: 'matches', value: 'borges ciudad' },
    })
    expect(dos.items).toEqual([])
  })

  it('sin «matches» devuelve lo más reciente de los tipos pedidos', () => {
    expect(runDemoQuery(TABLAS, { from: ['entity'] }).items.map((hit) => hit.id)).toEqual(
      ['e-2', 'e-1'],
    )
  })
})
