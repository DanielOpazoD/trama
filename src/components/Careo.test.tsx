import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Careo, entitiesWithQuotes, findDirectRelation } from './Careo'
import { renderWithProviders } from '../test-utils'
import type { Entity, Quote, Relationship } from '../types'

function entity(id: string, name: string): Entity {
  return {
    id,
    type: 'escritor',
    name,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Entity
}

function quote(id: string, entityId: string, text: string): Quote {
  return {
    id,
    entityId,
    text,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const ENTITIES = [entity('a', 'Borges'), entity('b', 'Cortázar'), entity('c', 'Mistral')]
const QUOTES = [
  quote('q1', 'a', 'el sur'),
  quote('q2', 'a', 'el aleph'),
  quote('q3', 'b', 'la rayuela'),
]
const RELS: Relationship[] = [
  {
    id: 'r1',
    fromId: 'a',
    toId: 'b',
    type: 'influye_en',
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

describe('entitiesWithQuotes', () => {
  it('solo entidades con citas, ordenadas por cuántas tienen', () => {
    const out = entitiesWithQuotes(ENTITIES, QUOTES)
    expect(out.map((x) => x.entity.id)).toEqual(['a', 'b'])
    expect(out[0]!.count).toBe(2)
  })
})

describe('findDirectRelation', () => {
  it('encuentra la relación en cualquier dirección', () => {
    expect(findDirectRelation(RELS, 'a', 'b')?.type).toBe('influye_en')
    expect(findDirectRelation(RELS, 'b', 'a')?.type).toBe('influye_en')
    expect(findDirectRelation(RELS, 'a', 'c')).toBeNull()
  })
})

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/entities')) {
        return jsonResp(
          ENTITIES.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            origin: e.origin,
            created_at: e.createdAt,
            updated_at: e.updatedAt,
          })),
        )
      }
      if (url.includes('/api/quotes')) {
        return jsonResp(
          QUOTES.map((q) => ({
            id: q.id,
            entity_id: q.entityId,
            text: q.text,
            source: null,
            context: null,
            linked_quote_ids: [],
            origin: q.origin,
            created_at: q.createdAt,
            updated_at: q.updatedAt,
          })),
        )
      }
      if (url.includes('/api/relationships')) {
        return jsonResp(
          RELS.map((r) => ({
            id: r.id,
            from_id: r.fromId,
            to_id: r.toId,
            type: r.type,
            origin: r.origin,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
          })),
        )
      }
      return jsonResp([])
    }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<Careo />', () => {
  it('no renderiza cerrado', () => {
    renderWithProviders(<Careo open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog', { name: 'Careo' })).not.toBeInTheDocument()
  })

  it('enfrenta a las dos entidades con más citas y declara la relación', async () => {
    renderWithProviders(<Careo open onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Careo' })
    // Esperar a que la data cargue y el par inicial se fije.
    await screen.findByText('Borges')
    expect(dialog.textContent).toMatch(/el aleph/)
    expect(dialog.textContent).toMatch(/la rayuela/)
    expect(dialog.textContent).toMatch(/influye en/)
  })

  it('cierra con Escape', async () => {
    const onClose = vi.fn()
    renderWithProviders(<Careo open onClose={onClose} />)
    await screen.findByRole('dialog', { name: 'Careo' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
