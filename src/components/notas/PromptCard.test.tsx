import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { Prompt } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { PromptCard } from './PromptCard'

const basePrompt: Prompt = {
  id: 'p1',
  title: 'Auditor premium',
  content: 'Revisa {{cliente}} con tono {{tono}}',
  collection: 'Código',
  tags: [],
  variables: ['cliente', 'tono'],
  favorite: false,
  useCount: 2,
  lastUsedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<PromptCard />', () => {
  /**
   * La convención de todas las tarjetas: la acción primaria visible con nombre
   * (aquí copiar, que es a lo que se viene a una biblioteca de prompts), las
   * rápidas al hover, y el resto tras el menú ⋯. Antes ésta era la única de
   * las siete tarjetas con seis controles siempre a la vista.
   */
  it('muestra metadata y expone la acción primaria a la vista', () => {
    const onCopy = vi.fn()
    const onFavorite = vi.fn()

    renderWithProviders(
      <PromptCard
        prompt={basePrompt}
        busy={false}
        onFavorite={onFavorite}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onCopy={onCopy}
      />,
    )

    expect(screen.getByText('Auditor premium')).toBeInTheDocument()
    expect(screen.getByText('Código')).toBeInTheDocument()
    expect(screen.getByText('cliente')).toBeInTheDocument()
    expect(screen.getByText('tono')).toBeInTheDocument()
    expect(screen.getByText('2 usos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    expect(onCopy).toHaveBeenCalledTimes(1)

    // Favorito es acción rápida (hover/foco), fuera del menú.
    fireEvent.click(screen.getByRole('button', { name: 'favorito' }))
    expect(onFavorite).toHaveBeenCalledTimes(1)
  })

  it('duplicar e historial viven tras el menú ⋯', () => {
    const onDuplicate = vi.fn()
    renderWithProviders(
      <PromptCard
        prompt={basePrompt}
        busy={false}
        onFavorite={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onCopy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Acciones del prompt' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicar/ }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  /**
   * Borrar pide confirmación dentro del menú, como NoteCard y RecorteCard: un
   * clic suelto sobre «Borrar» no puede llevarse un prompt.
   */
  it('borrar exige confirmación en el menú', () => {
    const onDelete = vi.fn()
    renderWithProviders(
      <PromptCard
        prompt={basePrompt}
        busy={false}
        onFavorite={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
        onSave={vi.fn()}
        onCopy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Acciones del prompt' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar' }))
    // El primer clic NO borra: pide confirmación.
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sí, borrar' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('permite editar y normaliza colección vacía', () => {
    const onSave = vi.fn()

    renderWithProviders(
      <PromptCard
        prompt={basePrompt}
        busy={false}
        onFavorite={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        onCopy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Editar prompt' }))
    fireEvent.change(screen.getByDisplayValue('Auditor premium'), {
      target: { value: '  Auditor v2  ' },
    })
    fireEvent.change(screen.getByDisplayValue('Código'), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByDisplayValue('Revisa {{cliente}} con tono {{tono}}'), {
      target: { value: '  Nuevo contenido  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'guardar' }))

    expect(onSave).toHaveBeenCalledWith({
      title: 'Auditor v2',
      collection: null,
      content: 'Nuevo contenido',
    })
    expect(screen.queryByDisplayValue('Auditor v2')).not.toBeInTheDocument()
  })

  it('permite cancelar edición y refleja estado favorito', () => {
    renderWithProviders(
      <PromptCard
        prompt={{ ...basePrompt, favorite: true, collection: null, variables: [] }}
        busy={false}
        onFavorite={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onCopy={vi.fn()}
      />,
    )

    expect(screen.getByText('favorito')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'soltar' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Editar prompt' }))
    fireEvent.change(screen.getByDisplayValue('Auditor premium'), {
      target: { value: 'no guardar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }))

    expect(screen.queryByDisplayValue('no guardar')).not.toBeInTheDocument()
    expect(screen.getByText('Auditor premium')).toBeInTheDocument()
  })
})
