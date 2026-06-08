import type { RasterCanvas, RasterContext } from './pdfOcrTypes'

export const OCR_RENDER_MAX_DIMENSION = 1800

export function createOcrCanvas(width: number, height: number): RasterCanvas {
  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h)
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  }
  throw new Error('Canvas no disponible para OCR')
}

export function getOcrCanvasContext(canvas: RasterCanvas): RasterContext {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D no disponible para OCR')
  return context
}

export function fillOcrCanvasWhite(ctx: RasterContext, width: number, height: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
}

export async function ocrCanvasToJpegBlob(canvas: RasterCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo codificar la imagen OCR'))
      },
      'image/jpeg',
      0.9,
    )
  })
}
