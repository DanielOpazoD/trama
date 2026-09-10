import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '../../hooks/useCommandSearch'
import { useCommandPaletteKeyboard } from './useCommandPaletteKeyboard'

const INICIO = { kind: 'view', view: 'inicio', label: 'Inicio' } as Item
const MOMENTOS = { kind: 'view', view: 'momentos', label: 'Momentos' } as Item

function tareaCon(run: () => void) {
  return {
    kind: 'content',
    id: 'task:t1',
    icon: 'task',
    section: 'tareas',
    label: 'Comprar tinta',
    secondary: { label: 'hecha', ariaLabel: 'Marcar hecha: Comprar tinta', run },
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
})
