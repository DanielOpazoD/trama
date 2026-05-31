import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import type { Entity, Quote } from '../../types'
import { QuoteItem } from './QuoteItem'

const quote: Quote = {
  id: 'q1',
  entityId: 'book-1',
  text: 'El tiempo es la sustancia de la que estoy hecho.',
  source: 'Ficciones',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

const entity: Entity = {
  id: 'book-1',
  name: 'Ficciones',
  type: 'libro',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

const author: Entity = {
  id: 'author-1',
  name: 'Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<QuoteItem />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra cita, atribución navegable y evita duplicar source cuando coincide con la obra', () => {
    const onSelectEntity = vi.fn()
    renderWithProviders(
      <QuoteItem
        quote={quote}
        entity={entity}
        author={author}
        isFeature={false}
        onSelectEntity={onSelectEntity}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText(/El tiempo es la sustancia/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /borges/i }))
    fireEvent.click(screen.getByRole('button', { name: /ficciones/i }))
    expect(onSelectEntity).toHaveBeenCalledWith('author-1')
    expect(onSelectEntity).toHaveBeenCalledWith('book-1')
    expect(screen.queryAllByText(/Ficciones/i)).toHaveLength(1)
  })

  it('marca y desmarca favorita usando el patch pinned esperado', async () => {
    const updateSpy = vi.spyOn(api, 'updateQuote').mockResolvedValue({
      ...quote,
      pinnedAt: '2026-05-31T10:00:00.000Z',
    })

    renderWithProviders(
      <QuoteItem
        quote={quote}
        entity={entity}
        author={undefined}
        isFeature={false}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /marcar como favorita/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('q1', { pinned: true })
    })
  })

  it('permite pedir una interpretación IA, descartarla o guardarla explícitamente', async () => {
    vi.spyOn(api, 'reflectQuote').mockResolvedValue({
      reflection: 'Una lectura sobre memoria y materia.',
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
    const updateSpy = vi.spyOn(api, 'updateQuote').mockResolvedValue({
      ...quote,
      aiReflection: 'Una lectura sobre memoria y materia.',
      aiReflectionProvider: 'openai',
      aiReflectionModel: 'gpt-4.1-mini',
    })

    renderWithProviders(
      <QuoteItem
        quote={quote}
        entity={entity}
        author={undefined}
        isFeature={false}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /más acciones/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /reflexionar con ia/i }))

    await waitFor(() => {
      expect(screen.getByText(/lectura cruzada/i)).toBeInTheDocument()
      expect(screen.getByText(/memoria y materia/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('q1', {
        aiReflection: 'Una lectura sobre memoria y materia.',
        aiReflectionProvider: 'openai',
        aiReflectionModel: 'gpt-4.1-mini',
      })
    })
  })
})
