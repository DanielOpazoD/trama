import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { ListeningView } from './ListeningView'
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
      if (url.includes('/api/spotify/status')) {
        return jsonResp({ connected: false })
      }
      if (url.includes('/api/spotify/plays')) {
        return jsonResp({ items: [], summary: null })
      }
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ListeningView />', () => {
  it('renders the view header with "Escuchas" title', async () => {
    renderWithProviders(<ListeningView />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Escuchas' }),
      ).toBeInTheDocument()
    })
  })

  it('shows "Spotify aún no está conectado" hint when not connected', async () => {
    renderWithProviders(<ListeningView />)
    await waitFor(() => {
      expect(
        screen.getByText(/Spotify aún no está conectado/i),
      ).toBeInTheDocument()
    })
  })
})
