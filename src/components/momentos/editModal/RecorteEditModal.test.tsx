import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../api'
import { renderWithProviders } from '../../../test-utils'
import { ToastHost } from '../../ToastHost'
import type { Momento } from '../../../types'
import { fromDateTimeLocalInput } from '../helpers'
import { RecorteEditModal } from './RecorteEditModal'

const recorte: Momento = {
  id: 'm-recorte',
  kind: 'recorte',
  capturedAt: '2026-05-30T12:00:00.000Z',
  payload: {
    url: 'https://example.com/viejo',
    title: 'Título viejo',
    bodyText: 'Texto viejo',
    source: 'Blog',
    author: 'Autora',
  },
  note: 'nota vieja',
  origin: { kind: 'manual' },
  entityIds: [],
  createdAt: '2026-05-30T12:00:00.000Z',
  updatedAt: '2026-05-30T12:00:00.000Z',
}

describe('<RecorteEditModal />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normaliza campos vacíos y guarda payload, nota y fecha', async () => {
    const onClose = vi.fn()
    const updated: Momento = {
      ...recorte,
      payload: { title: 'Título nuevo', bodyText: 'Texto nuevo' },
      note: null as unknown as string,
    }
    const updateSpy = vi.spyOn(api, 'updateMomento').mockResolvedValue(updated)

    renderWithProviders(
      <>
        <RecorteEditModal momento={recorte} onClose={onClose} />
        <ToastHost />
      </>,
    )

    fireEvent.change(screen.getByPlaceholderText('https://…'), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByPlaceholderText('Título'), {
      target: { value: '  Título nuevo  ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/texto del recorte/i), {
      target: { value: '  Texto nuevo  ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/autor/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/fuente/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/tu nota/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByLabelText(/fecha y hora del momento/i), {
      target: { value: '2026-05-31T09:15' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('m-recorte', {
        payload: {
          ...recorte.payload,
          url: undefined,
          title: 'Título nuevo',
          bodyText: 'Texto nuevo',
          source: undefined,
          author: undefined,
        },
        note: null,
        capturedAt: fromDateTimeLocalInput('2026-05-31T09:15'),
      })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/recorte actualizado/i)).toBeInTheDocument()
    })
  })

  it('muestra error y no cierra si la API rechaza el guardado', async () => {
    const onClose = vi.fn()
    vi.spyOn(api, 'updateMomento').mockRejectedValue(new Error('falló backend'))

    renderWithProviders(
      <>
        <RecorteEditModal momento={recorte} onClose={onClose} />
        <ToastHost />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(screen.getByText(/falló backend/i)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
