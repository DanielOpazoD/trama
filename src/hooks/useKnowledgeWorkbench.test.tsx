import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_WORKBENCH_STORAGE_KEY,
  useKnowledgeWorkbench,
} from './useKnowledgeWorkbench'

describe('useKnowledgeWorkbench', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('alterna, elimina, limpia y persiste ids seleccionados', () => {
    const { result, rerender } = renderHook(() => useKnowledgeWorkbench())

    expect(result.current.selectedIds).toEqual([])
    expect(result.current.isSelected('recorte:r1')).toBe(false)

    act(() => result.current.toggleItem('recorte:r1'))
    expect(result.current.selectedIds).toEqual(['recorte:r1'])
    expect(result.current.isSelected('recorte:r1')).toBe(true)
    expect(window.localStorage.getItem(KNOWLEDGE_WORKBENCH_STORAGE_KEY)).toBe(
      '["recorte:r1"]',
    )

    rerender()
    expect(result.current.selectedIds).toEqual(['recorte:r1'])

    act(() => result.current.toggleItem('note:n1'))
    expect(result.current.selectedIds).toEqual(['recorte:r1', 'note:n1'])

    act(() => result.current.toggleItem('recorte:r1'))
    expect(result.current.selectedIds).toEqual(['note:n1'])

    act(() => result.current.removeItem('note:n1'))
    expect(result.current.selectedIds).toEqual([])

    act(() => result.current.toggleItem('task:t1'))
    act(() => result.current.clear())
    expect(result.current.selectedIds).toEqual([])
    expect(window.localStorage.getItem(KNOWLEDGE_WORKBENCH_STORAGE_KEY)).toBe('[]')
  })
})
