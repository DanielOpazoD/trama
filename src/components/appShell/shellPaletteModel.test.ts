import { describe, expect, it } from 'vitest'
import { resolveShellPaletteAction } from './shellPaletteModel'

describe('shellPaletteModel', () => {
  it('traduce acciones del palette a intents declarativos del shell', () => {
    expect(resolveShellPaletteAction('open-settings')).toEqual({
      kind: 'modal',
      modal: 'settings',
    })
    expect(resolveShellPaletteAction('open-careo')).toEqual({
      kind: 'modal',
      modal: 'careo',
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
