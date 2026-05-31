import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entity, Quote } from '../../types'
import { QuoteEditMode } from './QuoteEditMode'

const entities: Entity[] = [
  {
    id: 'e1',
    name: 'Borges',
    type: 'escritor',
    origin: { kind: 'manual' },
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
  {
    id: 'e2',
    name: 'Ficciones',
    type: 'libro',
    origin: { kind: 'manual' },
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
]

const quote: Quote = {
  id: 'q1',
  entityId: 'e1',
  text: 'El tiempo es la sustancia.',
  source: 'Otras inquisiciones',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<QuoteEditMode />', () => {
  it('guarda campos normalizados e incluye entityId solo cuando cambia', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <QuoteEditMode
        quote={quote}
        entities={entities}
        pending={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/texto de la cita/i), {
      target: { value: '  nueva cita  ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/fuente/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByLabelText(/atribuida a/i), {
      target: { value: 'e2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        text: 'nueva cita',
        source: null,
        entityId: 'e2',
      })
    })
  })

  it('bloquea guardar texto vacío y respeta cancel/pending', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    const { rerender } = render(
      <QuoteEditMode
        quote={quote}
        entities={entities}
        pending={false}
        onCancel={onCancel}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/texto de la cita/i), {
      target: { value: '   ' },
    })
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    rerender(
      <QuoteEditMode
        quote={quote}
        entities={entities}
        pending
        onCancel={onCancel}
        onSave={onSave}
      />,
    )
    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled()
  })
})
