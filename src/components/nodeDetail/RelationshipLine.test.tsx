import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelationshipLine } from './RelationshipLine'
import type { Entity, Relationship } from '../../types'

const REL_OUT: Relationship = {
  id: 'r1',
  fromId: 'a',
  toId: 'b',
  type: 'cita_a',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const REL_AI: Relationship = {
  ...REL_OUT,
  id: 'r2',
  origin: { kind: 'ai', provider: 'deepseek' },
}

const OTHER_ENTITY: Entity = {
  id: 'b',
  type: 'persona',
  name: 'Bioy',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('<RelationshipLine />', () => {
  it('renderiza el nombre de la entidad opuesta', () => {
    render(
      <RelationshipLine
        rel={REL_OUT}
        direction="out"
        otherEntity={OTHER_ENTITY}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Bioy')).toBeInTheDocument()
  })

  it('muestra "—" cuando otherEntity es undefined', () => {
    render(
      <RelationshipLine
        rel={REL_OUT}
        direction="out"
        otherEntity={undefined}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('muestra el badge IA cuando origin.kind === "ai"', () => {
    const { container } = render(
      <RelationshipLine
        rel={REL_AI}
        direction="out"
        otherEntity={OTHER_ENTITY}
        onDelete={vi.fn()}
      />,
    )
    expect(container.querySelector('[title="propuesta por IA"]')).not.toBeNull()
  })

  it('NO muestra el badge IA cuando origin.kind === "manual"', () => {
    const { container } = render(
      <RelationshipLine
        rel={REL_OUT}
        direction="out"
        otherEntity={OTHER_ENTITY}
        onDelete={vi.fn()}
      />,
    )
    expect(container.querySelector('[title="propuesta por IA"]')).toBeNull()
  })

  it('click en el botón de eliminar dispara onDelete', async () => {
    const onDelete = vi.fn()
    render(
      <RelationshipLine
        rel={REL_OUT}
        direction="out"
        otherEntity={OTHER_ENTITY}
        onDelete={onDelete}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Eliminar relación'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
