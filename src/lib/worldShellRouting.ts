import { NOTAS_SECTIONS, type NotasSection } from '../types/notas'
import { type World } from '../types/world'
import { resolveRecortesRedirect } from './recortesRedirect'

export function readWorldDeepLinkFromSearch(search: string): World | null {
  try {
    const world = new URLSearchParams(search).get('world')
    return world === 'notas' || world === 'trama' ? world : null
  } catch {
    return null
  }
}

export function readNotasSectionDeepLinkFromSearch(search: string): NotasSection | null {
  try {
    const section = new URLSearchParams(search).get('section')
    return NOTAS_SECTIONS.includes(section as NotasSection)
      ? (section as NotasSection)
      : null
  } catch {
    return null
  }
}

export function resolveRecortesRedirectSearch(search: string): string | null {
  return resolveRecortesRedirect(search)?.search ?? null
}
