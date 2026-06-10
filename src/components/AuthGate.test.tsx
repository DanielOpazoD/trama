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
  SignIn: ({ routing }: { routing?: string }) => (
    <div data-testid="clerk-sign-in" data-routing={routing} />
  ),
}))

describe('AuthGate', () => {
  beforeEach(() => {
    clerkState.signedIn = false
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
    expect(screen.getByText('Trama')).toBeInTheDocument()
    expect(screen.getByText('explorar en modo prueba')).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
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
