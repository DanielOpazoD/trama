import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockData: { visibleModules?: Record<string, boolean> } = {}
const saveMock = vi.fn()
vi.mock('../state', () => ({
  useUserPrefs: () => ({ data: mockData }),
  useSaveUserPrefs: () => ({ mutate: saveMock }),
}))

import { useModuleVisibility } from './useModuleVisibility'

beforeEach(() => {
  mockData = {}
  saveMock.mockClear()
})

describe('useModuleVisibility', () => {
  it('por defecto todo es visible', () => {
    const { result } = renderHook(() => useModuleVisibility())
    expect(result.current.isVisible('claves')).toBe(true)
    expect(result.current.isVisible('inicio')).toBe(true)
  })

  it('un flag false oculta la sección; todas son configurables', () => {
    mockData = { visibleModules: { claves: false, inicio: false } }
    const { result } = renderHook(() => useModuleVisibility())
    expect(result.current.isVisible('claves')).toBe(false)
    expect(result.current.isVisible('inicio')).toBe(false)
  })

  it('setVisible persiste el mapa completo para cualquier sección', () => {
    mockData = { visibleModules: {} }
    const { result } = renderHook(() => useModuleVisibility())
    result.current.setVisible('claves', false)
    expect(saveMock).toHaveBeenCalledWith({ visibleModules: { claves: false } })
    saveMock.mockClear()
    result.current.setVisible('inicio', false)
    expect(saveMock).toHaveBeenCalledWith({ visibleModules: { inicio: false } })
  })

  it('showAll resetea a todo visible', () => {
    const { result } = renderHook(() => useModuleVisibility())
    result.current.showAll()
    expect(saveMock).toHaveBeenCalledWith({ visibleModules: {} })
  })
})
