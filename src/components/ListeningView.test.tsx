import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListeningView } from './ListeningView'
import { renderWithProviders } from '../test-utils'

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockSpotifyFetch({
  connected = false,
  plays = {
    group: 'artist',
    since: '2026-05-01T00:00:00Z',
    summary: {
      totalPlays: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      uniqueAlbums: 0,
      totalMinutes: 0,
    },
    items: [],
  },
}: {
  connected?: boolean
  plays?: unknown
} = {}) {
  const fetchMock = vi.fn(async (input: string | Request | URL) => {
    const url = String(input)
    if (url.includes('/api/spotify/status')) {
      return jsonResp(
        connected
          ? {
              connected: true,
              spotifyUserId: 'spotify-1',
              displayName: 'Daniel',
              connectedAt: '2026-05-01T00:00:00Z',
              lastSyncedAt: '2026-05-31T10:00:00Z',
              counts: {
                totalPlays: 42,
                uniqueTracks: 12,
                mostRecentPlay: '2026-05-31T10:00:00Z',
              },
            }
          : { connected: false },
      )
    }
    if (url.includes('/api/spotify/plays')) {
      return jsonResp(plays)
    }
    if (url.includes('/api/spotify/timing')) {
      return jsonResp({ since: '2026-05-01T00:00:00Z', playedAts: [], truncated: false })
    }
    return jsonResp([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  mockSpotifyFetch()
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
      expect(screen.getByText(/Spotify aún no está conectado/i)).toBeInTheDocument()
    })
  })

  it('renders connected plays with summary, authorship and existing entity action', async () => {
    const onSelectEntity = vi.fn()
    mockSpotifyFetch({
      connected: true,
      plays: {
        group: 'artist',
        since: '2026-05-01T00:00:00Z',
        summary: {
          totalPlays: 12,
          uniqueTracks: 5,
          uniqueArtists: 2,
          uniqueAlbums: 3,
          totalMinutes: 480,
        },
        items: [
          {
            key: 'Y2K Cataclysm',
            plays: 12,
            firstPlayed: '2026-05-20T10:00:00Z',
            lastPlayed: '2026-05-30T10:00:00Z',
            existingEntityId: 'ent-spotify-1',
            spotifyId: 'spotify-track-1',
            artists: ['Alicia', 'Bruno', 'Carla'],
          },
        ],
      },
    })

    renderWithProviders(<ListeningView onSelectEntity={onSelectEntity} />)

    expect(await screen.findByText('Y2K Cataclysm')).toBeInTheDocument()
    expect(screen.getByLabelText(/Resumen de escuchas/i)).toHaveTextContent(
      '8 horas de música',
    )
    expect(screen.getByTitle('Alicia, Bruno, Carla')).toHaveTextContent(
      'Alicia, Bruno +1',
    )

    await userEvent.click(screen.getByRole('button', { name: /en la trama/i }))
    expect(onSelectEntity).toHaveBeenCalledWith('ent-spotify-1')
  })

  it('refetches plays when changing group', async () => {
    const fetchMock = mockSpotifyFetch({
      connected: true,
      plays: {
        group: 'artist',
        since: '2026-05-01T00:00:00Z',
        summary: {
          totalPlays: 1,
          uniqueTracks: 1,
          uniqueArtists: 1,
          uniqueAlbums: 1,
          totalMinutes: 3,
        },
        items: [],
      },
    })

    renderWithProviders(<ListeningView />)

    await screen.findByRole('button', { name: 'Álbumes' })
    await userEvent.click(screen.getByRole('button', { name: 'Álbumes' }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/api/spotify/plays?group=album'),
        ),
      ).toBe(true)
    })
  })
})
