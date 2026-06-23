import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type DuplicateGroup } from '../api'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import { DuplicatesPanel } from './DuplicatesPanel'

const nameGroup: DuplicateGroup = {
  reason: 'name',
  entities: [
    { id: 'e-borges', name: 'Borges', type: 'escritor' },
    { id: 'e-borges-2', name: 'J. L. Borges', type: 'persona' },
  ],
}

const similarGroup: DuplicateGroup = {
  reason: 'similar',
  similarity: 0.87,
  entities: [
    { id: 'e-cortazar', name: 'Cortázar', type: 'escritor' },
    { id: 'e-rayuela', name: 'Rayuela', type: 'libro' },
  ],
}

describe('<DuplicatesPanel />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('combina conservando la entidad marcada e invalida los dominios tocados', async () => {
    const queryClient = makeQueryClient()
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve(undefined))
    const mergeSpy = vi.spyOn(api, 'mergeEntities').mockResolvedValue({
      id: 'e-rayuela',
      name: 'Rayuela',
      type: 'libro',
      origin: { kind: 'manual' },
      createdAt: '2026-05-31T12:00:00.000Z',
      updatedAt: '2026-05-31T12:00:00.000Z',
    })

    renderWithProviders(
      <DuplicatesPanel
        groups={[nameGroup, similarGroup]}
        embeddingSkipped={false}
        onClose={vi.fn()}
      />,
      { queryClient },
    )

    fireEvent.click(screen.getByLabelText(/Rayuela/i))
    fireEvent.click(screen.getAllByRole('button', { name: /combinar/i })[1]!)

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalledWith('e-rayuela', ['e-cortazar'])
      expect(screen.queryByText(/similar · 87%/i)).not.toBeInTheDocument()
      expect(screen.getByText(/nombre idéntico/i)).toBeInTheDocument()
    })

    expect(invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.entities,
      queryKeys.relationships,
      queryKeys.quotes,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.entitiesInfinite,
      queryKeys.relationshipsInfinite,
      queryKeys.quotesInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
      queryKeys.momentosInfinite,
    ])
  })

  it('descarta grupos localmente y permite cerrar cuando no quedan duplicados', () => {
    const onClose = vi.fn()

    renderWithProviders(
      <DuplicatesPanel groups={[nameGroup]} embeddingSkipped onClose={onClose} />,
    )

    expect(screen.getByText(/solo por nombre/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }))

    expect(screen.getByText(/no quedan grupos/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra el error de merge y mantiene el grupo para reintentar', async () => {
    vi.spyOn(api, 'mergeEntities').mockRejectedValue(new Error('merge bloqueado'))

    renderWithProviders(
      <DuplicatesPanel groups={[nameGroup]} embeddingSkipped={false} onClose={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /combinar/i }))

    await waitFor(() => {
      expect(screen.getByText(/merge bloqueado/i)).toBeInTheDocument()
      expect(screen.getByText(/nombre idéntico/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /combinar/i })).toBeEnabled()
    })
  })
})
