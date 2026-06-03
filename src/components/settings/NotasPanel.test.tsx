import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const setVisible = vi.fn()
const showAll = vi.fn()
const save = vi.fn()
let prefsData: { defaultWorld?: string } = {}

vi.mock('../../hooks/useModuleVisibility', () => ({
  useModuleVisibility: () => ({
    isVisible: () => true,
    setVisible,
    showAll,
    reveal: vi.fn(),
    visibleModules: {},
  }),
}))
vi.mock('../../state', () => ({
  useUserPrefs: () => ({ data: prefsData }),
  useSaveUserPrefs: () => ({ mutate: save }),
}))

import { NotasPanel } from './NotasPanel'

beforeEach(() => {
  setVisible.mockClear()
  showAll.mockClear()
  save.mockClear()
  prefsData = {}
})

describe('<NotasPanel />', () => {
  it('lista las secciones; togglear una llama setVisible; inicio está bloqueado', () => {
    render(<NotasPanel />)
    expect(screen.getByText('Claves')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /claves/i }))
    expect(setVisible).toHaveBeenCalledWith('claves', false) // visible → ocultar
    expect(screen.getByRole('button', { name: /inicio/i })).toBeDisabled()
  })

  it('elegir el mundo default guarda la preferencia', () => {
    render(<NotasPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Notas' }))
    expect(save).toHaveBeenCalledWith({ defaultWorld: 'notas' })
  })

  it('"Mostrar todo" resetea la visibilidad', () => {
    render(<NotasPanel />)
    fireEvent.click(screen.getByRole('button', { name: /mostrar todo/i }))
    expect(showAll).toHaveBeenCalled()
  })
})
