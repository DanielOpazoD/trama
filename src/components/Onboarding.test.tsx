import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from './Onboarding'

describe('<Onboarding />', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('no abre cuando está deshabilitado o ya fue completado', () => {
    const { rerender } = render(<Onboarding enabled={false} onComplete={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    window.localStorage.setItem('trama:onboarded', '1')
    rerender(<Onboarding enabled onComplete={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('permite avanzar, retroceder y completar el tour', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(<Onboarding enabled onComplete={onComplete} />)

    expect(screen.getByRole('dialog', { name: 'Bienvenido a Trama' })).toBeInTheDocument()
    expect(screen.getByText('Trama es un mapa de tus afinidades.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sigue' }))
    expect(screen.getByText('Pega un párrafo.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Atrás' }))
    expect(screen.getByText('Trama es un mapa de tus afinidades.')).toBeInTheDocument()

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')

    expect(onComplete).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('trama:onboarded')).toBe('1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('permite saltar el tour con Escape', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(<Onboarding enabled onComplete={onComplete} />)

    await user.keyboard('{Escape}')

    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('usa el onComplete vigente al cerrar con teclado', async () => {
    const user = userEvent.setup()
    const initialOnComplete = vi.fn()
    const currentOnComplete = vi.fn()

    const { rerender } = render(<Onboarding enabled onComplete={initialOnComplete} />)
    rerender(<Onboarding enabled onComplete={currentOnComplete} />)

    await user.keyboard('{Escape}')

    expect(initialOnComplete).not.toHaveBeenCalled()
    expect(currentOnComplete).toHaveBeenCalledOnce()
  })
})
