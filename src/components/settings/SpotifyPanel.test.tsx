import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { SpotifyPanel } from './SpotifyPanel'

describe('<SpotifyPanel />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('usa el loading editorial mientras consulta Spotify', () => {
    vi.spyOn(api, 'spotifyStatus').mockReturnValue(new Promise(() => {}))

    renderWithProviders(<SpotifyPanel />)

    expect(screen.getByText('cargando…').closest('[role="status"]')).toBe(
      screen.getByRole('status'),
    )
  })

  it('muestra cuenta conectada y sincroniza manualmente', async () => {
    const statusSpy = vi.spyOn(api, 'spotifyStatus').mockResolvedValue({
      connected: true,
      spotifyUserId: 'sp-1',
      displayName: 'Daniel',
      connectedAt: '2026-05-30T10:00:00Z',
      lastSyncedAt: '2026-05-31T10:00:00Z',
      counts: {
        totalPlays: 42,
        uniqueTracks: 11,
        mostRecentPlay: '2026-05-31T10:30:00Z',
      },
    })
    const syncSpy = vi.spyOn(api, 'spotifySync').mockResolvedValue({
      fetched: 5,
      inserted: 3,
      mostRecentPlay: '2026-05-31T11:00:00Z',
    })

    renderWithProviders(<SpotifyPanel />)

    expect(await screen.findByText(/Conectado como/i)).toBeInTheDocument()
    expect(screen.getByText('Daniel')).toBeInTheDocument()
    expect(screen.getByText(/42 reproducciones/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /sincronizar ahora/i }))

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledOnce()
    })
    expect(
      await screen.findByText(/Sincronizado: 3 reproducciones nuevas/i),
    ).toBeInTheDocument()
    expect(statusSpy).toHaveBeenCalled()
  })

  it('muestra retorno OAuth fallido y permite iniciar conexión', async () => {
    vi.spyOn(api, 'spotifyStatus').mockResolvedValue({ connected: false })
    vi.spyOn(api, 'spotifyLogin').mockResolvedValue({})

    renderWithProviders(
      <SpotifyPanel oauthReturn={{ provider: 'spotify', ok: false, code: null }} />,
    )

    expect(
      await screen.findByText(/No se pudo conectar con Spotify/i),
    ).toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole('button', { name: /conectar con spotify/i }),
    )
    expect(await screen.findByText(/Spotify no está disponible/i)).toBeInTheDocument()
  })
})
