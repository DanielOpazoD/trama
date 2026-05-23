import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

describe('<Tooltip />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no renderiza nada al inicio', () => {
    render(
      <Tooltip content="hola">
        <button>btn</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('aparece tras hover con delay', async () => {
    render(
      <Tooltip content="hola" delayMs={200}>
        <button>btn</button>
      </Tooltip>,
    )
    const btn = screen.getByText('btn')
    // Trigger mouseEnter manualmente (userEvent con fake timers es delicado)
    act(() => {
      fireEvent.mouseEnter(btn)
    })
    // Antes del delay: no aparece
    expect(screen.queryByRole('tooltip')).toBeNull()
    // Tras el delay: aparece
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('hola')
  })

  it('desaparece al mouseLeave', () => {
    render(
      <Tooltip content="hola" delayMs={100}>
        <button>btn</button>
      </Tooltip>,
    )
    const btn = screen.getByText('btn')
    act(() => {
      fireEvent.mouseEnter(btn)
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    act(() => {
      fireEvent.mouseLeave(btn)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('aparece con focus (keyboard nav)', () => {
    render(
      <Tooltip content="info" delayMs={100}>
        <button>btn</button>
      </Tooltip>,
    )
    const btn = screen.getByText('btn')
    act(() => {
      btn.focus()
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('Esc cierra el tooltip cuando está abierto', () => {
    render(
      <Tooltip content="info" delayMs={50}>
        <button>btn</button>
      </Tooltip>,
    )
    const btn = screen.getByText('btn')
    act(() => {
      fireEvent.mouseEnter(btn)
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('preserva handlers del child', async () => {
    vi.useRealTimers()
    const onClick = vi.fn()
    render(
      <Tooltip content="info">
        <button onClick={onClick}>btn</button>
      </Tooltip>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByText('btn'))
    expect(onClick).toHaveBeenCalled()
  })

  it('asigna aria-describedby al child cuando abre', () => {
    render(
      <Tooltip content="info" delayMs={50}>
        <button>btn</button>
      </Tooltip>,
    )
    const btn = screen.getByText('btn') as HTMLButtonElement
    expect(btn.getAttribute('aria-describedby')).toBeNull()
    act(() => {
      fireEvent.mouseEnter(btn)
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    const id = btn.getAttribute('aria-describedby')
    expect(id).toMatch(/^tt-/)
    expect(screen.getByRole('tooltip').id).toBe(id)
  })
})
