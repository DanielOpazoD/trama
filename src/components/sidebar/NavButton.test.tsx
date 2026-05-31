import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NavButton, type NavItem } from './NavButton'

const TestIcon = ({ size = 14, className }: { size?: number; className?: string }) => (
  <svg data-testid="test-icon" width={size} height={size} className={className} />
)

const item: NavItem = { value: 'entidades', label: 'Entidades', icon: TestIcon }

describe('<NavButton />', () => {
  it('renderiza el modo expandido con label, contador y aria-label equivalente', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <NavButton
        item={item}
        active
        count={12}
        mode="expanded"
        accentColor="rgb(10 20 30)"
        onClick={onClick}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Entidades 12' }))

    expect(screen.getByText('Entidades')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('oculta el badge con count cero y conserva el label accesible', () => {
    render(
      <NavButton
        item={item}
        active={false}
        count={0}
        mode="expanded"
        onClick={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Entidades' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renderiza el modo colapsado como icon button con contador superpuesto', () => {
    render(
      <NavButton
        item={item}
        active
        count={3}
        mode="collapsed"
        badgeTone="accent"
        onClick={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Entidades 3' })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
