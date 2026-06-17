import {
  baselineDropEm,
  TEXT_LINE_HEIGHT,
  textBoxLayout,
  type Annotation,
  type PdfFontKind,
} from '../model/model'
import { dataUrlToBytes, isPngBytes } from './assembleImages'
import { errMessage, type SkippedSource } from './assemblePipeline'
import type { PDFFont, PDFDocument, PDFPage } from 'pdf-lib'

type PdfRgb = NonNullable<Parameters<PDFPage['drawText']>[1]>['color']
type PdfRotation = NonNullable<Parameters<PDFPage['drawText']>[1]>['rotate']
type RgbFn = (r: number, g: number, b: number) => PdfRgb
type DegreesFn = (angle: number) => PdfRotation

/** `#rrggbb` → componentes 0..1 (negro si no parsea). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1]!, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

function fitTextForPdfBox({
  text,
  font,
  size,
  maxWidth,
  maxHeight,
  lineHeight,
}: {
  text: string
  font: PDFFont
  size: number
  maxWidth?: number
  maxHeight?: number
  lineHeight: number
}): string {
  const maxLines =
    maxHeight != null ? Math.max(1, Math.floor(maxHeight / lineHeight)) : Infinity
  const lines: string[] = []
  const push = (line: string) => {
    if (lines.length < maxLines) lines.push(line)
  }

  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (lines.length >= maxLines) break
    if (maxWidth == null) {
      push(paragraph)
      continue
    }

    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
      } else {
        push(line)
        line = word
        if (lines.length >= maxLines) break
      }
    }
    if (line && lines.length < maxLines) push(line)
  }

  return lines.join('\n')
}

function arrowHeadPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  sw: number,
) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const back = { x: -dx / len, y: -dy / len }
  const headLen = Math.min(len * 0.3, Math.max(8, sw * 5))
  const a = Math.PI / 7
  const rot = (v: { x: number; y: number }, t: number) => ({
    x: v.x * Math.cos(t) - v.y * Math.sin(t),
    y: v.x * Math.sin(t) + v.y * Math.cos(t),
  })
  return [rot(back, a), rot(back, -a)].map((d) => ({
    start: p1,
    end: { x: p1.x + d.x * headLen, y: p1.y + d.y * headLen },
  }))
}

export async function applyPdfAnnotations({
  out,
  outPage,
  annotations,
  fontFor,
  rgb,
  degrees,
  skipped,
}: {
  out: PDFDocument
  outPage: PDFPage
  annotations: Annotation[]
  fontFor: (font: PdfFontKind, bold: boolean, italic?: boolean) => Promise<PDFFont>
  rgb: RgbFn
  degrees: DegreesFn
  skipped: SkippedSource[]
}) {
  const w = outPage.getWidth()
  const h = outPage.getHeight()
  for (const ann of annotations) {
    try {
      if (ann.kind === 'text') {
        if (!ann.text.trim()) continue
        const font = await fontFor(ann.font, ann.bold, ann.italic)
        const layout = textBoxLayout(ann, w, h)
        const size = Math.max(1, layout.size)
        const c = hexToRgb(ann.color)
        const lineHeight = size * TEXT_LINE_HEIGHT
        const text = fitTextForPdfBox({
          text: ann.text,
          font,
          size,
          maxWidth: layout.maxWidth,
          maxHeight: layout.maxHeight,
          lineHeight,
        })
        if (!text.trim()) continue
        outPage.drawText(text, {
          x: layout.x,
          y: layout.topY - baselineDropEm(ann.font) * size,
          size,
          font,
          color: rgb(c.r, c.g, c.b),
          lineHeight,
          opacity: ann.opacity ?? 1,
          ...(layout.maxWidth != null ? { maxWidth: layout.maxWidth } : null),
          rotate: degrees(-(ann.rotation ?? 0)),
        })
      } else if (ann.kind === 'highlight') {
        const c = hexToRgb(ann.color)
        outPage.drawRectangle({
          x: ann.xRatio * w,
          y: h - (ann.yRatio + ann.hRatio) * h,
          width: ann.wRatio * w,
          height: ann.hRatio * h,
          color: rgb(c.r, c.g, c.b),
          opacity: ann.opacity ?? 0.4,
        })
      } else if (ann.kind === 'shape') {
        const c = hexToRgb(ann.color)
        const col = rgb(c.r, c.g, c.b)
        const sw = Math.max(0.5, ann.strokeRatio * h)
        const op = ann.opacity ?? 1
        const p0 = { x: ann.x0Ratio * w, y: h - ann.y0Ratio * h }
        const p1 = { x: ann.x1Ratio * w, y: h - ann.y1Ratio * h }
        if (ann.shape === 'rect' || ann.shape === 'oval') {
          const x = Math.min(p0.x, p1.x)
          const y = Math.min(p0.y, p1.y)
          const rw = Math.abs(p1.x - p0.x)
          const rh = Math.abs(p1.y - p0.y)
          if (ann.shape === 'rect') {
            outPage.drawRectangle({
              x,
              y,
              width: rw,
              height: rh,
              borderColor: col,
              borderWidth: sw,
              opacity: 0,
              borderOpacity: op,
            })
          } else {
            outPage.drawEllipse({
              x: x + rw / 2,
              y: y + rh / 2,
              xScale: rw / 2,
              yScale: rh / 2,
              borderColor: col,
              borderWidth: sw,
              opacity: 0,
              borderOpacity: op,
            })
          }
        } else if (ann.shape === 'x') {
          // Una X DESHABILITADA (gris claro en el editor) = casillero NO marcado:
          // no se dibuja en el PDF (el gris es sólo un indicador de edición).
          if (!ann.disabled) {
            const x = Math.min(p0.x, p1.x)
            const y = Math.min(p0.y, p1.y)
            const rw = Math.abs(p1.x - p0.x)
            const rh = Math.abs(p1.y - p0.y)
            outPage.drawLine({
              start: { x, y },
              end: { x: x + rw, y: y + rh },
              thickness: sw,
              color: col,
              opacity: op,
            })
            outPage.drawLine({
              start: { x: x + rw, y },
              end: { x, y: y + rh },
              thickness: sw,
              color: col,
              opacity: op,
            })
          }
        } else {
          outPage.drawLine({ start: p0, end: p1, thickness: sw, color: col, opacity: op })
          if (ann.shape === 'arrow') {
            for (const head of arrowHeadPath(p0, p1, sw)) {
              outPage.drawLine({ ...head, thickness: sw, color: col, opacity: op })
            }
          }
        }
      } else if (ann.kind === 'image') {
        const bytes = dataUrlToBytes(ann.src)
        if (!bytes) continue
        const img = isPngBytes(bytes)
          ? await out.embedPng(bytes)
          : await out.embedJpg(bytes)
        outPage.drawImage(img, {
          x: ann.xRatio * w,
          y: h - (ann.yRatio + ann.hRatio) * h,
          width: ann.wRatio * w,
          height: ann.hRatio * h,
          opacity: ann.opacity ?? 1,
        })
      }
    } catch (err) {
      skipped.push({ name: `anotación ${ann.kind}`, reason: errMessage(err) })
    }
  }
}
