import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './toast'

describe('ToastProvider + useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function wrap(children: React.ReactNode) {
    return <ToastProvider>{children}</ToastProvider>
  }

  it('arranca con current === null', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    expect(result.current.current).toBeNull()
  })

  it('show() activa el toast y dismiss() lo cierra', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    act(() => {
      result.current.show({ message: 'Hola' })
    })
    expect(result.current.current?.message).toBe('Hola')
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.current).toBeNull()
  })

  it('auto-dismiss tras durationMs', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    act(() => {
      result.current.show({ message: 'Efímero', durationMs: 1000 })
    })
    expect(result.current.current?.message).toBe('Efímero')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.current).toBeNull()
  })

  it('durationMs: 0 es persistente — no auto-dismiss', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    act(() => {
      result.current.show({ message: 'Sticky', durationMs: 0 })
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.current?.message).toBe('Sticky')
  })

  it('show() reemplaza el toast anterior y reinicia el timer', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    act(() => {
      result.current.show({ message: 'Primero', durationMs: 1000 })
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    act(() => {
      result.current.show({ message: 'Segundo', durationMs: 1000 })
    })
    // Si el timer del primero se cancela, a los 300ms más todavía hay toast
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.current?.message).toBe('Segundo')
    // Y se va a los 1000ms desde el segundo show
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(result.current.current).toBeNull()
  })

  it('action.onAction se llama al gatillarla manualmente', async () => {
    const { result } = renderHook(() => useToast(), { wrapper: ({ children }) => wrap(children) })
    const onAction = vi.fn()
    act(() => {
      result.current.show({
        message: '¿deshacer?',
        action: { label: 'Deshacer', onAction },
      })
    })
    await act(async () => {
      await result.current.current?.action?.onAction()
    })
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
