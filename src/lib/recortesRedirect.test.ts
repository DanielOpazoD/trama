import { describe, it, expect } from 'vitest'
import { resolveRecortesRedirect } from './recortesRedirect'

describe('resolveRecortesRedirect', () => {
  it('devuelve null cuando no hay view=recortes', () => {
    expect(resolveRecortesRedirect('')).toBeNull()
    expect(resolveRecortesRedirect('?view=momentos')).toBeNull()
    expect(resolveRecortesRedirect('?world=notas&section=notas')).toBeNull()
  })

  it('traduce ?view=recortes al feed de Notas (world=notas&section=notas)', () => {
    const r = resolveRecortesRedirect('?view=recortes')
    expect(r).not.toBeNull()
    expect(r!.world).toBe('notas')
    expect(r!.section).toBe('notas')
    expect(r!.search).toBe('?world=notas&section=notas')
  })

  it('mapea tab=favoritos al segmento Favoritos del feed', () => {
    const r = resolveRecortesRedirect('?view=recortes&tab=favoritos')
    expect(r!.search).toBe('?world=notas&section=notas&segment=favoritos')
  })

  it('descarta tab=mesa y project (la Mesa editorial ya no existe)', () => {
    const r = resolveRecortesRedirect('?view=recortes&tab=mesa&project=p1')
    expect(r!.search).toBe('?world=notas&section=notas')
  })

  it('descarta params no relevantes para el feed', () => {
    const r = resolveRecortesRedirect('?view=recortes&foo=bar')
    expect(r!.search).toBe('?world=notas&section=notas')
  })
})
