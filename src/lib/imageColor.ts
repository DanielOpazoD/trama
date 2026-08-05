/**
 * Extrae el color DOMINANTE (promedio) de una imagen: se dibuja entera en un
 * canvas de 1×1 y el navegador hace el promedio al escalar. Tres líneas de
 * trabajo real, cero dependencias.
 *
 * **Para qué.** Se guarda como `dominantColor` en el item de un momento
 * (7 caracteres de payload, ningún blob) y el placeholder del tile se pinta
 * de ese tono mientras el blob viaja: el álbum aparece como un mosaico de
 * colores que se revela en fotos, en vez de una grilla de cajas grises.
 *
 * Contrato tolerante como sus hermanos (`createImageThumbnail`,
 * `captureVideoPoster`): `null` ante cualquier fallo — un color es una mejora,
 * nunca un requisito. No testeable en jsdom (no decodifica imágenes): los
 * tests cubren el cableado con el módulo mockeado y el módulo real se
 * verifica en navegador.
 */
export async function extractDominantColor(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const hex = [r, g, b].map((c) => (c ?? 0).toString(16).padStart(2, '0')).join('')
      return `#${hex}`
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
