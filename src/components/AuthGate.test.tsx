import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'

const clerkState = vi.hoisted(() => ({ signedIn: false }))

type ClerkAppearance = {
  elements?: Record<string, unknown>
}

vi.mock('@clerk/react', () => ({
  Show: ({
    children,
    fallback,
  }: {
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (clerkState.signedIn ? <>{children}</> : <>{fallback}</>),
  SignIn: ({
    routing,
    signUpUrl,
    appearance,
  }: {
    routing?: string
    signUpUrl?: string
    appearance?: ClerkAppearance
  }) => (
    <div
      data-testid="clerk-sign-in"
      data-routing={routing}
      data-sign-up-url={signUpUrl}
      data-quiet-footer={String(Boolean(appearance?.elements?.footerItem))}
      data-quiet-dev-mode={String(Boolean(appearance?.elements?.footerItemText))}
    />
  ),
  SignUp: ({
    routing,
    signInUrl,
    appearance,
  }: {
    routing?: string
    signInUrl?: string
    appearance?: ClerkAppearance
  }) => (
    <div
      data-testid="clerk-sign-up"
      data-routing={routing}
      data-sign-in-url={signInUrl}
      data-quiet-footer={String(Boolean(appearance?.elements?.footerItem))}
      data-quiet-dev-mode={String(Boolean(appearance?.elements?.footerItemText))}
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
    expect(screen.getByRole('img', { name: 'Mascota de Trama' })).toHaveAttribute(
      'tabindex',
      '0',
    )
    expect(screen.getByRole('img', { name: 'Mascota de Trama' })).toHaveClass(
      'trama-mascot--loginAwake',
    )
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

  it('passes a quieter Clerk footer appearance to the embedded auth widgets', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')

    const { rerender } = render(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute(
      'data-quiet-footer',
      'true',
    )
    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute(
      'data-quiet-dev-mode',
      'true',
    )

    window.location.hash = '#sign-up'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    rerender(
      <AuthGate>
        <div data-testid="app-shell">Trama app</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('clerk-sign-up')).toHaveAttribute(
      'data-quiet-footer',
      'true',
    )
    expect(screen.getByTestId('clerk-sign-up')).toHaveAttribute(
      'data-quiet-dev-mode',
      'true',
    )
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
