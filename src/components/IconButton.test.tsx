import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { IconButton } from './IconButton'
import { Tooltip } from './Tooltip'

describe('<IconButton />', () => {
  it('expone el label como nombre accesible y renderiza el ícono', () => {
    render(
      <IconButton label="Cerrar">
        <svg data-testid="icono" />
      </IconButton>,
    )
    const btn = screen.getByRole('button', { name: 'Cerrar' })
    expect(btn).toBeInTheDocument()
    expect(screen.getByTestId('icono')).toBeInTheDocument()
  })

  it('es type="button" por defecto (no envía formularios sin querer)', () => {
    render(<IconButton label="X">i</IconButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('permite override de type', () => {
    render(
      <IconButton label="Enviar" type="submit">
        i
      </IconButton>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('conserva el className del call site sin imponer un anillo de foco propio', () => {
    render(
      <IconButton label="X" className="absolute top-1 text-ink-300">
        i
      </IconButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('absolute', 'top-1', 'text-ink-300')
    // No impone su propio focus-visible: usa el :focus-visible global de la app
    // (evita un doble indicador sobre el outline global).
    expect(btn.className).not.toMatch(/focus-visible|ring-/)
  })

  it('reenvía props nativas (onClick, disabled, title)', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <IconButton label="X" onClick={onClick} title="tip">
        i
      </IconButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('title', 'tip')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <IconButton label="X" onClick={onClick} disabled>
        i
      </IconButton>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce() // disabled: no dispara de nuevo
  })

  it('reenvía la ref al <button>: un Tooltip que lo envuelve SÍ se abre', () => {
    // Tooltip clona el hijo y le inyecta un ref para medir dónde posicionarse;
    // si el ref no llega (function component sin forwardRef), sale temprano y
    // el tooltip nunca aparece. Toda la barra del editor de PDF depende de
    // este contrato: sus pistas de hover son <Tooltip><IconButton/></Tooltip>.
    vi.useFakeTimers()
    try {
      render(
        <Tooltip content="Eliminar anotación" delayMs={200}>
          <IconButton label="Eliminar">i</IconButton>
        </Tooltip>,
      )
      act(() => {
        fireEvent.mouseEnter(screen.getByRole('button', { name: 'Eliminar' }))
      })
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(screen.getByRole('tooltip')).toHaveTextContent('Eliminar anotación')
    } finally {
      vi.useRealTimers()
    }
  })
})
