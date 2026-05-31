import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../api'
import { renderWithProviders } from '../../../test-utils'
import type { Momento } from '../../../types'
import { ToastHost } from '../../ToastHost'
import { fromDateTimeLocalInput } from '../helpers'
import { NotaEditModal } from './NotaEditModal'

const nota: Momento = {
  id: 'm-nota',
  kind: 'nota',
  capturedAt: '2026-05-30T12:00:00.000Z',
  payload: { bodyText: 'Texto viejo' },
  origin: { kind: 'manual' },
  entityIds: [],
  createdAt: '2026-05-30T12:00:00.000Z',
  updatedAt: '2026-05-30T12:00:00.000Z',
}

describe('<NotaEditModal />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('recorta el texto y guarda payload con fecha capturada', async () => {
    const onClose = vi.fn()
    const updateSpy = vi.spyOn(api, 'updateMomento').mockResolvedValue({
      ...nota,
      payload: { bodyText: 'Texto nuevo' },
    })

    renderWithProviders(
      <>
        <NotaEditModal momento={nota} onClose={onClose} />
        <ToastHost />
      </>,
    )

    fireEvent.change(screen.getByPlaceholderText(/observación/i), {
      target: { value: '  Texto nuevo  ' },
    })
    fireEvent.change(screen.getByLabelText(/fecha y hora del momento/i), {
      target: { value: '2026-05-31T10:45' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('m-nota', {
        payload: { bodyText: 'Texto nuevo' },
        capturedAt: fromDateTimeLocalInput('2026-05-31T10:45'),
      })
      expect(screen.getByText(/nota actualizada/i)).toBeInTheDocument()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('deshabilita guardar cuando la nota queda vacía', () => {
    const updateSpy = vi.spyOn(api, 'updateMomento')

    renderWithProviders(<NotaEditModal momento={nota} onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/observación/i), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('muestra error y no cierra si falla el guardado', async () => {
    const onClose = vi.fn()
    vi.spyOn(api, 'updateMomento').mockRejectedValue(new Error('no se guardó'))

    renderWithProviders(
      <>
        <NotaEditModal momento={nota} onClose={onClose} />
        <ToastHost />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(screen.getByText(/no se guardó/i)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
