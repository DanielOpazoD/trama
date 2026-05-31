import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { RelationshipsView } from './RelationshipsView'
import { renderWithProviders } from '../test-utils'

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  const fetchMock = vi.fn(async (input: string | Request | URL) => {
    const url = String(input)
    if (url.includes('/api/counts')) {
      return jsonResp({ entities: 0, quotes: 0, relationships: 0, momentos: 0 })
    }
    if (url.includes('/api/relationships')) {
      return jsonResp({ items: [], nextCursor: null })
    }
    if (url.includes('/api/entities')) {
      return jsonResp([])
    }
    return jsonResp([])
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<RelationshipsView />', () => {
  it('renders the view header with "Vínculos" title', async () => {
    renderWithProviders(<RelationshipsView />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Vínculos' }),
      ).toBeInTheDocument()
    })
  })

  it('shows empty state when no relationships and <2 entities', async () => {
    renderWithProviders(<RelationshipsView />)
    await waitFor(() => {
      // Con 0 entidades el empty state es "Una relación necesita dos."
      expect(screen.getByText(/Una relación necesita dos/i)).toBeInTheDocument()
    })
  })

  it('no carga /api/entities wholesale para pintar la lista paginada', async () => {
    const fetchMock = vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/counts')) {
        return jsonResp({ entities: 2, quotes: 0, relationships: 1, momentos: 0 })
      }
      if (url.includes('/api/relationships')) {
        return jsonResp({
          items: [
            {
              id: 'r1',
              from_id: '11111111-1111-4111-8111-111111111111',
              from_name: 'Borges',
              to_id: '22222222-2222-4222-8222-222222222222',
              to_name: 'Ficciones',
              type: 'cita_a',
              notes: null,
              origin: { kind: 'manual' },
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
          nextCursor: null,
        })
      }
      return jsonResp([])
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<RelationshipsView />)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/api/relationships?'),
        ),
      ).toBe(true)
    })
    expect(screen.getByRole('button', { name: /Añadir/i })).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = String(input)
        return url.includes('/api/entities') && !url.includes('/api/entities-lookup')
      }),
    ).toBe(false)
  })
})
