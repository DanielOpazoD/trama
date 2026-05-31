import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AIPanel } from './AIPanel'

vi.mock('../AITaskSettings', () => ({
  AITaskSettings: () => <div>configuración por tarea mock</div>,
}))

describe('<AIPanel />', () => {
  it('muestra header editorial y la configuración de tareas IA', () => {
    render(<AIPanel />)

    expect(screen.getByRole('heading', { name: 'IA por tarea' })).toBeInTheDocument()
    expect(screen.getByText(/Cada flujo de IA puede usar/i)).toBeInTheDocument()
    expect(screen.getByText('configuración por tarea mock')).toBeInTheDocument()
  })
})
