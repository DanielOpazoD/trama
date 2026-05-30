import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NoteCard } from './NoteCard'
import type { Note } from '../../api'

const BASE: Note = {
  id: 'n1',
  content: 'una nota',
  tags: [],
  pinned: false,
  promotedMomentoId: null,
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T10:00:00.000Z',
}

const noop = () => {}

describe('<NoteCard />', () => {
  it('ofrece promover a Momento cuando la nota no fue promovida', () => {
    const onPromote = vi.fn()
    render(
      <NoteCard
        note={BASE}
        onTogglePin={noop}
        onDelete={noop}
        onPromote={onPromote}
        onEdit={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /→ momento/i }))
    expect(onPromote).toHaveBeenCalledTimes(1)
  })

  it('muestra la insignia "en momentos" cuando ya fue promovida (sin botón)', () => {
    render(
      <NoteCard
        note={{ ...BASE, promotedMomentoId: 'm1' }}
        onTogglePin={noop}
        onDelete={noop}
        onPromote={vi.fn()}
        onEdit={noop}
      />,
    )
    expect(screen.getByText(/en momentos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /→ momento/i })).toBeNull()
  })

  it('permite editar el contenido de la nota', () => {
    const onEdit = vi.fn()
    render(
      <NoteCard
        note={BASE}
        onTogglePin={noop}
        onDelete={noop}
        onPromote={noop}
        onEdit={onEdit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'nueva versión' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onEdit).toHaveBeenCalledWith('nueva versión')
  })
})
