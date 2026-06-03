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

const reveal = vi.fn()
vi.mock('../../hooks/useModuleVisibility', () => ({
  useModuleVisibility: () => ({ isVisible: () => false, reveal }),
}))

import { NotasGlobalSearch } from './NotasGlobalSearch'

describe('<NotasGlobalSearch /> — comando de reveal', () => {
  it('escribir "#pass" ofrece revelar Claves y lo dispara + navega', () => {
    const onNavigate = vi.fn()
    render(<NotasGlobalSearch onNavigate={onNavigate} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar en notas/i), {
      target: { value: '#pass' },
    })
    // Como Claves está oculta (isVisible=false), el botón dice "Revelar".
    fireEvent.click(screen.getByRole('button', { name: /revelar claves/i }))
    expect(reveal).toHaveBeenCalledWith('claves')
    expect(onNavigate).toHaveBeenCalledWith('claves')
  })

  it('un texto normal no ofrece reveal', () => {
    render(<NotasGlobalSearch onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar en notas/i), {
      target: { value: 'reunión' },
    })
    expect(screen.queryByRole('button', { name: /revelar/i })).toBeNull()
  })
})
