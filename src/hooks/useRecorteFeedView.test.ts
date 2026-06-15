import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRecorteFeedView } from './useRecorteFeedView'

describe('useRecorteFeedView', () => {
  beforeEach(() => window.localStorage.clear())

  it('arranca en lista por defecto', () => {
    const { result } = renderHook(() => useRecorteFeedView())
    expect(result.current[0]).toBe('list')
  })

  it('persiste la elección en localStorage', () => {
    const { result } = renderHook(() => useRecorteFeedView())
    act(() => result.current[1]('galeria'))
    expect(result.current[0]).toBe('galeria')
    expect(window.localStorage.getItem('trama:recorteFeedView')).toBe('galeria')
  })

  it('un valor corrupto del storage cae a lista', () => {
    window.localStorage.setItem('trama:recorteFeedView', 'basura')
    const { result } = renderHook(() => useRecorteFeedView())
    expect(result.current[0]).toBe('list')
  })
})
