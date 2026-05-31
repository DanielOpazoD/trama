import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserMenu } from './UserMenu'

const clerkState = vi.hoisted(() => ({ signedIn: false }))

vi.mock('@clerk/react', () => ({
  Show: ({ children }: { children: React.ReactNode }) =>
    clerkState.signedIn ? <>{children}</> : null,
  UserButton: () => <button data-testid="clerk-user-button">Cuenta</button>,
}))

describe('UserMenu', () => {
  beforeEach(() => {
    clerkState.signedIn = false
  })

  it('renders nothing when Clerk is not configured', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')

    const { container } = render(<UserMenu />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when Clerk is configured but the user is signed out', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')

    const { container } = render(<UserMenu />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the Clerk user button when Clerk is configured and the user is signed in', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_trama')
    clerkState.signedIn = true

    render(<UserMenu />)

    expect(screen.getByTestId('clerk-user-button')).toBeInTheDocument()
  })
})
