import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppearancePanel } from './AppearancePanel'

describe('<AppearancePanel />', () => {
  it('marca el tema activo y permite elegir otro tema', async () => {
    const onSetTheme = vi.fn()
    const user = userEvent.setup()

    render(<AppearancePanel theme="paper" onSetTheme={onSetTheme} />)

    expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /papel/i })).toHaveClass('bg-paper-50')

    await user.click(screen.getByRole('button', { name: /noche/i }))
    await user.click(screen.getByRole('button', { name: /vela/i }))

    expect(onSetTheme).toHaveBeenNthCalledWith(1, 'night')
    expect(onSetTheme).toHaveBeenNthCalledWith(2, 'vela')
  })
})
