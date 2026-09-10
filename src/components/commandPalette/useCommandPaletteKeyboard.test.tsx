import { fireEvent, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '../../hooks/useCommandSearch'
import { useCommandPaletteKeyboard } from './useCommandPaletteKeyboard'

const INICIO = { kind: 'view', view: 'inicio', label: 'Inicio' } as Item
const MOMENTOS = { kind: 'view', view: 'momentos', label: 'Momentos' } as Item

function tareaCon(run: () => void, id = 't1') {
  return {
    kind: 'content',
    id: `task:${id}`,
    icon: 'task',
    section: 'tareas',
    label: `Tarea ${id}`,
    secondary: { label: 'hecha', ariaLabel: `Marcar hecha: Tarea ${id}`, run },
  } as Item
}

function promptCon(run: () => void, id: string) {
  return {
    kind: 'content',
    id: `prompt:${id}`,
    icon: 'prompt',
    section: 'prompts',
    label: `Prompt ${id}`,
    secondary: { label: 'copiar', ariaLabel: `Copiar prompt: Prompt ${id}`, run },
  } as Item
}

type Props = { items: Item[]; settled: boolean }

function montar(initialProps: Props) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const selectItem = vi.fn()
  const hook = renderHook(
    ({ items, settled }: Props) =>
      useCommandPaletteKeyboard({
        open: true,
        query: 'x',
        inputRef: { current: input },
        askCurrent: () => {},
        settled,
        activeLen: items.length,
        focusIdx: 0,
        setFocusIdx: () => {},
        mode: 'search',
        items,
        results: null,
        selectItem,
        selectHit: () => {},
      }),
    { initialProps },
  )
  return { ...hook, input, selectItem }
}

type PropsConFoco = { items: Item[]; query?: string }

/** Con el índice enfocado de verdad, como lo lleva el controlador. */
function montarConFoco(initialProps: PropsConFoco) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  const hook = renderHook(
    ({ items, query = 'x' }: PropsConFoco) => {
      const [focusIdx, setFocusIdx] = useState(0)
      useCommandPaletteKeyboard({
        open: true,
        query,
        inputRef: { current: input },
        askCurrent: () => {},
        settled: true,
        activeLen: items.length,
        focusIdx,
        setFocusIdx,
        mode: 'search',
        items,
        results: null,
        selectItem: () => {},
        selectHit: () => {},
      })
      return focusIdx
    },
    { initialProps },
  )
  return { ...hook, input }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useCommandPaletteKeyboard', () => {
  it('Enter antes de que la lista alcance lo escrito espera y abre lo escrito', () => {
    const { rerender, input, selectItem } = montar({ items: [INICIO], settled: false })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectItem).not.toHaveBeenCalled()

    rerender({ items: [MOMENTOS], settled: true })
    expect(selectItem).toHaveBeenCalledOnce()
    expect(selectItem).toHaveBeenCalledWith(MOMENTOS)
  })

  it('con la lista al día, Enter abre la fila enfocada al momento', () => {
    const { input, selectItem } = montar({ items: [MOMENTOS], settled: true })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectItem).toHaveBeenCalledWith(MOMENTOS)
  })

  it('Enter desde otro control de la paleta no toca la lista', () => {
    const { selectItem } = montar({ items: [MOMENTOS], settled: true })
    const boton = document.createElement('button')
    document.body.appendChild(boton)
    fireEvent.keyDown(boton, { key: 'Enter' })
    expect(selectItem).not.toHaveBeenCalled()
  })

  it('⇧Enter sobre una fila con acción la hace sin abrirla; sobre otra fila, abre', () => {
    const run = vi.fn()
    const { rerender, input, selectItem } = montar({
      items: [tareaCon(run)],
      settled: true,
    })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(run).toHaveBeenCalledOnce()
    expect(selectItem).not.toHaveBeenCalled()

    rerender({ items: [MOMENTOS], settled: true })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(selectItem).toHaveBeenCalledWith(MOMENTOS)
  })

  it('⇧Enter con la lista atrasada no actúa, ni cuando la lista llega', () => {
    const run = vi.fn()
    const tarea = tareaCon(run)
    const { rerender, input, selectItem } = montar({ items: [tarea], settled: false })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    rerender({ items: [tarea], settled: true })
    expect(run).not.toHaveBeenCalled()
    expect(selectItem).not.toHaveBeenCalled()
  })

  it('la fila elegida con las flechas se sigue cuando la lista cambia debajo', () => {
    const runT1 = vi.fn()
    const runP2 = vi.fn()
    const p1 = promptCon(vi.fn(), 'p1')
    const p2 = promptCon(runP2, 'p2')
    const { rerender, input, result } = montarConFoco({ items: [p1, p2] })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(result.current).toBe(1)
    rerender({ items: [tareaCon(runT1), p1, p2] })
    expect(result.current).toBe(2)

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(runP2).toHaveBeenCalledOnce()
    expect(runT1).not.toHaveBeenCalled()
  })

  it('tras la acción, el foco acompaña a la fila aunque la lista se reordene', () => {
    const run = vi.fn()
    const t1 = tareaCon(run, 't1')
    const t2 = tareaCon(vi.fn(), 't2')
    const { rerender, input, result } = montarConFoco({ items: [t1, t2] })

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(run).toHaveBeenCalledOnce()
    rerender({ items: [t2, t1] })
    expect(result.current).toBe(1)
  })

  it('escribir otra cosa suelta la fila anclada', () => {
    const p1 = promptCon(vi.fn(), 'p1')
    const p2 = promptCon(vi.fn(), 'p2')
    const { rerender, input, result } = montarConFoco({ items: [p1, p2], query: 'x' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    rerender({ items: [p1, p2], query: 'xy' })
    rerender({ items: [p2, p1], query: 'xy' })
    expect(result.current).toBe(1)
  })

  it('sin elegir una fila, el foco es la primera de lo que hay', () => {
    const p1 = promptCon(vi.fn(), 'p1')
    const { rerender, result } = montarConFoco({ items: [p1] })
    rerender({ items: [tareaCon(vi.fn()), p1] })
    expect(result.current).toBe(0)
  })
})
