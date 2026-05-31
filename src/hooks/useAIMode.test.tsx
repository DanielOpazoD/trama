import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_MODE_STORAGE_KEY,
  AI_MODEL_STORAGE_KEY,
  aiModeToHeader,
  getAIMode,
  getForcedModel,
  useAIMode,
} from './useAIMode'

describe('useAIMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('lee valores inválidos como auto y convierte headers', () => {
    window.localStorage.setItem(AI_MODE_STORAGE_KEY, 'legacy')
    window.localStorage.setItem(AI_MODEL_STORAGE_KEY, 'gpt-4o')

    expect(getAIMode()).toBe('auto')
    expect(getForcedModel()).toBe('gpt-4o')
    expect(aiModeToHeader('auto')).toBe('auto')
    expect(aiModeToHeader('off')).toBe('off')
    expect(aiModeToHeader('forced-openai')).toBe('forced:openai')
    expect(aiModeToHeader('forced-openai', 'gpt-4o')).toBe('forced:openai:gpt-4o')
  })

  it('persiste modo/modelo y resetea el modelo al cambiar provider', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('forced-openai')
      result.current.setModel('gpt-4o')
    })

    expect(result.current.mode).toBe('forced-openai')
    expect(result.current.model).toBe('gpt-4o')
    expect(window.localStorage.getItem(AI_MODEL_STORAGE_KEY)).toBe('gpt-4o')

    act(() => {
      result.current.setMode('forced-gemini')
    })

    expect(result.current.mode).toBe('forced-gemini')
    expect(result.current.model).toBe('')
    expect(window.localStorage.getItem(AI_MODEL_STORAGE_KEY)).toBe('')
  })

  it('sincroniza otras instancias por evento storage/custom', () => {
    const first = renderHook(() => useAIMode())
    const second = renderHook(() => useAIMode())

    act(() => {
      first.result.current.setMode('off')
    })

    expect(second.result.current.mode).toBe('off')
  })
})
