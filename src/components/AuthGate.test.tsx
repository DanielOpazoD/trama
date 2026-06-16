import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'

const clerkState = vi.hoisted(() => ({ signedIn: false }))

vi.mock('@clerk/react', () => ({
  Show: ({
    children,
    fallback,
  }: {
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (clerkState.signedIn ? <>{children}</> : <>{fallback}</>),
  SignIn: ({ routing, signUpUrl }: { routing?: string; signUpUrl?: string }) => (
    <div
      data-testid="clerk-sign-in"
      data-routing={routing}
      data-sign-up-url={signUpUrl}
    />
  ),
  SignUp: ({ routing, signInUrl }: { routing?: string; signInUrl?: string }) => (
    <div
      data-testid="clerk-sign-up"
      data-routing={routing}
      data-sign-in-url={signInUrl}
    />
  ),
}))

describe('AuthGate', () => {
  beforeEach(() => {
    clerkState.signedIn = false
    vi.stubEnv('VITE_TRAMA_E2E_BYPASS_CLERK', '')
    window.location.hash = ''
    localStorage.clear()
  })

  it('renders the app directly when Clerk is not configured', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
  })

  it('renders the Clerk sign-in screen when Clerk is configured and the user is signed out', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute('data-routing', 'hash')
    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute(
      'data-sign-up-url',
      '/#sign-up',
    )
    expect(screen.getByText('Trama')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mascota de Trama' })).toBeInTheDocument()
    expect(screen.getByTestId('login-mascot-seal')).toContainElement(
      screen.getByRole('img', { name: 'Mascota de Trama' }),
    )
    expect(screen.getByText('tu archivo vivo')).toBeInTheDocument()
    expect(screen.getByTestId('login-thread-field')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByText('explorar sin cuenta')).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
  })

  it('renders embedded Clerk sign-up when the auth hash requests registration', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')
    window.location.hash = '#sign-up'

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('clerk-sign-up')).toHaveAttribute('data-routing', 'hash')
    expect(screen.getByTestId('clerk-sign-up')).toHaveAttribute(
      'data-sign-in-url',
      '/#sign-in',
    )
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
    expect(screen.getByText('Trama')).toBeInTheDocument()
  })

  it('renders the app directly when the E2E Clerk bypass is enabled', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')
    vi.stubEnv('VITE_TRAMA_E2E_BYPASS_CLERK', '1')

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
  })

  it('renders the app when Clerk is configured and the user is signed in', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')
    clerkState.signedIn = true

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
  })

  it('coloca el banner demo abajo, sobre la barra de captura (no tapa las tabs)', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')
    localStorage.setItem('trama-demo', '1')

    render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    const banner = screen.getByText('modo prueba').closest('div')

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(banner).toHaveClass('bottom-28')
    expect(banner).toHaveClass('md:bottom-3')
    expect(banner).not.toHaveClass('top-14')
  })
})
