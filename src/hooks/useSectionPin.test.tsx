import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockData: { pinnedSections?: Record<string, boolean> } = {}
const saveMock = vi.fn()
vi.mock('../state', () => ({
  useUserPrefs: () => ({ data: mockData }),
  useSaveUserPrefs: () => ({ mutate: saveMock }),
}))

import { useSectionPin } from './useSectionPin'

beforeEach(() => {
  mockData = {}
  saveMock.mockClear()
})

describe('useSectionPin', () => {
  it('por defecto ninguna sección requiere PIN', () => {
    const { result } = renderHook(() => useSectionPin())
    expect(result.current.isPinRequired('grafo')).toBe(false)
  })

  it('si está en el mapa, requiere PIN', () => {
    mockData = { pinnedSections: { grafo: true } }
    const { result } = renderHook(() => useSectionPin())
    expect(result.current.isPinRequired('grafo')).toBe(true)
    expect(result.current.isPinRequired('inicio')).toBe(false)
  })

  it('setPinRequired persiste el cambio', () => {
    mockData = { pinnedSections: {} }
    const { result } = renderHook(() => useSectionPin())
    result.current.setPinRequired('grafo', true)
    expect(saveMock).toHaveBeenCalledWith({ pinnedSections: { grafo: true } })
  })
})
