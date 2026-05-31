import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { PrivacyPanel } from './PrivacyPanel'

describe('<PrivacyPanel />', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  test('renderiza el toggle apagado por defecto y lo persiste al activar', async () => {
    const eventSpy = vi.fn()
    window.addEventListener('trama:pin-changed', eventSpy)

    render(<PrivacyPanel />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(window.localStorage.getItem('trama:pin-enabled')).toBe('1')
    expect(eventSpy).toHaveBeenCalledOnce()

    window.removeEventListener('trama:pin-changed', eventSpy)
  })

  test('cuando el PIN está activo muestra la nota de desbloqueo y permite desactivar', async () => {
    window.localStorage.setItem('trama:pin-enabled', '1')
    render(<PrivacyPanel />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/al recargar o abrir una pestaña nueva/i)).toBeInTheDocument()

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem('trama:pin-enabled')).toBeNull()
  })
})
