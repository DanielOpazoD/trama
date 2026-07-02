import { describe, expect, it } from 'vitest'
import type { Item } from '../../hooks/useCommandSearch'
import {
  getCommandPaletteHitTarget,
  getCommandPaletteItemCommand,
} from './commandPaletteSelectionModel'

describe('commandPaletteSelectionModel', () => {
  it('traduce hits de resultados a comandos de navegación explícitos', () => {
    expect(getCommandPaletteHitTarget({ kind: 'entity', id: 'e1' } as never)).toEqual({
      kind: 'selectEntity',
      id: 'e1',
    })
    expect(getCommandPaletteHitTarget({ kind: 'quote' } as never)).toEqual({
      kind: 'navigate',
      view: 'citas',
    })
    expect(getCommandPaletteHitTarget({ kind: 'momento' } as never)).toEqual({
      kind: 'navigate',
      view: 'momentos',
    })
    expect(getCommandPaletteHitTarget({ kind: 'note' } as never)).toEqual({
      kind: 'revealNotasModule',
      moduleId: 'notas',
    })
  })

  it('traduce items de búsqueda a comandos sin depender del componente shell', () => {
    expect(getCommandPaletteItemCommand({ kind: 'view', view: 'grafo' } as Item)).toEqual(
      {
        kind: 'navigate',
        view: 'grafo',
      },
    )
    expect(
      getCommandPaletteItemCommand({
        kind: 'action',
        action: 'new-entity',
        label: 'Nueva entidad',
      } as Item),
    ).toEqual({
      kind: 'action',
      action: 'new-entity',
    })
    expect(getCommandPaletteItemCommand({ kind: 'entity', id: 'e2' } as Item)).toEqual({
      kind: 'selectEntity',
      id: 'e2',
    })
    expect(
      getCommandPaletteItemCommand({ kind: 'quote', entityId: 'e-quote' } as Item),
    ).toEqual({
      kind: 'selectEntity',
      id: 'e-quote',
    })
    expect(getCommandPaletteItemCommand({ kind: 'momento' } as Item)).toEqual({
      kind: 'navigate',
      view: 'momentos',
    })
    expect(getCommandPaletteItemCommand({ kind: 'cronica' } as Item)).toEqual({
      kind: 'navigate',
      view: 'inicio',
    })
    expect(
      getCommandPaletteItemCommand({ kind: 'chat', threadId: 'thread-1' } as Item, {
        canOpenThread: true,
      }),
    ).toEqual({
      kind: 'openThread',
      threadId: 'thread-1',
    })
    expect(
      getCommandPaletteItemCommand({ kind: 'chat', threadId: 'thread-1' } as Item, {
        canOpenThread: false,
      }),
    ).toEqual({
      kind: 'navigate',
      view: 'chat',
    })
    expect(getCommandPaletteItemCommand({ kind: 'ask', q: 'notas' } as Item)).toEqual({
      kind: 'runAsk',
      q: 'notas',
    })
    expect(
      getCommandPaletteItemCommand({ kind: 'reveal', moduleId: 'notas' } as Item),
    ).toEqual({
      kind: 'revealNotasModule',
      moduleId: 'notas',
    })
    expect(
      getCommandPaletteItemCommand({
        kind: 'savedQuery',
        id: 'sq-1',
        name: 'Guardada',
        query: { from: ['entity'] },
      } as Item),
    ).toEqual({
      kind: 'runAst',
      query: { from: ['entity'] },
      heading: 'Guardada',
    })
  })
})
