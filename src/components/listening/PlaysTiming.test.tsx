import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { PlaysTiming } from './PlaysTiming'

describe('<PlaysTiming />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('no consulta la API cuando está deshabilitado', () => {
    const timingSpy = vi.spyOn(api, 'spotifyTiming')
    const { container } = renderWithProviders(
      <PlaysTiming since="2026-05-01T00:00:00.000Z" enabled={false} />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(timingSpy).not.toHaveBeenCalled()
  })

  it('usa el loading editorial mientras calcula el patrón temporal', () => {
    vi.spyOn(api, 'spotifyTiming').mockReturnValue(new Promise(() => {}))

    renderWithProviders(<PlaysTiming since="2026-05-01T00:00:00.000Z" enabled />)

    expect(screen.getByText('cargando patrón temporal…').closest('[role="status"]')).toBe(
      screen.getByRole('status'),
    )
  })

  it('renderiza heatmap y tendencia cuando hay plays', async () => {
    vi.spyOn(api, 'spotifyTiming').mockResolvedValue({
      since: '2026-05-01T00:00:00.000Z',
      truncated: false,
      playedAts: [
        new Date(2026, 4, 4, 22, 0).toISOString(),
        new Date(2026, 4, 4, 22, 15).toISOString(),
        new Date(2026, 4, 5, 9, 30).toISOString(),
      ],
    })

    renderWithProviders(<PlaysTiming since="2026-05-01T00:00:00.000Z" enabled />)

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /patrón temporal de escuchas/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByText(/3 plays/i)).toBeInTheDocument()
    expect(screen.getByText(/semana × hora/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /trend diario/i })).toBeInTheDocument()
    expect(screen.getByTitle(/L 22h.*2 plays/i)).toBeInTheDocument()
  })

  it('no renderiza chrome si la API devuelve lista vacía', async () => {
    vi.spyOn(api, 'spotifyTiming').mockResolvedValue({
      since: '2026-05-01T00:00:00.000Z',
      truncated: false,
      playedAts: [],
    })

    const { container } = renderWithProviders(
      <PlaysTiming since="2026-05-01T00:00:00.000Z" enabled />,
    )

    await waitFor(() => {
      expect(api.spotifyTiming).toHaveBeenCalled()
      expect(container).toBeEmptyDOMElement()
    })
  })
})
