import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchPanel } from './SearchPanel'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('<SearchPanel />', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra pendientes de indexación y ejecuta batches hasta completar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ entities: 2, quotes: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({ processed: 2, remaining: { entities: 0, quotes: 1 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ processed: 1, remaining: { entities: 0, quotes: 0 } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<SearchPanel />)

    expect(
      await screen.findByText(/Sin indexar: 2 entidades, 1 citas/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /indexar lo pendiente/i }))

    await waitFor(() => {
      expect(screen.getByText(/Todo indexado/i)).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('deshabilita la acción cuando no hay pendientes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ entities: 0, quotes: 0 })),
    )

    render(<SearchPanel />)

    expect(await screen.findByText(/Todo indexado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /indexar lo pendiente/i })).toBeDisabled()
  })
})
