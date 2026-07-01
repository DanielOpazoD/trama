import { describe, expect, it } from 'vitest'
import { resolveShellPaletteAction } from './shellPaletteModel'

describe('shellPaletteModel', () => {
  it('traduce acciones del palette a intents declarativos del shell', () => {
    expect(resolveShellPaletteAction('open-settings')).toEqual({
      kind: 'modal',
      modal: 'settings',
    })
    expect(resolveShellPaletteAction('open-shortcuts')).toEqual({
      kind: 'modal',
      modal: 'shortcuts',
    })
    expect(resolveShellPaletteAction('open-sortes')).toEqual({
      kind: 'modal',
      modal: 'sortes',
    })
    expect(resolveShellPaletteAction('open-espejo')).toEqual({
      kind: 'modal',
      modal: 'espejo',
    })
    expect(resolveShellPaletteAction('open-careo')).toEqual({
      kind: 'modal',
      modal: 'careo',
    })
    expect(resolveShellPaletteAction('new-entity')).toEqual({
      kind: 'view',
      view: 'entidades',
    })
    expect(resolveShellPaletteAction('new-quote')).toEqual({
      kind: 'view',
      view: 'citas',
    })
    expect(resolveShellPaletteAction('new-momento')).toEqual({
      kind: 'view',
      view: 'momentos',
    })
  })
})
