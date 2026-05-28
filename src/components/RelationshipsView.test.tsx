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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/relationships')) {
        return jsonResp({ items: [], nextCursor: null })
      }
      if (url.includes('/api/entities')) {
        return jsonResp([])
      }
      return jsonResp([])
    }),
  )
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
      expect(
        screen.getByText(/Una relación necesita dos/i),
      ).toBeInTheDocument()
    })
  })
})
