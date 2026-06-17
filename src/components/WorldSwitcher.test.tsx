import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { WorldSwitcher } from './WorldSwitcher'

const notasWorldModule = vi.hoisted(() => ({
  loaded: vi.fn(),
}))

vi.mock('./notas/NotasWorld', () => {
  notasWorldModule.loaded()
  return { NotasWorld: () => null }
})

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

  it('precarga Notas por intención antes del click', async () => {
    renderWithProviders(<WorldSwitcher world="trama" onChangeWorld={() => {}} />)

    expect(notasWorldModule.loaded).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Mundo actual/ }))
    fireEvent.mouseEnter(screen.getByRole('menuitemradio', { name: /Notas/ }))

    await waitFor(() => expect(notasWorldModule.loaded).toHaveBeenCalled())
  })
})
