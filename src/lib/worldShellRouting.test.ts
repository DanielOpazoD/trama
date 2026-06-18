import { describe, expect, it } from 'vitest'
import {
  readNotasSectionDeepLinkFromSearch,
  readWorldDeepLinkFromSearch,
  resolveRecortesRedirectSearch,
} from './worldShellRouting'

describe('worldShellRouting', () => {
  it('lee mundo y sección desde search con fallback nulo', () => {
    expect(readWorldDeepLinkFromSearch('?world=notas')).toBe('notas')
    expect(readWorldDeepLinkFromSearch('?world=trama')).toBe('trama')
    expect(readWorldDeepLinkFromSearch('?world=otra')).toBeNull()

    expect(readNotasSectionDeepLinkFromSearch('?section=pdf')).toBe('pdf')
    expect(readNotasSectionDeepLinkFromSearch('?section=otra')).toBeNull()
  })

  it('mantiene el redirect legacy de recortes como búsqueda nueva', () => {
    expect(resolveRecortesRedirectSearch('?view=recortes&tab=favoritos')).toContain(
      'segment=favoritos',
    )
    expect(resolveRecortesRedirectSearch('?view=inicio')).toBeNull()
  })
})
