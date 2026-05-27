import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppPinGate, isPinEnabled, setPinEnabled } from './AppPinGate'

const ENABLED_KEY = 'trama:pin-enabled'
const UNLOCKED_KEY = 'trama:pin-unlocked'

beforeEach(() => {
  // Reset storage entre tests
  window.localStorage.clear()
  window.sessionStorage.clear()
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

  it('unlocks on correct PIN (151219) and reveals children', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    const input = screen.getByLabelText('PIN') as HTMLInputElement
    fireEvent.change(input, { target: { value: '151219' } })
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }))
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('rejects wrong PIN and shows error message', () => {
    setPinEnabled(true)
    render(
      <AppPinGate>
        <div data-testid="app-content">trama dentro</div>
      </AppPinGate>,
    )
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }))
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrecto/i)
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
