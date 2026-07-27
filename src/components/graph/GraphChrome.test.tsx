import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GraphChrome } from './GraphChrome'

function renderToolbar(overrides: Partial<Parameters<typeof GraphChrome>[0]> = {}) {
  const props: Parameters<typeof GraphChrome>[0] = {
    mode: 'by-degree',
    onModeChange: vi.fn(),
    onReorganize: vi.fn(),
    onSuggest: vi.fn(),
    suggestPending: false,
    suggestDisabled: false,
    zoomPercent: 125,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetView: vi.fn(),
    entityCount: 8,
    relationshipCount: 5,
    graphMode: 'exploratorio',
    onGraphModeChange: vi.fn(),
    focusName: 'Borges',
    truncated: true,
    onFocusSelected: vi.fn(),
    focusSelectedDisabled: false,
    ...overrides,
  }
  render(<GraphChrome {...props} />)
  return props
}

describe('<GraphChrome />', () => {
  it('permite cambiar layout, modo de grafo y foco exploratorio', async () => {
    const user = userEvent.setup()
    const props = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'orgánico' }))
    await user.click(screen.getByRole('button', { name: 'completo' }))
    await user.click(screen.getByRole('button', { name: 'hacer foco' }))

    expect(props.onModeChange).toHaveBeenCalledWith('organic')
    expect(props.onGraphModeChange).toHaveBeenCalledWith('completo')
    expect(props.onFocusSelected).toHaveBeenCalledOnce()
    expect(screen.getByText(/8 entidades · 5 relaciones/i)).toBeInTheDocument()
    expect(screen.getByText(/truncado/i)).toBeInTheDocument()
    expect(screen.getByText(/foco: Borges/i)).toBeInTheDocument()
  })

  it('maneja descubrir IA, reorganizar y controles de zoom', async () => {
    const user = userEvent.setup()
    const props = renderToolbar()

    await user.click(screen.getByRole('button', { name: /descubrir IA/i }))
    await user.click(screen.getByRole('button', { name: /reorganizar/i }))
    await user.click(screen.getByRole('button', { name: 'Alejar zoom' }))
    await user.click(screen.getByRole('button', { name: 'Acercar zoom' }))
    await user.click(screen.getByRole('button', { name: 'Centrar vista' }))

    expect(props.onSuggest).toHaveBeenCalledOnce()
    expect(props.onReorganize).toHaveBeenCalledOnce()
    expect(props.onZoomOut).toHaveBeenCalledOnce()
    expect(props.onZoomIn).toHaveBeenCalledOnce()
    expect(props.onResetView).toHaveBeenCalledOnce()
    expect(screen.getByText('125%')).toBeInTheDocument()
  })

  it('deshabilita sugerencias/foco cuando corresponde y muestra estado pendiente', async () => {
    const user = userEvent.setup()
    const props = renderToolbar({
      suggestPending: true,
      focusSelectedDisabled: true,
    })

    await user.click(screen.getByRole('button', { name: /pensando/i }))
    await user.click(screen.getByRole('button', { name: 'hacer foco' }))

    expect(props.onSuggest).not.toHaveBeenCalled()
    expect(props.onFocusSelected).not.toHaveBeenCalled()
  })
})
