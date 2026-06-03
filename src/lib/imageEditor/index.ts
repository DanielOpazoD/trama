/**
 * Editor de imágenes compartido. API única para todos los flujos de subida:
 *
 *   const edited = await editImage(file, { outputType: 'image/webp' })
 *   if (edited === null) return            // canceló
 *   // usar `edited` (o el original si no hubo cambios) y seguir el pipeline
 *
 * El editor se carga de forma PEREZOSA (dynamic import) para que su código y el
 * modal queden en un chunk aparte, fuera del bundle principal (mismo patrón que
 * jsPDF/qrcode). Una sola instancia a la vez.
 */
import type { EditImageOptions } from './types'

let busy = false

export async function editImage(
  file: File,
  options: EditImageOptions = {},
): Promise<File | null> {
  if (busy) return null
  busy = true
  try {
    const { mountImageEditor } = await import('./mount')
    return await mountImageEditor(file, options)
  } catch {
    // Si el editor no puede cargar/montar, no rompemos la subida: seguimos con
    // el archivo original (equivale a "no editar").
    return file
  } finally {
    busy = false
  }
}

export type { EditImageOptions } from './types'
