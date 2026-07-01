export type BrowserLike = {
  userAgent: string
  platform: string
  maxTouchPoints: number
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isStudioImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function isIosLike(nav: BrowserLike): boolean {
  return (
    /iP(ad|hone|od)/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  )
}

/** Safari real (escritorio o iOS), excluyendo Chrome/Edge/Firefox/Opera, que
 *  también incluyen el token "Safari" en su UA. El discriminante fuerte es
 *  "Version/": solo WebKit-Safari lo emite. */
export function isSafari(nav: BrowserLike): boolean {
  const ua = nav.userAgent
  return (
    /Safari/.test(ua) &&
    /Version\//.test(ua) &&
    !/Chrom(e|ium)|CriOS|FxiOS|Edg|OPR|OPiOS|Android|SamsungBrowser/.test(ua)
  )
}

/** Slug seguro para nombre de archivo (sin acentos ni símbolos). */
function pdfFileSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Nombre del PDF exportado. Con título del documento → `<titulo>[-<kind>].pdf`;
 * sin título, el genérico fechado `trama[-<kind>]-<YYYYMMDD>.pdf` de siempre.
 */
export function exportPdfName(date = new Date(), kind?: string, title?: string): string {
  const slug = title ? pdfFileSlug(title) : ''
  if (slug) return `${slug}${kind ? `-${kind}` : ''}.pdf`
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`
  return `trama-${kind ? `${kind}-` : ''}${stamp}.pdf`
}
