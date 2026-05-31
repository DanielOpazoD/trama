import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entity, Relationship } from '../../types'
import { RelationshipRow } from './RelationshipRow'

const from: Entity = {
  id: 'e1',
  name: 'Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

const to: Entity = {
  id: 'e2',
  name: 'Kafka',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

const relationship: Relationship = {
  id: 'r1',
  fromId: 'e1',
  toId: 'e2',
  type: 'influye_en',
  notes: 'lectura oblicua',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<RelationshipRow />', () => {
  it('muestra from, tipo, to y despacha selección/borrado', () => {
    const onSelectEntity = vi.fn()
    const onDelete = vi.fn()
    render(
      <RelationshipRow
        rel={relationship}
        from={from}
        to={to}
        onSelectEntity={onSelectEntity}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('influye en')).toBeInTheDocument()
    expect(screen.getByText('lectura oblicua')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Borges' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kafka' }))
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(onSelectEntity).toHaveBeenCalledWith('e1')
    expect(onSelectEntity).toHaveBeenCalledWith('e2')
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('usa nombres snapshot y fallback legible para tipos nuevos', () => {
    render(
      <RelationshipRow
        rel={{
          ...relationship,
          type: 'dialoga_con',
          fromName: 'Autor archivado',
          toName: 'Obra archivada',
          origin: { kind: 'ai', provider: 'openai', model: 'gpt' },
        }}
        from={undefined}
        to={undefined}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Autor archivado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Obra archivada' })).toBeInTheDocument()
    expect(screen.getByText('dialoga con')).toBeInTheDocument()
    expect(screen.getByTitle(/propuesta por ia/i)).toBeInTheDocument()
  })
})
