import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recorte } from '../../api'
import { PromoteModal } from './PromoteModal'

const stateMocks = vi.hoisted(() => ({ usePromoteRecorte: vi.fn() }))
const toastMocks = vi.hoisted(() => ({ useToast: vi.fn() }))

vi.mock('../../state', () => stateMocks)
vi.mock('../../state/toast', () => toastMocks)
// EntityCombobox solo se usa en el target 'quote'; lo stubbeamos para no
// arrastrar sus dependencias en estos tests de momento.
vi.mock('../EntityCombobox', () => ({ EntityCombobox: () => null }))

const baseRecorte: Recorte = {
  id: 'r1',
  text: 'mi gato en la mesa',
  sourceUrl: null,
  sourceTitle: null,
  sourceAuthor: null,
  note: null,
  imageUrl: null,
  imageKey: null,
  images: [],
  captureMode: 'image',
  status: 'pending',
  promotedTarget: null,
  promotedId: null,
  captureSource: 'whatsapp',
  capturedAt: '2026-06-14T12:00:00.000Z',
  createdAt: '2026-06-14T12:00:00.000Z',
  updatedAt: '2026-06-14T12:00:00.000Z',
}

describe('<PromoteModal /> → momento', () => {
  beforeEach(() => {
    toastMocks.useToast.mockReturnValue({ show: vi.fn() })
    document.body.innerHTML = ''
  })

  it('una captura CON imagen se promueve como kind:foto con el pie de foto', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    stateMocks.usePromoteRecorte.mockReturnValue({ mutateAsync })
    const recorte: Recorte = { ...baseRecorte, imageKey: 'u/abc.webp' }

    render(<PromoteModal recorte={recorte} target="momento" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /crear momento/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'r1',
      input: {
        target: 'momento',
        momento: expect.objectContaining({
          kind: 'foto',
          payload: { caption: 'mi gato en la mesa' },
        }),
      },
    })
  })

  it('una captura SIN imagen sigue promoviéndose como kind:recorte (texto)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    stateMocks.usePromoteRecorte.mockReturnValue({ mutateAsync })

    render(<PromoteModal recorte={baseRecorte} target="momento" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /crear momento/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const arg = mutateAsync.mock.calls[0]![0] as {
      input: { momento: { kind: string } }
    }
    expect(arg.input.momento.kind).toBe('recorte')
  })
})

describe('<PromoteModal /> → accesibilidad de modal', () => {
  beforeEach(() => {
    toastMocks.useToast.mockReturnValue({ show: vi.fn() })
    stateMocks.usePromoteRecorte.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    })
    document.body.innerHTML = ''
  })

  it('es un diálogo modal (role=dialog + aria-modal)', () => {
    render(<PromoteModal recorte={baseRecorte} target="momento" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: /promover a momento/i })
    // useModalOverlay aísla el modal para lectores de pantalla.
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('cierra con Escape', () => {
    const onClose = vi.fn()
    render(<PromoteModal recorte={baseRecorte} target="momento" onClose={onClose} />)
    // useModalOverlay escucha en document (fase de captura).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
