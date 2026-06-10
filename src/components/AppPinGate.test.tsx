import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AppPinGate, isPinEnabled, setPinEnabled } from './AppPinGate'

const ENABLED_KEY = 'trama:pin-enabled'
const UNLOCKED_KEY = 'trama:pin-unlocked'

beforeEach(() => {
  // Reset storage entre tests
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('<AppPinGate />', () => {
  it('renders children directly when PIN is not enabled (default)', () => {
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('renders PIN screen when enabled and not yet unlocked', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByText(/Ingresa el PIN/i)).toBeInTheDocument()
  })

  it('unlocks on correct PIN (151219) via PinPad buttons', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    // Simula clic en cada dígito del PIN: 1-5-1-2-1-9
    for (const digit of ['1', '5', '1', '2', '1', '9']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
    // PinPad auto-submits después de un timeout de 200ms
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('unlocks on correct PIN via keyboard', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    const hiddenInput = screen.getByLabelText('PIN')
    for (const key of ['1', '5', '1', '2', '1', '9']) {
      fireEvent.keyDown(hiddenInput, { key })
    }
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('rejects wrong PIN and shows error message', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    // Ingresa un PIN incorrecto: 000000
    for (const digit of ['0', '0', '0', '0', '0', '0']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
    // Error se muestra antes del reset (600ms)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrecto/i)
    // Después de 600ms los dots se limpian
    act(() => {
      vi.advanceTimersByTime(700)
    })
  })

  it('skips lock screen when sessionStorage already has unlock flag', () => {
    setPinEnabled(true)
    window.sessionStorage.setItem(UNLOCKED_KEY, '1')
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })
})

describe('setPinEnabled / isPinEnabled', () => {
  it('setPinEnabled(true) persists in localStorage', () => {
    setPinEnabled(true)
    expect(isPinEnabled()).toBe(true)
    expect(window.localStorage.getItem(ENABLED_KEY)).toBe('1')
  })

  it('setPinEnabled(false) removes the flag', () => {
    setPinEnabled(true)
    setPinEnabled(false)
    expect(isPinEnabled()).toBe(false)
    expect(window.localStorage.getItem(ENABLED_KEY)).toBeNull()
  })

  it('enabling clears any previous session unlock', () => {
    window.sessionStorage.setItem(UNLOCKED_KEY, '1')
    setPinEnabled(true)
    expect(window.sessionStorage.getItem(UNLOCKED_KEY)).toBeNull()
  })
})
