import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type SpotifyLibrarySnapshot } from '../api'
import { renderWithProviders } from '../test-utils'
import { MusicPaletteCard } from './MusicPaletteCard'

const STORAGE_KEY = 'trama:music-palette'

const snapshot: SpotifyLibrarySnapshot = {
  savedCount: 1234,
  topGenres: [
    { name: 'art pop', weight: 0.7 },
    { name: 'ambient', weight: 0.3 },
  ],
  topArtists: [
    { name: 'Björk', popularity: 80, genres: ['art pop'] },
    { name: 'Brian Eno', popularity: 70, genres: ['ambient'] },
  ],
  topTracks: [
    { name: 'Jóga', artists: ['Björk'], year: 1997 },
    { name: 'An Ending', artists: ['Brian Eno'], year: 1983 },
  ],
  decades: [
    { decade: '1990s', count: 8 },
    { decade: '1980s', count: 4 },
  ],
  aiSummary: 'Tu escucha cruza textura ambiental con drama de cámara.',
  provider: 'openai',
  model: 'gpt-test',
}

function cacheSnapshot(generatedAt: string, data: SpotifyLibrarySnapshot = snapshot) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ generatedAt, data }))
}

describe('<MusicPaletteCard />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('genera la paleta, la guarda en cache y muestra el retrato musical', async () => {
    vi.spyOn(api, 'spotifyLibrarySnapshot').mockResolvedValue(snapshot)

    renderWithProviders(<MusicPaletteCard />)

    expect(screen.getByRole('region', { name: /tu paleta musical/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar paleta/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /generar paleta/i }))

    expect(
      await screen.findByText('Tu escucha cruza textura ambiental con drama de cámara.'),
    ).toBeInTheDocument()
    expect(screen.getByText('art pop')).toBeInTheDocument()
    expect(screen.getByText('ambient')).toBeInTheDocument()
    expect(screen.getByText('1990s')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText(/canciones con corazón/i).closest('span')).toHaveTextContent(
      /1234 canciones con corazón/i,
    )
    expect(screen.getByText(/Björk · Brian Eno/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /generado por openai · gpt-test/i }),
    ).toBeInTheDocument()

    const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(cached.data).toEqual(snapshot)
    expect(new Date(cached.generatedAt).getTime()).not.toBeNaN()
  })

  it('lee cache antiguo, marca stale y permite eliminar la paleta guardada', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    cacheSnapshot(staleDate)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithProviders(<MusicPaletteCard />)

    expect(screen.getByText(/ya pasó una semana/i)).toBeInTheDocument()
    expect(
      screen.getByText('Tu escucha cruza textura ambiental con drama de cámara.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: /generar paleta/i })).toBeInTheDocument()
  })

  it('ignora cache corrupto y conserva el empty state si falla la generación', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{malformed')
    vi.spyOn(api, 'spotifyLibrarySnapshot').mockRejectedValue(
      new Error('Spotify no respondió'),
    )

    renderWithProviders(<MusicPaletteCard />)

    expect(screen.getByRole('button', { name: /generar paleta/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /generar paleta/i }))

    await waitFor(() => {
      expect(screen.getByText('Spotify no respondió')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /generar paleta/i })).toBeEnabled()
  })
})
