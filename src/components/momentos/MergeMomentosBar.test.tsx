import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from '../../api'
import { ToastHost } from '../ToastHost'
import { renderWithProviders } from '../../test-utils'
import type { Momento } from '../../types'
import { MergeMomentosBar } from './MergeMomentosBar'

function foto(
  id: string,
  capturedAt: string,
  payload: Momento['payload'],
  note?: string,
): Momento {
  return {
    id,
    kind: 'foto',
    capturedAt,
    payload,
    note,
    origin: { kind: 'manual' },
    entityIds: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  }
}

const nota: Momento = {
  id: 'n1',
  kind: 'nota',
  capturedAt: '2026-05-30T12:00:00Z',
  payload: { bodyText: 'nota' },
  origin: { kind: 'manual' },
  entityIds: [],
  createdAt: '2026-05-30T12:00:00Z',
  updatedAt: '2026-05-30T12:00:00Z',
}

describe('<MergeMomentosBar />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('no aparece hasta tener al menos dos momentos seleccionados', () => {
    const { rerender } = renderWithProviders(
      <MergeMomentosBar selected={[]} onClear={vi.fn()} onMerged={vi.fn()} />,
    )
    expect(screen.queryByRole('toolbar', { name: /acciones de fusión/i })).toBeNull()

    rerender(
      <MergeMomentosBar
        selected={[foto('f1', '2026-05-30T10:00:00Z', { storageKey: 'a.jpg' })]}
        onClear={vi.fn()}
        onMerged={vi.fn()}
      />,
    )
    expect(screen.queryByRole('toolbar', { name: /acciones de fusión/i })).toBeNull()
  })

  it('fusiona fotos usando el más viejo como primary por defecto y permite deshacer', async () => {
    const updateSpy = vi
      .spyOn(api, 'updateMomento')
      .mockResolvedValue(foto('old', '2026-05-28T09:00:00Z', { storageKey: 'old.jpg' }))
    const restoreSpy = vi
      .spyOn(api, 'restoreMomento')
      .mockResolvedValue(foto('new', '2026-05-30T10:00:00Z', { storageKey: 'new-1.jpg' }))
    const mergeSpy = vi.spyOn(api, 'mergeMomentos').mockResolvedValue({
      ...foto('old', '2026-05-28T09:00:00Z', {
        items: [{ storageKey: 'old.jpg' }, { storageKey: 'new-1.jpg' }],
      }),
      merged: 2,
      itemCount: 2,
      deletedOthers: [{ id: 'new', deletedAt: '2026-05-31T10:00:00Z' }],
    })
    const onMerged = vi.fn()

    renderWithProviders(
      <>
        <MergeMomentosBar
          selected={[
            foto('new', '2026-05-30T10:00:00Z', {
              items: [{ storageKey: 'new-1.jpg' }, { storageKey: 'new-2.jpg' }],
            }),
            nota,
            foto('old', '2026-05-28T09:00:00Z', { storageKey: 'old.jpg' }, 'viejo'),
          ]}
          onClear={vi.fn()}
          onMerged={onMerged}
        />
        <ToastHost />
      </>,
    )

    expect(screen.getByText(/3 seleccionados/i)).toBeInTheDocument()
    expect(screen.getByText(/3 fotos en total/i)).toBeInTheDocument()
    expect(screen.getByText(/solo se fusionan fotos/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fusionar \(2\)/i }))
    expect(
      screen.getByRole('alertdialog', { name: /confirmar fusión/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirmar fusión/i }))

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalledWith({
        primaryId: 'old',
        otherIds: ['new'],
      })
      expect(onMerged).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/2 momentos fusionados/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /deshacer/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('old', {
        payload: { storageKey: 'old.jpg' },
        note: 'viejo',
        capturedAt: '2026-05-28T09:00:00Z',
      })
      expect(restoreSpy).toHaveBeenCalledWith('new', '2026-05-31T10:00:00Z')
      expect(screen.getByText(/fusión deshecha/i)).toBeInTheDocument()
    })
  })

  it('permite elegir primary y sobrescribir nota y fecha antes de confirmar', async () => {
    const mergeSpy = vi.spyOn(api, 'mergeMomentos').mockResolvedValue({
      ...foto('new', '2026-05-30T10:00:00Z', { storageKey: 'new.jpg' }),
      merged: 2,
      itemCount: 2,
      deletedOthers: [{ id: 'old', deletedAt: '2026-05-31T10:00:00Z' }],
    })

    renderWithProviders(
      <MergeMomentosBar
        selected={[
          foto('new', '2026-05-30T10:00:00Z', { storageKey: 'new.jpg' }),
          foto('old', '2026-05-28T09:00:00Z', { storageKey: 'old.jpg' }),
        ]}
        onClear={vi.fn()}
        onMerged={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    fireEvent.change(screen.getByLabelText(/cuál sobrevive/i), {
      target: { value: 'new' },
    })
    fireEvent.change(screen.getByPlaceholderText(/sobrescribe la nota/i), {
      target: { value: '  episodio unido  ' },
    })
    fireEvent.change(screen.getByLabelText(/fecha del evento/i), {
      target: { value: '2026-05-29' },
    })
    fireEvent.click(screen.getByRole('button', { name: /fusionar \(2\)/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar fusión/i }))

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalledWith({
        primaryId: 'new',
        otherIds: ['old'],
        note: 'episodio unido',
        capturedAt: '2026-05-29T12:00:00Z',
      })
    })
  })

  it('cuenta fotos de payload photos legado en totales y opciones', () => {
    renderWithProviders(
      <MergeMomentosBar
        selected={[
          foto('legacy', '2026-05-28T09:00:00Z', {
            photos: [{ storageKey: 'legacy-a.jpg' }, { storageKey: 'legacy-b.jpg' }],
            primaryStorageKey: 'legacy-a.jpg',
          }),
          foto('new', '2026-05-30T10:00:00Z', { storageKey: 'new.jpg' }),
        ]}
        onClear={vi.fn()}
        onMerged={vi.fn()}
      />,
    )

    expect(screen.getByText(/3 fotos en total/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(
      screen.getByRole('option', { name: /2026-05-28 · 2 fotos/i }),
    ).toBeInTheDocument()
  })
})
