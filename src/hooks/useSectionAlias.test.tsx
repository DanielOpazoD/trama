import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockData: { sectionAliases?: Record<string, string> } = {}
const saveMock = vi.fn()
vi.mock('../state', () => ({
  useUserPrefs: () => ({ data: mockData }),
  useSaveUserPrefs: () => ({ mutate: saveMock }),
}))

import { useSectionAlias } from './useSectionAlias'

beforeEach(() => {
  mockData = {}
  saveMock.mockClear()
})

describe('useSectionAlias', () => {
  it('por defecto ninguna sección tiene alias', () => {
    const { result } = renderHook(() => useSectionAlias())
    expect(result.current.getAlias('grafo')).toBe('')
  })

  it('devuelve el alias si está configurado', () => {
    mockData = { sectionAliases: { grafo: 'g' } }
    const { result } = renderHook(() => useSectionAlias())
    expect(result.current.getAlias('grafo')).toBe('g')
    expect(result.current.getAlias('inicio')).toBe('')
  })

  it('setAlias persiste el cambio', () => {
    mockData = { sectionAliases: {} }
    const { result } = renderHook(() => useSectionAlias())
    result.current.setAlias('grafo', 'g')
    expect(saveMock).toHaveBeenCalledWith({ sectionAliases: { grafo: 'g' } })
  })
})
