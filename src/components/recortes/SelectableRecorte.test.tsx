import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SelectableRecorte } from './SelectableRecorte'

describe('<SelectableRecorte />', () => {
  it('fuera del modo selección renderiza el hijo tal cual (sin checkbox)', () => {
    render(
      <SelectableRecorte
        selectionMode={false}
        selected={false}
        onToggleSelect={vi.fn()}
        label="x"
      >
        <div>contenido</div>
      </SelectableRecorte>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('en modo selección muestra checkbox y toggle con clic y teclado', async () => {
    const onToggle = vi.fn()
    render(
      <SelectableRecorte
        selectionMode
        selected={false}
        onToggleSelect={onToggle}
        label="Seleccionar captura"
      >
        <div>contenido</div>
      </SelectableRecorte>,
    )
    const box = screen.getByRole('checkbox', { name: /seleccionar captura/i })
    expect(box).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(box)
    expect(onToggle).toHaveBeenCalledTimes(1)
    box.focus()
    await userEvent.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(2)
  })
})
