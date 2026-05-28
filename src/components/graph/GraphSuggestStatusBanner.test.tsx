import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphSuggestStatusBanner } from './GraphSuggestStatusBanner'

describe('<GraphSuggestStatusBanner />', () => {
  it('si error es null, muestra el mensaje "sin relaciones nuevas"', () => {
    render(<GraphSuggestStatusBanner error={null} onClose={() => {}} />)
    expect(screen.getByRole('status').textContent).toMatch(/sin relaciones nuevas/i)
  })

  it('si hay error, muestra el message del error con clase alert-error', () => {
    const err = new Error('LLM falló: rate limited')
    render(<GraphSuggestStatusBanner error={err} onClose={() => {}} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('LLM falló: rate limited')
    // La clase alert-error señala el estilo rojo. No la testeamos a
    // nivel CSS, sí a nivel className.
    expect(status.className).toMatch(/alert-error/)
  })

  it('en modo neutral (sin error) NO usa alert-error', () => {
    render(<GraphSuggestStatusBanner error={null} onClose={() => {}} />)
    expect(screen.getByRole('status').className).not.toMatch(/alert-error/)
  })

  it('dispara onClose al click en el botón Cerrar', async () => {
    const onClose = vi.fn()
    render(<GraphSuggestStatusBanner error={null} onClose={onClose} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cerrar aviso/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
