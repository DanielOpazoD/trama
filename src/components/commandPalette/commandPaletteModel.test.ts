import { describe, expect, it } from 'vitest'
import type { Item } from '../../hooks/useCommandSearch'
import {
  clampCommandPaletteFocusIndex,
  commandPaletteItemKey,
  describeCommandPaletteEmptyState,
  getCommandPaletteActiveLength,
} from './commandPaletteModel'

describe('commandPaletteModel', () => {
  it('crea keys estables por tipo de item', () => {
    expect(commandPaletteItemKey({ kind: 'view', view: 'inicio' } as Item)).toBe('inicio')
    expect(commandPaletteItemKey({ kind: 'reveal', moduleId: 'claves' } as Item)).toBe(
      'reveal-claves',
    )
    expect(commandPaletteItemKey({ kind: 'ask', q: 'personas' } as Item)).toBe('ask')
    expect(
      commandPaletteItemKey({
        kind: 'savedQuery',
        id: 'q1',
        name: 'Q',
        query: {},
      } as Item),
    ).toBe('saved-q1')
    expect(commandPaletteItemKey({ kind: 'entity', id: 'e1' } as Item)).toBe('e1')
  })

  it('calcula el largo navegable según modo activo', () => {
    expect(
      getCommandPaletteActiveLength({
        mode: 'search',
        itemCount: 7,
        hitCount: 2,
      }),
    ).toBe(7)
    expect(
      getCommandPaletteActiveLength({
        mode: 'results',
        itemCount: 7,
        hitCount: 2,
      }),
    ).toBe(2)
  })

  it('mantiene el índice enfocado dentro del largo activo', () => {
    expect(clampCommandPaletteFocusIndex({ focusIdx: 5, activeLen: 2 })).toBe(1)
    expect(clampCommandPaletteFocusIndex({ focusIdx: -2, activeLen: 4 })).toBe(0)
    expect(clampCommandPaletteFocusIndex({ focusIdx: 3, activeLen: 0 })).toBe(0)
  })

  it('describe estados vacíos sin mezclar búsqueda remota con consulta NL', () => {
    expect(
      describeCommandPaletteEmptyState({
        query: 'borges',
        running: false,
        searching: true,
      }),
    ).toBe('buscando en tu trama…')
    expect(
      describeCommandPaletteEmptyState({
        query: 'filósofos',
        running: true,
        searching: true,
      }),
    ).toBe('consultando tu trama…')
    expect(
      describeCommandPaletteEmptyState({
        query: 'zzzz',
        running: false,
        searching: false,
      }),
    ).toBe('nada coincide')
    expect(
      describeCommandPaletteEmptyState({
        query: '',
        running: false,
        searching: false,
      }),
    ).toBe('empieza a escribir para buscar')
  })
})
