import { describe, it, expect } from 'vitest'
import { resolveRecortesRedirect } from './recortesRedirect'

describe('resolveRecortesRedirect', () => {
  it('devuelve null cuando no hay view=recortes', () => {
    expect(resolveRecortesRedirect('')).toBeNull()
    expect(resolveRecortesRedirect('?view=momentos')).toBeNull()
    expect(resolveRecortesRedirect('?world=notas&section=bandeja')).toBeNull()
  })

  it('traduce ?view=recortes a world=notas&section=bandeja', () => {
    const r = resolveRecortesRedirect('?view=recortes')
    expect(r).not.toBeNull()
    expect(r!.world).toBe('notas')
    expect(r!.section).toBe('bandeja')
    expect(r!.search).toBe('?world=notas&section=bandeja')
  })

  it('preserva tab y project para abrir el subcontexto de RecortesArea', () => {
    const r = resolveRecortesRedirect('?view=recortes&tab=mesa&project=p1')
    expect(r!.search).toBe('?world=notas&section=bandeja&tab=mesa&project=p1')
  })

  it('preserva solo tab cuando no hay project', () => {
    const r = resolveRecortesRedirect('?view=recortes&tab=favoritos')
    expect(r!.search).toBe('?world=notas&section=bandeja&tab=favoritos')
  })

  it('descarta params no relevantes para la bandeja', () => {
    const r = resolveRecortesRedirect('?view=recortes&foo=bar')
    expect(r!.search).toBe('?world=notas&section=bandeja')
  })
})
