import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entity } from '../../types'
import { GraphMinimap } from './GraphMinimap'

const entities: Entity[] = [
  {
    id: 'a',
    name: 'A',
    type: 'persona',
    origin: { kind: 'manual' },
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
  {
    id: 'b',
    name: 'B',
    type: 'libro',
    origin: { kind: 'manual' },
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
  {
    id: 'missing-position',
    name: 'Sin posición',
    type: 'concepto',
    origin: { kind: 'manual' },
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
]

describe('<GraphMinimap />', () => {
  it('dibuja solo nodos posicionados y calcula el rectángulo de viewport', () => {
    render(
      <GraphMinimap
        entities={entities}
        positions={
          new Map([
            ['a', { x: 0, y: 0 }],
            ['b', { x: 100, y: 50 }],
          ])
        }
        pan={{ x: -50, y: -25 }}
        zoom={2}
        hostWidth={200}
        hostHeight={100}
        onJumpTo={vi.fn()}
      />,
    )

    const svg = screen.getByRole('img', { name: /minimap del grafo/i })
    expect(svg.querySelectorAll('circle')).toHaveLength(2)
    const viewport = svg.querySelector('rect')!
    expect(viewport).toHaveAttribute('width', '88')
    expect(viewport).toHaveAttribute('height', '44')
  })

  it('convierte clicks del minimap a coordenadas world', () => {
    const onJumpTo = vi.fn()
    render(
      <GraphMinimap
        entities={entities.slice(0, 2)}
        positions={
          new Map([
            ['a', { x: 0, y: 0 }],
            ['b', { x: 100, y: 100 }],
          ])
        }
        pan={{ x: 0, y: 0 }}
        zoom={1}
        hostWidth={200}
        hostHeight={100}
        onJumpTo={onJumpTo}
      />,
    )

    const svg = screen.getByRole('img', { name: /minimap del grafo/i })
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 140,
      height: 100,
      right: 150,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    })

    fireEvent.click(svg, { clientX: 60, clientY: 70 })

    expect(onJumpTo).toHaveBeenCalledWith(expect.closeTo(50, 4), expect.closeTo(50, 4))
  })
})
