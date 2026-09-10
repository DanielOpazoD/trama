import { describe, expect, it } from 'vitest'
import {
  describeCommandPaletteHints,
  describeCommandPaletteScope,
  resolveCommandPaletteKey,
} from './commandPaletteKeys'

type Tecla = Parameters<typeof resolveCommandPaletteKey>[0]

function tecla(key: string, extra: Partial<Tecla> = {}) {
  return resolveCommandPaletteKey({
    key,
    metaKey: false,
    ctrlKey: false,
    isComposing: false,
    target: 'search',
    ...extra,
  })
}

describe('commandPaletteKeys', () => {
  it('desde el campo, las flechas recorren, Enter abre y ⌘/Ctrl+Enter pregunta', () => {
    expect(tecla('ArrowDown')).toBe('next')
    expect(tecla('ArrowUp')).toBe('previous')
    expect(tecla('Enter')).toBe('select')
    expect(tecla('Enter', { metaKey: true })).toBe('ask')
    expect(tecla('Enter', { ctrlKey: true })).toBe('ask')
    expect(tecla('a')).toBeNull()
  })

  it('sin foco en ningún control también gobierna la lista', () => {
    expect(tecla('Enter', { target: 'none' })).toBe('select')
    expect(tecla('ArrowDown', { target: 'none' })).toBe('next')
  })

  it('con el foco en otro control, o componiendo con IME, la tecla es de ese control', () => {
    expect(tecla('Enter', { target: 'control' })).toBeNull()
    expect(tecla('ArrowDown', { target: 'control' })).toBeNull()
    expect(tecla('Enter', { isComposing: true })).toBeNull()
  })

  it('⇧Enter es la acción de la fila; con ⌘ o Ctrl sigue preguntando', () => {
    expect(tecla('Enter', { shiftKey: true })).toBe('act')
    expect(tecla('Enter', { shiftKey: true, metaKey: true })).toBe('ask')
    expect(tecla('Enter', { shiftKey: true, ctrlKey: true })).toBe('ask')
    expect(tecla('Enter', { shiftKey: true, target: 'control' })).toBeNull()
  })

  it('el pie enseña la gramática con la búsqueda vacía y las teclas al escribir', () => {
    expect(describeCommandPaletteHints('')).toBe(
      '? preguntar · > comandos · @ entidades · # secciones',
    )
    expect(describeCommandPaletteHints('borges', '⌘')).toBe(
      '↑↓ navegar · enter abrir · ⌘ enter preguntar · esc cerrar',
    )
    expect(describeCommandPaletteHints('?qué leí')).toBe('enter preguntar · esc cerrar')
  })

  it('anuncia el alcance solo cuando hay sigilo', () => {
    expect(describeCommandPaletteScope('borges')).toBeNull()
    expect(describeCommandPaletteScope('@bor')).toBe('solo entidades')
    expect(describeCommandPaletteScope('?')).toBe('pregunta en lenguaje natural')
  })
})
