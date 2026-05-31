import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Entity } from '../../types'
import { HoverPreviewCard } from './HoverPreviewCard'

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    type: 'libro',
    name: 'El nombre extremadamente largo de una entidad editorial',
    year: 1967,
    description: 'Descripción larga que debería cortarse para no romper la tarjeta',
    origin: { kind: 'manual' },
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  }
}

describe('<HoverPreviewCard />', () => {
  it('renderiza una tarjeta SVG posicionada con tipo, año y textos truncados', () => {
    const { container } = render(
      <svg>
        <HoverPreviewCard entity={entity()} posX={100} posY={50} connectionCount={2} />
      </svg>,
    )

    const group = container.querySelector('g')
    const rect = container.querySelector('rect')

    expect(group).toHaveAttribute('transform', 'translate(128 12)')
    expect(rect).toHaveAttribute('width', '200')
    expect(rect).toHaveAttribute('height', '76')
    expect(screen.getByText('libro · 1967')).toBeInTheDocument()
    expect(screen.getByText('El nombre extremadamente la…')).toBeInTheDocument()
    expect(screen.getByText('2 conexiones')).toBeInTheDocument()
    expect(
      screen.getByText('Descripción larga que debería cortarse …'),
    ).toBeInTheDocument()
  })

  it('usa el tipo crudo, altura compacta y singular cuando faltan año y descripción', () => {
    const { container } = render(
      <svg>
        <HoverPreviewCard
          entity={entity({
            type: 'tipo_nuevo',
            name: 'Nodo breve',
            year: undefined,
            description: undefined,
          })}
          posX={10}
          posY={20}
          connectionCount={1}
        />
      </svg>,
    )

    expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(38 -10)')
    expect(container.querySelector('rect')).toHaveAttribute('height', '60')
    expect(screen.getByText('tipo_nuevo')).toBeInTheDocument()
    expect(screen.getByText('Nodo breve')).toBeInTheDocument()
    expect(screen.getByText('1 conexión')).toBeInTheDocument()
    expect(screen.queryByText(/Descripción/)).not.toBeInTheDocument()
  })
})
