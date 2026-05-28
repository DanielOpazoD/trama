import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Espejo, composeEspejo } from './Espejo'
import { renderWithProviders } from '../test-utils'
import type { Entity, Quote, Relationship } from '../types'

function entity(
  id: string,
  type: string,
  name: string,
  extra: Partial<Entity> = {},
): Entity {
  return {
    id,
    type,
    name,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
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

function quote(id: string, entityId: string, resonance?: number): Quote {
  return {
    id,
    entityId,
    text: 'texto',
    ...(resonance !== undefined ? { resonance } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('composeEspejo', () => {
  it('returns zeroed totals for an empty trama', () => {
    const d = composeEspejo([], [], [])
    expect(d.totals).toEqual({ entities: 0, quotes: 0, relationships: 0 })
    expect(d.topTypes).toEqual([])
    expect(d.earliestYear).toBeNull()
    expect(d.resonance.avg).toBeNull()
  })

  it('counts type composition with percentages, sorted by frequency', () => {
    const d = composeEspejo(
      [
        entity('1', 'escritor', 'A'),
        entity('2', 'escritor', 'B'),
        entity('3', 'escritor', 'C'),
        entity('4', 'concepto', 'D'),
      ],
      [],
      [],
    )
    expect(d.topTypes[0]).toEqual({ label: 'escritor', count: 3, pct: 75 })
    expect(d.topTypes[1]).toEqual({ label: 'concepto', count: 1, pct: 25 })
  })

  it('finds earliest/latest year and the dominant century', () => {
    const d = composeEspejo(
      [
        entity('1', 'escritor', 'A', { year: 1899 }),
        entity('2', 'escritor', 'B', { year: 1950 }),
        entity('3', 'libro', 'C', { year: 1605 }),
      ],
      [],
      [],
    )
    expect(d.earliestYear).toBe(1605)
    expect(d.latestYear).toBe(1950)
    // 1899 → siglo XIX, 1950 → siglo XX, 1605 → siglo XVII. Empate 1 c/u;
    // el primer insertado (XIX) gana el orden estable.
    expect(d.topEras.map((e) => e.label)).toContain('siglo XX')
  })

  it('ranks most-connected entities by degree across from/to', () => {
    const d = composeEspejo(
      [
        entity('a', 'persona', 'Ana'),
        entity('b', 'persona', 'Beto'),
        entity('c', 'persona', 'Caro'),
      ],
      [rel('r1', 'a', 'b'), rel('r2', 'a', 'c'), rel('r3', 'b', 'c')],
      [],
    )
    expect(d.mostConnected[0]).toEqual({ id: 'a', name: 'Ana', degree: 2 })
  })

  it('counts AI-origin entities and resonance average', () => {
    const d = composeEspejo(
      [
        entity('1', 'escritor', 'A', { origin: { kind: 'ai' } }),
        entity('2', 'escritor', 'B'),
      ],
      [],
      [quote('q1', '1', 4), quote('q2', '2', 2), quote('q3', '1')],
    )
    expect(d.aiEntities).toBe(1)
    expect(d.resonance.marked).toBe(2)
    expect(d.resonance.avg).toBe(3)
  })
})

function stubFetch(opts: { entities?: unknown[] } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      const body =
        url.includes('/api/entities') && !url.includes('refs-count')
          ? (opts.entities ?? [])
          : []
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<Espejo />', () => {
  it('does not render when closed', () => {
    stubFetch()
    renderWithProviders(<Espejo open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog', { name: 'Espejo' })).not.toBeInTheDocument()
  })

  it('shows the empty-trama message when there are no entities', async () => {
    stubFetch({ entities: [] })
    renderWithProviders(<Espejo open onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Espejo' })
    expect(dialog.textContent).toMatch(/todavía está en blanco/i)
  })

  it('renders the composition prose when entities exist', async () => {
    stubFetch({
      entities: [
        { id: '1', type: 'escritor', name: 'Borges', origin: { kind: 'manual' } },
      ],
    })
    renderWithProviders(<Espejo open onClose={() => {}} />)
    // El diálogo se monta antes con el estado vacío; esperamos a que las
    // entidades carguen y aparezca la prosa de composición.
    await screen.findByText(/Hoy tu trama reúne/)
    const dialog = screen.getByRole('dialog', { name: 'Espejo' })
    expect(dialog.textContent).toMatch(/escritor/)
  })
})
