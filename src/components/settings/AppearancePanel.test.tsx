import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppearancePanel } from './AppearancePanel'

describe('<AppearancePanel />', () => {
  it('marca el tema activo y permite elegir otro tema (tarjetas radio)', async () => {
    const onSetTheme = vi.fn()
    const user = userEvent.setup()

    render(<AppearancePanel theme="paper" onSetTheme={onSetTheme} />)

    expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeInTheDocument()
    // Las tarjetas son un radiogroup: la activa lleva aria-checked.
    expect(screen.getByRole('radiogroup', { name: /tema/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /papel/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /noche/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    await user.click(screen.getByRole('radio', { name: /noche/i }))
    await user.click(screen.getByRole('radio', { name: /vela/i }))

    expect(onSetTheme).toHaveBeenNthCalledWith(1, 'night')
    expect(onSetTheme).toHaveBeenNthCalledWith(2, 'vela')
  })

  it('cada tarjeta previsualiza su propio tema (hint descriptivo visible)', () => {
    render(<AppearancePanel theme="vela" onSetTheme={() => {}} />)
    expect(screen.getByText(/sepia cálido/i)).toBeInTheDocument()
    expect(screen.getByText(/blanco neutro/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /vela/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
