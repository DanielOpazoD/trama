import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { WorldSwitcher } from './WorldSwitcher'

describe('<WorldSwitcher />', () => {
  it('usa el isotipo nuevo como marca del header', () => {
    const { container } = renderWithProviders(
      <WorldSwitcher world="trama" onChangeWorld={() => {}} />,
    )

    const mark = container.querySelector('img[src="/favicon-48.png"]')
    expect(mark).toBeInTheDocument()
  })

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

  it('delega la precarga de mundos como intención del shell', () => {
    const onWorldIntent = vi.fn()
    renderWithProviders(
      <WorldSwitcher
        world="trama"
        onChangeWorld={() => {}}
        onWorldIntent={onWorldIntent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Mundo actual/ }))
    fireEvent.mouseEnter(screen.getByRole('menuitemradio', { name: /Notas/ }))
    fireEvent.focus(screen.getByRole('menuitemradio', { name: /Notas/ }))

    expect(onWorldIntent).toHaveBeenCalledWith('notas')
    expect(onWorldIntent).toHaveBeenCalledTimes(2)
  })
})
