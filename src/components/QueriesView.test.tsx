import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { QueriesView } from './QueriesView'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const NL_RESPONSE = {
  query: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
  items: [
    {
      kind: 'entity',
      id: 'e1',
      title: 'Borges',
      snippet: 'escritor',
      createdAt: '2024-01-01',
      tags: [],
    },
  ],
  nextCursor: null,
  source: 'llm',
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/query/nl')) return jsonResponse(NL_RESPONSE)
      if (url.includes('/api/saved-queries')) return jsonResponse({ items: [] })
      return jsonResponse({})
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('<QueriesView />', () => {
  it('preguntar → muestra resultados, la fuente y el AST interpretado', async () => {
    renderWithProviders(<QueriesView />)
    const input = screen.getByPlaceholderText(/filósofos/i)
    fireEvent.change(input, { target: { value: 'personas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }))

    expect(await screen.findByText('Borges')).toBeInTheDocument()
    expect(screen.getByText('interpretado por IA')).toBeInTheDocument()
    expect(screen.getByText('Ver consulta interpretada')).toBeInTheDocument()
    // Tras un resultado nuevo, se ofrece guardarlo / embeberlo.
    expect(screen.getByPlaceholderText(/Nombre para guardar/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copiar bloque embebible' }),
    ).toBeInTheDocument()
  })
})
