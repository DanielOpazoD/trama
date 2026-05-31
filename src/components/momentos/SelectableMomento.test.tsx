import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Momento } from '../../types'
import { SelectableMomento } from './SelectableMomento'

vi.mock('./MomentoEntry', () => ({
  MomentoEntry: ({ momento, onDelete }: { momento: Momento; onDelete: () => void }) => (
    <article>
      <p>entry {momento.id}</p>
      <button type="button" onClick={onDelete}>
        borrar interno
      </button>
    </article>
  ),
}))

const momento = {
  id: 'mom-1',
  kind: 'nota',
  capturedAt: '2026-05-12T10:00:00Z',
  note: null,
  entityIds: [],
  links: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-12T10:00:00Z',
  updatedAt: '2026-05-12T10:00:00Z',
  payload: { bodyText: 'hola' },
} as unknown as Momento

describe('<SelectableMomento />', () => {
  it('delega render normal cuando selectionMode está apagado', async () => {
    const onDelete = vi.fn()
    render(
      <SelectableMomento
        momento={momento}
        entitiesById={new Map()}
        selectionMode={false}
        selected={false}
        onToggleSelect={() => {}}
        onDelete={onDelete}
      />,
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /borrar interno/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('togglea selección con click, Enter y Space', async () => {
    const onToggleSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectableMomento
        momento={momento}
        entitiesById={new Map()}
        selectionMode
        selected={false}
        onToggleSelect={onToggleSelect}
        onDelete={() => {}}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Seleccionar momento del 2026-05-12/i,
    })
    expect(checkbox).toHaveAttribute('aria-checked', 'false')

    await user.click(checkbox)
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onToggleSelect).toHaveBeenCalledTimes(3)
  })
})
