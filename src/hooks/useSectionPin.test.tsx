import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockData: { pinnedSections?: Record<string, boolean> } | undefined = {}
let mockPlaceholder = false
const saveMock = vi.fn()
vi.mock('../state', () => ({
  useUserPrefs: () => ({ data: mockData, isPlaceholderData: mockPlaceholder }),
  useSaveUserPrefs: () => ({ mutate: saveMock }),
}))

import { useSectionPin } from './useSectionPin'

beforeEach(() => {
  mockData = {}
  mockPlaceholder = false
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

  it('fuera de la sección esconde el contenido hasta que responde el servidor', () => {
    mockPlaceholder = true
    const { result, rerender } = renderHook(() => useSectionPin())
    expect(result.current.isContentHidden('notas:notas')).toBe(true)
    mockPlaceholder = false
    rerender()
    expect(result.current.isContentHidden('notas:notas')).toBe(false)
  })

  it('con las preferencias del servidor esconde solo lo protegido, y sin ellas todo', () => {
    mockData = { pinnedSections: { 'notas:notas': true } }
    const { result, rerender } = renderHook(() => useSectionPin())
    expect(result.current.isContentHidden('notas:notas')).toBe(true)
    expect(result.current.isContentHidden('notas:tareas')).toBe(false)
    mockData = undefined
    rerender()
    expect(result.current.isContentHidden('notas:tareas')).toBe(true)
  })

  it('setPinRequired persiste el cambio', () => {
    mockData = { pinnedSections: {} }
    const { result } = renderHook(() => useSectionPin())
    result.current.setPinRequired('grafo', true)
    expect(saveMock).toHaveBeenCalledWith({ pinnedSections: { grafo: true } })
  })
})
