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

export function shouldDownloadPdfDirectly(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIosLike({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  })
}

export function exportPdfName(date = new Date(), kind?: string): string {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`
  return `trama-${kind ? `${kind}-` : ''}${stamp}.pdf`
}
