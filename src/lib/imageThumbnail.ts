/**
 * Genera una miniatura derivada (~JPEG chico) de una imagen, en el cliente y
 * ANTES de subirla. Gemelo de `captureVideoPoster` para fotos.
 *
 * **Por qué existe.** La capa de media autenticada baja el blob COMPLETO de
 * cada storageKey antes de montarlo: una grilla de 20 fotos de teléfono baja
 * 20 originales (3–8 MB cada uno) para pintar tiles de ~300px. Con un derivado
 * guardado junto al original, la grilla pesa decenas de KB y el original solo
 * se baja al abrir el visor.
 *
 * **Contrato tolerante**: resuelve `null` ante cualquier fallo (formato no
 * decodificable, canvas bloqueado) y si la imagen ya es más chica que el tope
 * también (subir un derivado igual de grande que el original sería puro
 * costo). El caller sube el original igual; la miniatura es una mejora, nunca
 * un requisito.
 *
 * NO es testeable en jsdom (no decodifica imágenes): los tests cubren el
 * cableado con este módulo mockeado, y el módulo real se verifica en
 * navegador (patrón establecido por `captureVideoPoster`).
 */

/** Lado mayor del derivado. 480px cubre tiles de álbum (~300px) con margen
 *  para pantallas densas sin acercarse al peso de un original. */
const THUMB_MAX_EDGE = 480

/** Calidad JPEG del derivado: es una miniatura, prima el peso. */
const THUMB_JPEG_QUALITY = 0.72

export async function createImageThumbnail(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const { width, height } = bitmap
      const edge = Math.max(width, height)
      // Ya es chica: un derivado no ahorraría nada (y duplicaría storage).
      if (!edge || edge <= THUMB_MAX_EDGE) return null
      const factor = THUMB_MAX_EDGE / edge
      const w = Math.round(width * factor)
      const h = Math.round(height * factor)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, w, h)
      return await new Promise<File | null>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size === 0) return resolve(null)
            resolve(new File([blob], 'thumb.jpg', { type: 'image/jpeg' }))
          },
          'image/jpeg',
          THUMB_JPEG_QUALITY,
        )
      })
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
