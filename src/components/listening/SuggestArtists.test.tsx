import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { SuggestArtists } from './SuggestArtists'

describe('<SuggestArtists />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra sugerencias devueltas por la IA', async () => {
    vi.spyOn(api, 'spotifySuggestArtists').mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      suggestions: [
        {
          name: 'Juana Molina',
          type: 'musico',
          description: 'Canciones oblicuas y textura íntima.',
          reason: 'Dialoga con tu perfil experimental.',
        },
      ],
    })

    renderWithProviders(<SuggestArtists />)

    await userEvent.click(screen.getByRole('button', { name: /descubrir/i }))

    expect(await screen.findByText('Juana Molina')).toBeInTheDocument()
    expect(screen.getByText(/Canciones oblicuas/i)).toBeInTheDocument()
    expect(screen.getByText(/Dialoga con tu perfil experimental/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '↗' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/search/Juana%20Molina',
    )
  })

  it('muestra la razón editorial cuando no hay sugerencias', async () => {
    vi.spyOn(api, 'spotifySuggestArtists').mockResolvedValue({
      provider: null,
      model: null,
      suggestions: [],
      reason: 'Todavía no hay suficientes artistas escuchados.',
    })

    renderWithProviders(<SuggestArtists />)

    await userEvent.click(screen.getByRole('button', { name: /descubrir/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Todavía no hay suficientes artistas escuchados.'),
      ).toBeInTheDocument()
    })
  })
})
