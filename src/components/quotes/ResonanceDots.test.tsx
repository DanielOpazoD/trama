import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResonanceDots } from './ResonanceDots'

/**
 * Tests del ResonanceDots — el componente de 5 puntos para marcar
 * "cuánto resuena hoy" una cita. Cubre:
 *   - render con valor undefined (todos vacíos)
 *   - render con valor N (N filled, 5-N empty)
 *   - click pone el valor
 *   - click en dot activo lo destildea (vuelve a null)
 *   - disabled no dispara onChange
 *   - aria-* correcto para accesibilidad
 */
describe('<ResonanceDots />', () => {
  it('renderiza 5 puntos, todos vacíos si value=undefined', () => {
    render(<ResonanceDots value={undefined} onChange={() => {}} />)
    const dots = screen.getAllByRole('radio')
    expect(dots).toHaveLength(5)
    expect(dots.every((d) => d.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('marca el dot N como aria-checked cuando value=N', () => {
    render(<ResonanceDots value={3} onChange={() => {}} />)
    const dots = screen.getAllByRole('radio')
    expect(dots[2]!.getAttribute('aria-checked')).toBe('true')
    // Los otros no.
    expect(dots[0]!.getAttribute('aria-checked')).toBe('false')
    expect(dots[4]!.getAttribute('aria-checked')).toBe('false')
  })

  it('click en un dot dispara onChange con ese valor', async () => {
    const onChange = vi.fn()
    render(<ResonanceDots value={undefined} onChange={onChange} />)
    const user = userEvent.setup()
    const dots = screen.getAllByRole('radio')
    await user.click(dots[3]!)
    expect(onChange).toHaveBeenCalledWith(4) // dots son 1-5, index 3 = valor 4
  })

  it('click en el dot ya activo destildea (onChange con null)', async () => {
    const onChange = vi.fn()
    render(<ResonanceDots value={2} onChange={onChange} />)
    const user = userEvent.setup()
    const dots = screen.getAllByRole('radio')
    await user.click(dots[1]!) // valor 2 = index 1
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('disabled no dispara onChange', async () => {
    const onChange = vi.fn()
    render(<ResonanceDots value={undefined} onChange={onChange} disabled />)
    const user = userEvent.setup()
    const dots = screen.getAllByRole('radio')
    await user.click(dots[0]!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('label "resuena hoy" se omite con showLabel=false', () => {
    const { rerender } = render(<ResonanceDots value={undefined} onChange={() => {}} />)
    expect(screen.getByText(/resuena hoy/i)).toBeInTheDocument()

    rerender(<ResonanceDots value={undefined} onChange={() => {}} showLabel={false} />)
    expect(screen.queryByText(/resuena hoy/i)).toBeNull()
  })

  it('radiogroup tiene aria-label descriptivo', () => {
    render(<ResonanceDots value={undefined} onChange={() => {}} />)
    expect(
      screen.getByRole('radiogroup', { name: /resonancia.*escala de 1 a 5/i }),
    ).toBeInTheDocument()
  })
})
