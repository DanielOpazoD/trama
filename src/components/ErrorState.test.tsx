import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorState } from './ErrorState'

describe('<ErrorState />', () => {
  it('usa un título por defecto y se anuncia como alert', () => {
    render(<ErrorState />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText('No se pudo cargar')).toBeInTheDocument()
  })

  it('permite override de título y body', () => {
    render(<ErrorState title="Atlas caído" body="detalle puntual." />)
    expect(screen.getByText('Atlas caído')).toBeInTheDocument()
    expect(screen.getByText('detalle puntual.')).toBeInTheDocument()
  })

  it('no muestra botón de reintentar si no se pasa onRetry', () => {
    render(<ErrorState />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('dispara onRetry al hacer clic en reintentar', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('deshabilita el botón y cambia el texto mientras reintenta', () => {
    render(<ErrorState onRetry={() => {}} retrying />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent(/reintentando/i)
  })
})
