import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entity } from '../../types'
import { EntityRow } from './EntityRow'

const entity: Entity = {
  id: 'e1',
  name: 'Borges',
  type: 'escritor',
  year: 1899,
  description: 'laberintos, espejos y bibliotecas',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<EntityRow />', () => {
  it('muestra metadata editorial y abre el detalle de la entidad', () => {
    const onSelectEntity = vi.fn()
    render(
      <EntityRow
        entity={entity}
        quoteCount={1}
        relCount={2}
        onSelectEntity={onSelectEntity}
      />,
    )

    const row = screen.getByRole('button', { name: /abrir borges, 1 cita/i })
    expect(row).toHaveTextContent('Borges')
    expect(row).toHaveTextContent('(1899)')
    expect(row).toHaveTextContent('escritor')
    expect(row).toHaveTextContent('laberintos, espejos y bibliotecas')
    expect(row).toHaveTextContent('1 cita')
    expect(row).toHaveTextContent('2 relaciones')

    fireEvent.click(row)
    expect(onSelectEntity).toHaveBeenCalledWith('e1')
  })

  it('soporta tipos dinámicos y origen IA sin depender del catálogo fallback', () => {
    render(
      <EntityRow
        entity={{
          ...entity,
          type: 'concepto_personal',
          origin: { kind: 'ai', provider: 'openai', model: 'gpt' },
        }}
        quoteCount={0}
        relCount={0}
      />,
    )

    const row = screen.getByRole('button', { name: /abrir borges, 0 citas/i })
    expect(row).toHaveTextContent('Borges')
    expect(row.querySelector('svg')).not.toBeNull()
    expect(row).not.toHaveTextContent('concepto_personal')
  })
})
