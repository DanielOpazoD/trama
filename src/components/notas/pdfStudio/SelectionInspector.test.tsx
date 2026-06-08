import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Annotation } from '../../../lib/pdfStudio/model/model'
import { SelectionInspector } from './SelectionInspector'

const selected: Annotation = {
  id: 'a',
  kind: 'highlight',
  xRatio: 0.25,
  yRatio: 0.1,
  wRatio: 0.35,
  hRatio: 0.2,
  color: '#f2c94c',
  opacity: 0.45,
}

const props = {
  annotation: selected,
  bounds: { xRatio: 0.25, yRatio: 0.1, wRatio: 0.35, hRatio: 0.2 },
  selectionCount: 1,
  onAlign: vi.fn(),
  onDistribute: vi.fn(),
  onGroup: vi.fn(),
  onUngroup: vi.fn(),
  onLayerMove: vi.fn(),
  onToggleLocked: vi.fn(),
  onBoundsChange: vi.fn(),
  onColorChange: vi.fn(),
  onOpacityChange: vi.fn(),
}

describe('<SelectionInspector />', () => {
  it('muestra posición, tamaño y comandos compactos de objeto', () => {
    render(<SelectionInspector {...props} />)

    expect(
      screen.getByRole('complementary', { name: 'Inspector de selección' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 objeto seleccionado')
    expect(screen.getByText('x 25%')).toBeInTheDocument()
    expect(screen.getByText('y 10%')).toBeInTheDocument()
    expect(screen.getByText('w 35%')).toBeInTheDocument()
    expect(screen.getByText('h 20%')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Alinear a la izquierda' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Traer al frente' })).toBeInTheDocument()
  })

  it('permite editar posición y tamaño como porcentajes', () => {
    render(<SelectionInspector {...props} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'X de selección (%)' }), {
      target: { value: '32' },
    })
    expect(props.onBoundsChange).toHaveBeenCalledWith({ xRatio: 0.32 })

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Ancho de selección (%)' }), {
      target: { value: '44' },
    })
    expect(props.onBoundsChange).toHaveBeenCalledWith({ wRatio: 0.44 })
  })

  it('dispara alineación, capas, color, opacidad y bloqueo', () => {
    render(<SelectionInspector {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Alinear al centro' }))
    expect(props.onAlign).toHaveBeenCalledWith('center')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar atrás' }))
    expect(props.onLayerMove).toHaveBeenCalledWith('back')

    fireEvent.click(screen.getByRole('button', { name: 'Color Amarillo' }))
    expect(props.onColorChange).toHaveBeenCalledWith('#f2c94c')

    fireEvent.change(screen.getByLabelText('Opacidad de selección'), {
      target: { value: '70' },
    })
    expect(props.onOpacityChange).toHaveBeenCalledWith(0.7)

    fireEvent.click(screen.getByRole('button', { name: 'Bloquear selección' }))
    expect(props.onToggleLocked).toHaveBeenCalledWith(true)
  })

  it('refleja selección bloqueada', () => {
    render(<SelectionInspector {...props} annotation={{ ...selected, locked: true }} />)

    expect(screen.getByRole('button', { name: 'Desbloquear selección' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('revela distribución y agrupación cuando hay selección múltiple', () => {
    render(
      <SelectionInspector
        {...props}
        selectionCount={3}
        annotation={{ ...selected, groupId: 'g1' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Distribuir horizontalmente' }))
    expect(props.onDistribute).toHaveBeenCalledWith('x')

    fireEvent.click(screen.getByRole('button', { name: 'Distribuir verticalmente' }))
    expect(props.onDistribute).toHaveBeenCalledWith('y')

    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selección' }))
    expect(props.onGroup).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Desagrupar selección' }))
    expect(props.onUngroup).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('3 objetos seleccionados')
  })
})
