import type { PdfFontKind } from '../model/model'

import interRegularUrl from '../fonts/inter-latin-400-normal.woff?url'
import interBoldUrl from '../fonts/inter-latin-700-normal.woff?url'
import spectralRegularUrl from '../fonts/spectral-latin-400-normal.woff?url'
import spectralBoldUrl from '../fonts/spectral-latin-700-normal.woff?url'
import caveatRegularUrl from '../fonts/caveat-latin-400-normal.woff?url'
import caveatBoldUrl from '../fonts/caveat-latin-700-normal.woff?url'

export function embeddableFontUrl(font: PdfFontKind, bold: boolean, italic = false): string | null {
  if (italic) return null
  if (font === 'sans') return bold ? interBoldUrl : interRegularUrl
  if (font === 'serif') return bold ? spectralBoldUrl : spectralRegularUrl
  if (font === 'script') return bold ? caveatBoldUrl : caveatRegularUrl
  return null
}

export async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`no se pudo cargar la fuente (${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}
