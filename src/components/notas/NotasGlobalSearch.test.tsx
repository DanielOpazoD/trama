import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../state', () => ({
  useNotesQuery: () => ({ data: [] }),
  useTasksQuery: () => ({ data: [] }),
  usePromptsQuery: () => ({ data: [] }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useMarkPromptUsed: () => ({ mutate: vi.fn() }),
  useToast: () => ({ show: vi.fn() }),
}))

vi.mock('../../hooks/useModuleVisibility', () => ({
  useModuleVisibility: () => ({ isVisible: () => false }),
}))

import { NotasGlobalSearch } from './NotasGlobalSearch'

describe('<NotasGlobalSearch /> — comando de reveal', () => {
  it('escribir "#pass" permite navegar a Claves aunque esté oculta', () => {
    const onNavigate = vi.fn()
    render(<NotasGlobalSearch onNavigate={onNavigate} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar en notas/i), {
      target: { value: '#pass' },
    })
    // Como Claves está oculta (isVisible=false), ahora el botón navega igual.
    fireEvent.click(screen.getByRole('button', { name: /claves/i }))
    expect(onNavigate).toHaveBeenCalledWith('claves')
  })

  it('un texto normal no ofrece reveal', () => {
    render(<NotasGlobalSearch onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar en notas/i), {
      target: { value: 'reunión' },
    })
    expect(screen.queryByRole('button', { name: /claves/i })).toBeNull()
  })
})
