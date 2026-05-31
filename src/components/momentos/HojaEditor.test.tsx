import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import type { Entity } from '../../types'
import { renderWithProviders } from '../../test-utils'
import { ToastHost } from '../ToastHost'
import { HojaEditor } from './HojaEditor'

vi.mock('./caretCoordinates', () => ({
  getCaretCoordinates: () => ({ top: 12, left: 20, height: 18 }),
}))

const borges: Entity = {
  id: 'e-borges',
  name: 'Jorge Luis Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<HojaEditor />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('inserta una entidad mencionada y guarda la hoja como nota vinculada', async () => {
    const onClose = vi.fn()
    const lookupSpy = vi.spyOn(api, 'lookupEntitiesByPrefix').mockResolvedValue([borges])
    const createSpy = vi.spyOn(api, 'createMomento').mockResolvedValue({
      id: 'm-hoja',
      kind: 'nota',
      capturedAt: '2026-05-31T12:00:00.000Z',
      payload: { bodyText: 'Apunte sobre @Jorge Luis Borges' },
      origin: { kind: 'manual' },
      entityIds: ['e-borges'],
      createdAt: '2026-05-31T12:00:00.000Z',
      updatedAt: '2026-05-31T12:00:00.000Z',
    })

    renderWithProviders(
      <>
        <HojaEditor onClose={onClose} />
        <ToastHost />
      </>,
    )

    const textarea = screen.getByPlaceholderText(/escribe libremente/i)
    fireEvent.change(textarea, {
      target: {
        value: 'Apunte sobre @bor',
        selectionStart: 'Apunte sobre @bor'.length,
      },
    })

    await waitFor(() => {
      expect(lookupSpy).toHaveBeenCalledWith('bor')
      expect(
        screen.getByRole('button', { name: /Jorge Luis Borges/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('Jorge Luis Borges')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /guardar hoja/i }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        kind: 'nota',
        payload: { bodyText: 'Apunte sobre @Jorge Luis Borges' },
        entityIds: ['e-borges'],
      })
      expect(screen.getByText(/hoja guardada/i)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('inserta una cita desde búsqueda lexical y arrastra el vínculo de la entidad citada', async () => {
    const searchSpy = vi.spyOn(api, 'search').mockResolvedValue({
      entities: [],
      quotes: [
        {
          id: 'q-1',
          entityId: 'e-borges',
          entityName: 'Jorge Luis Borges',
          text: 'El tiempo es la sustancia de que estoy hecho',
          source: 'Nueva refutación del tiempo',
          score: 1,
          lexical: 1,
          semantic: 0,
        },
      ],
      momentos: [],
      cronicas: [],
      chat: [],
      mode: 'lexical',
    })
    const createSpy = vi.spyOn(api, 'createMomento').mockResolvedValue({
      id: 'm-cita',
      kind: 'nota',
      capturedAt: '2026-05-31T12:00:00.000Z',
      payload: { bodyText: 'cita' },
      origin: { kind: 'manual' },
      entityIds: ['e-borges'],
      createdAt: '2026-05-31T12:00:00.000Z',
      updatedAt: '2026-05-31T12:00:00.000Z',
    })

    renderWithProviders(<HojaEditor onClose={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/escribe libremente/i)
    fireEvent.change(textarea, {
      target: {
        value: '>tiempo',
        selectionStart: '>tiempo'.length,
      },
    })

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalledWith('tiempo', { limit: 6, mode: 'lexical' })
      expect(
        screen.getByRole('button', { name: /El tiempo es la sustancia/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByDisplayValue(/El tiempo es la sustancia/i)).toBeInTheDocument()
      expect(screen.getByText('Jorge Luis Borges')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /guardar hoja/i }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        kind: 'nota',
        payload: {
          bodyText:
            '«El tiempo es la sustancia de que estoy hecho» — Nueva refutación del tiempo',
        },
        entityIds: ['e-borges'],
      })
    })
  })
})
