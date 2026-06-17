import type { PdfFontKind, TextAnnotation } from './modelTypes'

export function standardFontName(
  font: PdfFontKind,
  bold: boolean,
  italic = false,
): string {
  if (font === 'serif') {
    if (bold && italic) return 'Times-BoldItalic'
    if (bold) return 'Times-Bold'
    if (italic) return 'Times-Italic'
    return 'Times-Roman'
  }
  if (font === 'mono') {
    if (bold && italic) return 'Courier-BoldOblique'
    if (bold) return 'Courier-Bold'
    if (italic) return 'Courier-Oblique'
    return 'Courier'
  }
  // base-14 no trae cursiva manuscrita: la oblicua es el fallback menos peor.
  if (font === 'script') return bold ? 'Helvetica-BoldOblique' : 'Helvetica-Oblique'
  if (bold && italic) return 'Helvetica-BoldOblique'
  if (bold) return 'Helvetica-Bold'
  if (italic) return 'Helvetica-Oblique'
  return 'Helvetica'
}

export function previewFontFamily(font: PdfFontKind): string {
  if (font === 'serif') return "Spectral, 'Iowan Old Style', Palatino, Georgia, serif"
  if (font === 'mono') return "'Courier New', Courier, monospace"
  // La voz manuscrita de la app (misma pila que .marginalia-script).
  if (font === 'script') return "Caveat, 'Bradley Hand', 'Segoe Script', cursive"
  return 'Inter, system-ui, -apple-system, sans-serif'
}

export function isEmbeddableFont(font: PdfFontKind): boolean {
  return font === 'sans' || font === 'serif' || font === 'script'
}

export const TEXT_LINE_HEIGHT = 1.15

const FONT_VMETRICS: Record<PdfFontKind, { ascent: number; descent: number }> = {
  sans: { ascent: 2728 / 2816, descent: 680 / 2816 },
  serif: { ascent: 1059 / 1000, descent: 463 / 1000 },
  mono: { ascent: 629 / 1000, descent: 157 / 1000 },
  // Caveat (hhea, leído con fontkit del woff vendorizado): 960 / -300, upm 1000.
  script: { ascent: 960 / 1000, descent: 300 / 1000 },
}

export function baselineDropEm(font: PdfFontKind): number {
  const m = FONT_VMETRICS[font]
  return TEXT_LINE_HEIGHT / 2 + (m.ascent - m.descent) / 2
}

export function textBoxLayout(
  ann: TextAnnotation,
  pageWidth: number,
  pageHeight: number,
): { x: number; topY: number; size: number; maxWidth?: number; maxHeight?: number } {
  const maxWidth =
    typeof ann.wRatio === 'number' ? Math.max(1, ann.wRatio * pageWidth) : undefined
  const maxHeight =
    typeof ann.hRatio === 'number' ? Math.max(1, ann.hRatio * pageHeight) : undefined
  return {
    x: ann.xRatio * pageWidth,
    topY: pageHeight - ann.yRatio * pageHeight,
    size: ann.sizeRatio * pageHeight,
    ...(maxWidth != null ? { maxWidth } : null),
    ...(maxHeight != null ? { maxHeight } : null),
  }
}
