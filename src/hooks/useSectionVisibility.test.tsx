import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockData: { visibleSections?: Record<string, boolean> } = {}
const saveMock = vi.fn()
vi.mock('../state', () => ({
  useUserPrefs: () => ({ data: mockData }),
  useSaveUserPrefs: () => ({ mutate: saveMock }),
}))

import { useSectionVisibility } from './useSectionVisibility'

beforeEach(() => {
  mockData = {}
  saveMock.mockClear()
})

describe('useSectionVisibility', () => {
  it('por defecto todo es visible', () => {
    const { result } = renderHook(() => useSectionVisibility())
    expect(result.current.isVisible('grafo')).toBe(true)
    expect(result.current.isVisible('inicio')).toBe(true)
  })

  it('un flag false oculta la sección', () => {
    mockData = { visibleSections: { grafo: false } }
    const { result } = renderHook(() => useSectionVisibility())
    expect(result.current.isVisible('grafo')).toBe(false)
    expect(result.current.isVisible('inicio')).toBe(true)
  })

  it('setVisible persiste el cambio', () => {
    mockData = { visibleSections: {} }
    const { result } = renderHook(() => useSectionVisibility())
    result.current.setVisible('grafo', false)
    expect(saveMock).toHaveBeenCalledWith({ visibleSections: { grafo: false } })
  })

  it('showAll resetea a todo visible', () => {
    const { result } = renderHook(() => useSectionVisibility())
    result.current.showAll()
    expect(saveMock).toHaveBeenCalledWith({ visibleSections: {} })
  })
})
