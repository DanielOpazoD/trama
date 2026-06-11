import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphSearch, searchEntities } from './GraphSearch'
import { buildTypeLegend } from './GraphTypeLegend'
import type { Entity } from '../../types'

function ent(id: string, name: string, type = 'escritor'): Entity {
  return {
    id,
    name,
    type,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as Entity
}

const ENTITIES = [
  ent('a', 'Borges'),
  ent('b', 'Bolaño'),
  ent('c', 'María Luisa Bombal'),
  ent('d', 'Cortázar', 'persona'),
]

describe('searchEntities', () => {
  it('prioriza prefijo sobre contiene y pliega acentos', () => {
    const out = searchEntities(ENTITIES, 'bo')
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(searchEntities(ENTITIES, 'maria')[0]?.id).toBe('c')
  })

  it('query vacía no devuelve nada', () => {
    expect(searchEntities(ENTITIES, '  ')).toEqual([])
  })
})

describe('<GraphSearch />', () => {
  it('filtra al escribir y selecciona con Enter', () => {
    const onSelect = vi.fn()
    render(<GraphSearch entities={ENTITIES} onSelect={onSelect} />)
    const input = screen.getByLabelText('Buscar nodo en el grafo')
    fireEvent.change(input, { target: { value: 'cort' } })
    expect(screen.getByText('Cortázar')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('d')
  })

  it('la tecla «/» enfoca el input', () => {
    render(<GraphSearch entities={ENTITIES} onSelect={() => {}} />)
    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getByLabelText('Buscar nodo en el grafo')).toHaveFocus()
  })
})

describe('buildTypeLegend', () => {
  it('cuenta por tipo y ordena por presencia', () => {
    expect(buildTypeLegend(ENTITIES)).toEqual([
      { type: 'escritor', count: 3 },
      { type: 'persona', count: 1 },
    ])
  })
})
