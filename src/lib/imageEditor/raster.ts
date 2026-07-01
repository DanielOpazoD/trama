/**
 * Rasterización del editor (browser-only): aplica rotación + recorte + texto del
 * `EditorModel` sobre canvas y devuelve un `File` nuevo. Toca createImageBitmap/
 * canvas/toBlob → no corre en node (excluido del coverage). Defensivo: ante
 * cualquier fallo devuelve el File original; si el modelo es identidad, ni
 * re-encodea. La compresión del flujo corre DESPUÉS de esto.
 */
import type { EditImageOptions, EditorModel, TextPalette } from './types'
import {
  cropRectToSourcePx,
  fontFamilyFor,
  fontWeightFor,
  isIdentityModel,
  rotatedDimensions,
  textPxOnCrop,
} from './transforms'

/** Tope del lado mayor del canvas final (límite de canvas en Safari móvil). */
const MAX_EXPORT_EDGE = 4096

async function decodeBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
}

/** Resuelve los 3 colores del texto desde el tema actual (fallback fijo). */
function resolvePalette(): TextPalette {
  const fallback: TextPalette = { ink: '#1a1a1a', paper: '#faf7ef', accent: '#1f4e79' }
  try {
    const cs = getComputedStyle(document.documentElement)
    const rgb = (name: string, fb: string) => {
      const v = cs.getPropertyValue(name).trim()
      return v ? `rgb(${v})` : fb
    }
    return {
      ink: rgb('--ink-800', fallback.ink), // tinta más oscura del tema (no hay --ink-900)
      paper: rgb('--paper-50', fallback.paper),
      accent: rgb('--accent-primary', fallback.accent),
    }
  } catch {
    return fallback
  }
}

export async function rasterize(
  file: File,
  model: EditorModel,
  options: EditImageOptions = {},
): Promise<File> {
  const outputType = options.outputType ?? 'image/webp'
  const quality = options.quality ?? 0.92
  if (isIdentityModel(model)) return file

  try {
    const bitmap = await decodeBitmap(file)
    if (!bitmap || !bitmap.width || !bitmap.height) return file
    const quarters = (((model.rotationQuarters % 4) + 4) % 4) as 0 | 1 | 2 | 3
    const { width: rW, height: rH } = rotatedDimensions(
      bitmap.width,
      bitmap.height,
      quarters,
    )

    // 1) Lienzo rotado a tamaño post-rotación.
    const rotated = document.createElement('canvas')
    rotated.width = rW
    rotated.height = rH
    const rctx = rotated.getContext('2d')
    if (!rctx) {
      bitmap.close?.()
      return file
    }
    if (quarters === 1) rctx.translate(rW, 0)
    else if (quarters === 2) rctx.translate(rW, rH)
    else if (quarters === 3) rctx.translate(0, rH)
    rctx.rotate((quarters * Math.PI) / 2)
    rctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()

    // 2) Recorte → lienzo final (con tope de tamaño).
    const { sx, sy, sw, sh } = cropRectToSourcePx(model.crop, rW, rH)
    const scale = Math.min(1, MAX_EXPORT_EDGE / Math.max(sw, sh))
    const cw = Math.max(1, Math.round(sw * scale))
    const ch = Math.max(1, Math.round(sh * scale))
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    const ctx = out.getContext('2d')
    if (!ctx) return file
    if (outputType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff' // sin esto, la transparencia sale negra en JPEG
      ctx.fillRect(0, 0, cw, ch)
    }
    ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, cw, ch)

    // 3) Capas de texto (con halo de contraste para legibilidad).
    if (model.textLayers.length > 0) {
      try {
        await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
          ?.ready
      } catch {
        /* fuentes best-effort */
      }
      const palette = resolvePalette()
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      for (const layer of model.textLayers) {
        const text = layer.text.trim()
        if (!text) continue
        // Ancla el texto a la imagen completa (no al recorte): mismo encuadre
        // que el preview, aunque haya recorte de por medio.
        const { x, y, fontPx } = textPxOnCrop(layer, rW, rH, { sx, sy, sw, sh }, cw, ch)
        ctx.font = `${fontWeightFor(layer.bold)} ${fontPx}px ${fontFamilyFor(layer.font)}`
        ctx.fillStyle = palette[layer.color]
        ctx.strokeStyle = layer.color === 'paper' ? palette.ink : palette.paper
        ctx.lineWidth = Math.max(2, fontPx * 0.08)
        text.split('\n').forEach((line, i) => {
          const ly = y + i * fontPx * 1.25
          ctx.strokeText(line, x, ly)
          ctx.fillText(line, x, ly)
        })
      }
    }

    const blob = await new Promise<Blob | null>((res) =>
      out.toBlob((b) => res(b), outputType, quality),
    )
    if (!blob) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'imagen'
    const ext = outputType === 'image/jpeg' ? 'jpg' : 'webp'
    return new File([blob], `${base}.${ext}`, {
      type: outputType,
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}
