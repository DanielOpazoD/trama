import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphTypeLegend } from './GraphTypeLegend'
import type { Entity } from '../../types'

function ent(id: string, type: string): Entity {
  return {
    id,
    name: id,
    type,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as Entity
}

const ENTITIES = [ent('a', 'persona'), ent('b', 'persona'), ent('c', 'obra')]

describe('<GraphTypeLegend />', () => {
  it('al pasar el cursor por un tipo avisa cuál, y lo apaga al salir de la lista', () => {
    const onHoverType = vi.fn()
    render(<GraphTypeLegend entities={ENTITIES} onHoverType={onHoverType} />)
    fireEvent.click(screen.getByRole('button', { name: /leyenda/i }))

    const li = screen.getByText('persona').closest('li')!
    fireEvent.mouseEnter(li)
    expect(onHoverType).toHaveBeenCalledWith('persona')

    fireEvent.mouseLeave(screen.getByRole('list', { name: /leyenda de tipos/i }))
    expect(onHoverType).toHaveBeenLastCalledWith(null)
  })

  it('al cerrar la leyenda apaga cualquier realce que quedara activo', () => {
    const onHoverType = vi.fn()
    render(<GraphTypeLegend entities={ENTITIES} onHoverType={onHoverType} />)
    fireEvent.click(screen.getByRole('button', { name: /leyenda/i })) // abrir
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i })) // cerrar
    expect(onHoverType).toHaveBeenLastCalledWith(null)
  })
})
