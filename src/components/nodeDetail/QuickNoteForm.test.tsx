import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import type { Entity, Quote } from '../../types'
import { QuickNoteForm } from './QuickNoteForm'

const entity: Entity = {
  id: 'e-borges',
  name: 'Jorge Luis Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-31T12:00:00.000Z',
  updatedAt: '2026-05-31T12:00:00.000Z',
}

const createdQuote: Quote = {
  id: 'q-borges',
  entityId: 'e-borges',
  text: 'El tiempo es la sustancia de que estoy hecho',
  userReflection: 'Pensar el yo como duración',
  origin: { kind: 'manual' },
  linkedQuoteIds: [],
  createdAt: '2026-05-31T12:00:00.000Z',
  updatedAt: '2026-05-31T12:00:00.000Z',
}

describe('<QuickNoteForm />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('crea una cita manual ligada a la entidad y cierra al guardar', async () => {
    const onDone = vi.fn()
    const createSpy = vi.spyOn(api, 'createQuote').mockResolvedValue(createdQuote)
    const user = userEvent.setup()

    renderWithProviders(<QuickNoteForm entity={entity} onDone={onDone} />)

    await user.type(screen.getByPlaceholderText(/una cita/i), ` ${createdQuote.text} `)
    await user.click(screen.getByRole('button', { name: /reflexión/i }))
    await user.type(
      screen.getByPlaceholderText(/tu reflexión/i),
      '  Pensar el yo como duración  ',
    )
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        entityId: 'e-borges',
        text: createdQuote.text,
        userReflection: 'Pensar el yo como duración',
        origin: { kind: 'manual' },
        linkedQuoteIds: [],
      })
      expect(onDone).toHaveBeenCalledTimes(1)
    })
  })

  it('no permite enviar texto vacío y cancela sin llamar a la API', () => {
    const onDone = vi.fn()
    const createSpy = vi.spyOn(api, 'createQuote')

    renderWithProviders(<QuickNoteForm entity={entity} onDone={onDone} />)

    const addButton = screen.getByRole('button', { name: /añadir/i })
    expect(addButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/una cita/i), {
      target: { value: '   ' },
    })
    expect(addButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('si falla la creación mantiene el formulario abierto para reintentar', async () => {
    const onDone = vi.fn()
    vi.spyOn(api, 'createQuote').mockRejectedValue(new Error('backend caído'))

    renderWithProviders(<QuickNoteForm entity={entity} onDone={onDone} />)

    fireEvent.change(screen.getByPlaceholderText(/una cita/i), {
      target: { value: 'La memoria elige sus imágenes' },
    })
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }))

    await waitFor(() => {
      expect(onDone).not.toHaveBeenCalled()
      expect(
        screen.getByDisplayValue('La memoria elige sus imágenes'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /añadir/i })).toBeEnabled()
    })
  })
})
