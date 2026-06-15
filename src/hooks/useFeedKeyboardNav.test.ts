import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { isTypingTarget, useFeedKeyboardNav } from './useFeedKeyboardNav'

afterEach(() => vi.restoreAllMocks())

describe('isTypingTarget', () => {
  it('es true para input/textarea/select', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
  })

  it('es true para contenteditable', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'isContentEditable', { value: true })
    expect(isTypingTarget(el)).toBe(true)
  })

  it('es false para elementos no editables y para null', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

/** Dispara un keydown en `document` desde un target dado. */
function press(key: string, target: EventTarget = document.body) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'target', { value: target })
  document.dispatchEvent(ev)
  return ev
}

describe('useFeedKeyboardNav', () => {
  function setup(overrides = {}) {
    const onFocusComposer = vi.fn()
    const onOpenSearch = vi.fn()
    const onActivate = vi.fn()
    const hook = renderHook(() =>
      useFeedKeyboardNav({
        enabled: true,
        itemCount: 3,
        onFocusComposer,
        onOpenSearch,
        onActivate,
        ...overrides,
      }),
    )
    return { hook, onFocusComposer, onOpenSearch, onActivate }
  }

  it('`n` enfoca el composer y `/` abre el buscador', () => {
    const { onFocusComposer, onOpenSearch } = setup()
    act(() => void press('n'))
    expect(onFocusComposer).toHaveBeenCalledTimes(1)
    act(() => void press('/'))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('NO dispara mientras se escribe en un input (guard)', () => {
    const { onFocusComposer, onOpenSearch } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => void press('n', input))
    act(() => void press('/', input))
    expect(onFocusComposer).not.toHaveBeenCalled()
    expect(onOpenSearch).not.toHaveBeenCalled()
    input.remove()
  })

  it('NO dispara con modificadores (Ⓒ/⌘/⎇)', () => {
    const { onFocusComposer } = setup()
    const ev = new KeyboardEvent('keydown', { key: 'n', metaKey: true })
    Object.defineProperty(ev, 'target', { value: document.body })
    act(() => void document.dispatchEvent(ev))
    expect(onFocusComposer).not.toHaveBeenCalled()
  })

  it('`j`/`k` mueven la selección dentro de los límites', () => {
    const { hook } = setup()
    expect(hook.result.current.selected).toBeNull()
    act(() => void press('j'))
    expect(hook.result.current.selected).toBe(0)
    act(() => void press('j'))
    expect(hook.result.current.selected).toBe(1)
    act(() => void press('j'))
    act(() => void press('j'))
    expect(hook.result.current.selected).toBe(2) // capeado en itemCount-1
    act(() => void press('k'))
    expect(hook.result.current.selected).toBe(1)
    act(() => void press('k'))
    act(() => void press('k'))
    expect(hook.result.current.selected).toBe(0) // capeado en 0
  })

  it('Enter sobre una tarjeta seleccionada llama onActivate', () => {
    const { onActivate } = setup()
    act(() => void press('j'))
    act(() => void press('Enter'))
    expect(onActivate).toHaveBeenCalledWith(0)
  })

  it('Escape limpia la selección', () => {
    const { hook } = setup()
    act(() => void press('j'))
    expect(hook.result.current.selected).toBe(0)
    act(() => void press('Escape'))
    expect(hook.result.current.selected).toBeNull()
  })

  it('cuando enabled=false no engancha el listener', () => {
    const { onFocusComposer } = setup({ enabled: false })
    act(() => void press('n'))
    expect(onFocusComposer).not.toHaveBeenCalled()
  })

  it('si la lista se encoge, la selección no queda fuera de rango', () => {
    const onFocusComposer = vi.fn()
    const onOpenSearch = vi.fn()
    const { result, rerender } = renderHook(
      ({ itemCount }) =>
        useFeedKeyboardNav({
          enabled: true,
          itemCount,
          onFocusComposer,
          onOpenSearch,
        }),
      { initialProps: { itemCount: 3 } },
    )
    act(() => void press('j'))
    act(() => void press('j'))
    expect(result.current.selected).toBe(1)
    rerender({ itemCount: 1 })
    expect(result.current.selected).toBeNull()
  })
})
