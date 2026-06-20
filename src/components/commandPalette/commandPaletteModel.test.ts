import { describe, expect, it } from 'vitest'
import type { Item } from '../../hooks/useCommandSearch'
import {
  commandPaletteItemKey,
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
})
