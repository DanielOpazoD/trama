import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Quote } from '../types'
import { QuoteEditModal } from './QuoteEditModal'

const stateMocks = vi.hoisted(() => ({
  useUpdateQuote: vi.fn(),
  useToast: vi.fn(),
}))

vi.mock('../state', () => stateMocks)

const quote: Quote = {
  id: 'quote-1',
  entityId: 'entity-1',
  text: '  El original no debería persistir con espacios. ',
  source: 'Diarios',
  link: 'https://example.com/original',
  userReflection: 'Primera nota',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
}

describe('<QuoteEditModal />', () => {
  beforeEach(() => {
    stateMocks.useUpdateQuote.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    stateMocks.useToast.mockReturnValue({ show: vi.fn() })
    document.body.innerHTML = ''
  })

  it('no monta el portal cuando está cerrado', () => {
    render(<QuoteEditModal quote={quote} open={false} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('guarda campos trimmeados y normaliza campos opcionales vacíos a null', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    const show = vi.fn()
    const onClose = vi.fn()
    stateMocks.useUpdateQuote.mockReturnValue({ mutateAsync, isPending: false })
    stateMocks.useToast.mockReturnValue({ show })

    render(<QuoteEditModal quote={quote} open onClose={onClose} />)

    const user = userEvent.setup()
    const dialog = screen.getByRole('dialog', { name: /editar cita/i })
    const textareas = within(dialog).getAllByRole('textbox')
    const [textArea, sourceInput, linkInput, reflectionArea] = textareas

    await user.clear(textArea!)
    await user.type(textArea!, '  Nueva cita  ')
    await user.clear(sourceInput!)
    await user.type(sourceInput!, '   ')
    await user.clear(linkInput!)
    await user.type(linkInput!, '   ')
    await user.clear(reflectionArea!)
    await user.type(reflectionArea!, '  Nota propia  ')
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'quote-1',
        patch: {
          text: 'Nueva cita',
          source: null,
          link: null,
          userReflection: 'Nota propia',
        },
      })
    })
    expect(show).toHaveBeenCalledWith({ message: 'Cita actualizada', tone: 'success' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bloquea guardar con texto vacío y cierra con Escape', async () => {
    const onClose = vi.fn()
    render(<QuoteEditModal quote={quote} open onClose={onClose} />)

    const user = userEvent.setup()
    const textArea = within(screen.getByRole('dialog')).getAllByRole('textbox')[0]!

    await user.clear(textArea)

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra error backend y mantiene el modal abierto', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('No se pudo persistir'))
    const show = vi.fn()
    const onClose = vi.fn()
    stateMocks.useUpdateQuote.mockReturnValue({ mutateAsync, isPending: false })
    stateMocks.useToast.mockReturnValue({ show })

    render(<QuoteEditModal quote={quote} open onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith({
        message: 'No se pudo persistir',
        tone: 'error',
      })
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /editar cita/i })).toBeInTheDocument()
  })
})
