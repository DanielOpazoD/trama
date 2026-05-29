import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { WorldSwitcher } from './WorldSwitcher'

describe('<WorldSwitcher />', () => {
  it('muestra el mundo actual y abre el menú con los mundos', () => {
    renderWithProviders(<WorldSwitcher world="trama" onChangeWorld={() => {}} />)
    const trigger = screen.getByRole('button', { name: /Mundo actual: Trama/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitemradio', { name: /Trama/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: /Notas/ })).toBeInTheDocument()
  })

  it('cambia de mundo al elegir otro del menú', () => {
    const onChange = vi.fn()
    renderWithProviders(<WorldSwitcher world="trama" onChangeWorld={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Mundo actual/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Notas/ }))
    expect(onChange).toHaveBeenCalledWith('notas')
  })
})
