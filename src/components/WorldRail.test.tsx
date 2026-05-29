import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { WorldRail } from './WorldRail'

describe('<WorldRail />', () => {
  it('renderiza los mundos y marca el activo con aria-current', () => {
    renderWithProviders(<WorldRail world="trama" onChangeWorld={() => {}} />)
    expect(screen.getByRole('button', { name: 'Trama' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Notas' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('llama onChangeWorld al elegir otro mundo', () => {
    const onChange = vi.fn()
    renderWithProviders(<WorldRail world="trama" onChangeWorld={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notas' }))
    expect(onChange).toHaveBeenCalledWith('notas')
  })
})
