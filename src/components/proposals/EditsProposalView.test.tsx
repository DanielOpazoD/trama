import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProposedDelete, ProposedEdit } from '../../types'
import { EditsProposalView } from './EditsProposalView'

const edits: ProposedEdit[] = [
  {
    kind: 'entity',
    id: 'entity-1',
    name: 'Borges',
    patch: { description: 'bibliotecario infinito', year: null },
    reason: 'Completa contexto.',
  },
  {
    kind: 'quote',
    id: 'quote-1',
    preview: 'El tiempo es la sustancia...',
    patch: { source: null, userReflection: 'leer junto a memoria' },
  },
  {
    kind: 'relationship',
    id: 'rel-1',
    preview: 'Borges -> Ficciones',
    patch: { type: 'escribio' },
  },
]

const deletes: ProposedDelete[] = [
  {
    kind: 'entity',
    id: 'entity-old',
    preview: 'Duplicado viejo',
    reason: 'Parece redundante.',
  },
]

describe('<EditsProposalView />', () => {
  it('renderiza cambios y deletes opt-in con toggles independientes', async () => {
    const onToggleEdit = vi.fn()
    const onToggleDelete = vi.fn()

    render(
      <EditsProposalView
        edits={edits}
        deletes={deletes}
        checkedEdits={[true, false, true]}
        checkedDeletes={[false]}
        onToggleEdit={onToggleEdit}
        onToggleDelete={onToggleDelete}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cambios' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Eliminar — opt-in/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/editar entidad/i)).toBeInTheDocument()
    expect(screen.getByText(/editar cita/i)).toBeInTheDocument()
    expect(screen.getByText(/editar relación/i)).toBeInTheDocument()
    expect(screen.getByText('bibliotecario infinito')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('Parece redundante.')).toBeInTheDocument()

    const checks = screen.getAllByRole('checkbox')
    expect(checks.map((check) => (check as HTMLInputElement).checked)).toEqual([
      true,
      false,
      true,
      false,
    ])

    const user = userEvent.setup()
    await user.click(checks[1]!)
    await user.click(checks[3]!)

    expect(onToggleEdit).toHaveBeenCalledWith(1)
    expect(onToggleDelete).toHaveBeenCalledWith(0)
  })

  it('no renderiza secciones vacías', () => {
    const { container } = render(
      <EditsProposalView
        edits={[]}
        deletes={[]}
        checkedEdits={[]}
        checkedDeletes={[]}
        onToggleEdit={vi.fn()}
        onToggleDelete={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
