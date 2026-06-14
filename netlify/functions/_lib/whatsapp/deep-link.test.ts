import { describe, expect, it } from 'vitest'
import { captureDeepLink } from './deep-link'

describe('captureDeepLink', () => {
  it('mapea cada kind a su vista/mundo', () => {
    const o = 'https://tramadaod.netlify.app'
    expect(captureDeepLink(o, 'note')).toBe(`${o}/?world=notas`)
    expect(captureDeepLink(o, 'quote')).toBe(`${o}/?view=citas`)
    expect(captureDeepLink(o, 'entity')).toBe(`${o}/?view=entidades`)
    expect(captureDeepLink(o, 'momento')).toBe(`${o}/?view=momentos`)
    expect(captureDeepLink(o, 'recorte')).toBe(`${o}/?view=recortes`)
  })

  it('kind desconocido cae a inicio', () => {
    expect(captureDeepLink('https://x.test', 'loquesea')).toBe(
      'https://x.test/?view=inicio',
    )
  })

  it('normaliza la barra final del origin', () => {
    expect(captureDeepLink('https://x.test/', 'note')).toBe('https://x.test/?world=notas')
  })
})
