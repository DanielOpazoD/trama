import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { XPanel } from './XPanel'

describe('<XPanel />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra cuenta conectada y sincroniza bookmarks', async () => {
    vi.spyOn(api, 'xStatus').mockResolvedValue({
      connected: true,
      needsReconnect: false,
      username: 'dani',
      xUserId: 'x-1',
      lastSyncedAt: '2026-05-31T10:00:00Z',
      counts: { totalBookmarks: 9 },
    })
    const syncSpy = vi.spyOn(api, 'xSync').mockResolvedValue({
      fetched: 4,
      inserted: 2,
      classified: 1,
    })

    renderWithProviders(<XPanel />)

    expect(await screen.findByText(/Conectado como/i)).toBeInTheDocument()
    expect(screen.getByText('@dani')).toBeInTheDocument()
    expect(screen.getByText(/9 bookmarks guardados/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /sincronizar ahora/i }))

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledOnce()
    })
    expect(
      await screen.findByText(/Sincronizado: 2 bookmarks nuevos/i),
    ).toBeInTheDocument()
  })

  it('muestra retorno OAuth fallido y permite iniciar conexión', async () => {
    vi.spyOn(api, 'xStatus').mockResolvedValue({ connected: false })
    vi.spyOn(api, 'xLogin').mockResolvedValue({})

    renderWithProviders(<XPanel oauthReturn={{ provider: 'x', ok: false, code: null }} />)

    expect(await screen.findByText(/No se pudo conectar con X/i)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /conectar con x/i }))
    expect(await screen.findByText(/X no está disponible/i)).toBeInTheDocument()
  })
})
