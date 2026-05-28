import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { MomentosView } from './MomentosView'
import { renderWithProviders } from '../test-utils'

/**
 * Smoke tests para MomentosView. Verifica el render del shell (header,
 * composer, empty state) con responses vacíos. Por defecto el PIN no
 * está habilitado en tests, así que el AppPinGate (que está en App.tsx,
 * no acá) no aplica — solo el AppPinGate gate vive afuera del component
 * y nos da render directo.
 */

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
      if (url.includes('/api/momentos')) {
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

describe('<MomentosView />', () => {
  it('renders the view header with "Momentos" title', async () => {
    renderWithProviders(<MomentosView />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Momentos' }),
      ).toBeInTheDocument()
    })
  })

  it('renders the composer for capturing a new momento', async () => {
    renderWithProviders(<MomentosView />)
    await waitFor(() => {
      // El composer tiene tabs "Nota", "Recorte", "Foto"
      expect(screen.getByRole('button', { name: /^Nota$/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Recorte$/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Foto$/ })).toBeInTheDocument()
    })
  })

  it('shows the editorial empty message when no momentos exist', async () => {
    renderWithProviders(<MomentosView />)
    await waitFor(() => {
      expect(
        screen.getByText(/Todavía no hay momentos/i),
      ).toBeInTheDocument()
    })
  })
})
