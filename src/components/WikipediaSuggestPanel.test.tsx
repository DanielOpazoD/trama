import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type WikipediaSuggestion } from '../api'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import { WikipediaSuggestPanel } from './WikipediaSuggestPanel'

const borgesSuggestion: WikipediaSuggestion = {
  entityId: 'e-borges',
  entityName: 'Jorge Luis Borges',
  entityType: 'escritor',
  match: {
    title: 'Jorge Luis Borges',
    url: 'https://es.wikipedia.org/wiki/Jorge_Luis_Borges',
    description: 'Escritor argentino.',
  },
}

const noMatchSuggestion: WikipediaSuggestion = {
  entityId: 'e-sombra',
  entityName: 'La sombra inventada',
  entityType: 'concepto',
  match: null,
}

describe('<WikipediaSuggestPanel />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('asigna el enlace confirmado, invalida entidades y remueve la sugerencia', async () => {
    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const updateSpy = vi.spyOn(api, 'updateEntity').mockResolvedValue({
      id: 'e-borges',
      name: 'Jorge Luis Borges',
      type: 'escritor',
      wikipediaUrl: borgesSuggestion.match!.url,
      origin: { kind: 'manual' },
      createdAt: '2026-05-31T12:00:00.000Z',
      updatedAt: '2026-05-31T12:00:00.000Z',
    })

    renderWithProviders(
      <WikipediaSuggestPanel
        suggestions={[borgesSuggestion, noMatchSuggestion]}
        remaining
        onClose={vi.fn()}
      />,
      { queryClient },
    )

    expect(screen.getByText(/quedan más entidades/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /asignar enlace/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('e-borges', {
        wikipediaUrl: borgesSuggestion.match!.url,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.entities })
      expect(screen.queryByText('Jorge Luis Borges')).not.toBeInTheDocument()
      expect(screen.getByText(/sin resultado en Wikipedia/i)).toBeInTheDocument()
    })
  })

  it('descarta sugerencias sin resultado y permite cerrar cuando no quedan filas', () => {
    const onClose = vi.fn()

    renderWithProviders(
      <WikipediaSuggestPanel
        suggestions={[noMatchSuggestion]}
        remaining={false}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }))

    expect(screen.getByText(/no quedan sugerencias/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra error y mantiene la sugerencia si falla la asignación', async () => {
    vi.spyOn(api, 'updateEntity').mockRejectedValue(new Error('wikipedia caída'))

    renderWithProviders(
      <WikipediaSuggestPanel
        suggestions={[borgesSuggestion]}
        remaining={false}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /asignar enlace/i }))

    await waitFor(() => {
      expect(screen.getByText(/wikipedia caída/i)).toBeInTheDocument()
      expect(screen.getByText('Jorge Luis Borges')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /asignar enlace/i })).toBeEnabled()
    })
  })
})
