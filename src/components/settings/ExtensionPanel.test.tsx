import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtensionPanel } from './ExtensionPanel'
import { renderWithProviders } from '../../test-utils'

/**
 * Conectar extensión: generar token (el claro aparece UNA vez), listar
 * con último uso y revocar. fetch mockeado por ruta.
 */

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const TOKEN_ROW = {
  id: 't1',
  label: 'extensión de Chrome',
  created_at: '2026-06-10T12:00:00.000Z',
  last_used_at: null,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/api/api-tokens') && method === 'POST') {
        return jsonResp({ ...TOKEN_ROW, token: 'trama_pat_visible_una_vez' }, 201)
      }
      if (url.includes('/api/api-tokens') && method === 'DELETE') {
        return jsonResp({ ok: true })
      }
      if (url.includes('/api/api-tokens')) return jsonResp([TOKEN_ROW])
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ExtensionPanel />', () => {
  it('lista tokens con creación y último uso, y permite revocar', async () => {
    renderWithProviders(<ExtensionPanel />)
    expect(await screen.findByText('extensión de Chrome')).toBeInTheDocument()
    expect(screen.getByText(/último uso nunca/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'revocar' }))
    // El toast vive en ToastHost (no montado acá) — verificamos el DELETE.
    await waitFor(() => {
      const spy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
      expect(
        spy.mock.calls.some(
          (c) => String(c[0]).includes('/api/api-tokens/t1') && c[1]?.method === 'DELETE',
        ),
      ).toBe(true)
    })
  })

  it('generar muestra el token en claro una sola vez, con copiar', async () => {
    renderWithProviders(<ExtensionPanel />)
    fireEvent.click(screen.getByRole('button', { name: /generar token/ }))
    expect(await screen.findByText('trama_pat_visible_una_vez')).toBeInTheDocument()
    expect(screen.getByText(/se muestra una sola vez/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /listo, lo guardé/ }))
    expect(screen.queryByText('trama_pat_visible_una_vez')).toBeNull()
  })
})
