import type { Momento } from '../../types'

/**
 * Helpers puros para Momentos. Sin React, sin queries — todo testeable
 * con vitest sin DOM. La idea es que MomentosView y sus sub-componentes
 * importen de acá para no duplicar lógica de fecha / agrupación.
 */

/**
 * Devuelve "hoy" si la fecha es hoy, "ayer" si es ayer, sino la fecha
 * completa en español (e.g. "domingo, 24 de mayo"). Si el año difiere
 * del actual, agrega el año.
 *
 * Diseñado como label de header de día en el timeline. Sin localización
 * adicional — Trama es app personal en español.
 */
export function formatDateHeading(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  return d.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

/**
 * Hora del día en formato 24h (HH:MM). Usado como gutter izquierdo de
 * cada entrada del timeline para que el ojo recorra verticalmente.
 */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Agrupa una lista de momentos por día calendario (year-month-day).
 *
 * Asume que `items` ya viene ordenado descendente por capturedAt (el
 * endpoint los devuelve así). Como Map preserva orden de inserción,
 * el resultado mantiene el orden cronológico inverso natural.
 *
 * Items con capturedAt inválido se descartan silenciosamente — no nos
 * detenemos por uno corrupto.
 */
export function groupByDay(
  items: Momento[],
): Array<{ dayKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return Array.from(groups.entries()).map(([dayKey, entries]) => ({
    dayKey,
    entries,
  }))
}

/**
 * Agrupa una lista de momentos por mes calendario (year-month).
 * Usado por la vista álbum para titular cada mes. Mismo contrato que
 * groupByDay: descarta capturedAt inválidos y respeta orden de input.
 */
export function groupByMonth(
  items: Momento[],
): Array<{ monthKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return Array.from(groups.entries()).map(([monthKey, entries]) => ({
    monthKey,
    entries,
  }))
}

/**
 * Format de un monthKey "2026-05" → "mayo 2026" en español.
 */
export function formatMonthLabel(monthKey: string): string {
  const [year, monthNum] = monthKey.split('-')
  const y = Number(year)
  const m = Number(monthNum)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Lee width/height de una imagen del lado del cliente sin recargarla
 * en otro request. Resuelve con {0,0} si la imagen falla a cargar — el
 * caller decide qué hacer (típicamente: guardar sin dimensiones y
 * mostrar sin aspect ratio explícito).
 *
 * NO es testeable fácilmente sin DOM real; el test cubre el camino
 * happy y nos confiamos del browser para el resto.
 */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}

/**
 * υ-multi: compresión client-side de imágenes.
 *
 * Pipeline canvas-only (sin libs externas):
 *   1. Carga la imagen en un canvas.
 *   2. Si la dimensión más grande > maxDim (default 2400px), se
 *      reescala manteniendo aspect ratio. 2400px es suficiente para
 *      ver bien en cualquier display razonable; las fotos de iPhone
 *      modernas vienen a 3024×4032 (~12MP), que es overkill para una
 *      timeline visual.
 *   3. Exporta como JPEG con quality 0.85 — equilibrio entre tamaño y
 *      calidad percibida. Para fotos típicas de móvil baja de 4-6MB
 *      a 400-900KB sin pérdida visible.
 *
 * Si la imagen YA es chica (dim <= maxDim Y size <= 600KB), devolvemos
 * el File original sin pasar por canvas — evita pérdida innecesaria.
 *
 * GIFs animados: se devuelven sin tocar (canvas perdería la animación).
 * PNG con alpha: se convierten a JPEG perdiendo alpha — para fotos no
 * importa, y el bg negro no se nota porque normalmente la imagen llena
 * el frame. Si el usuario sube un PNG con transparencia intencional,
 * pierde el alpha; no es el caso de uso primario de Momentos.
 */
export async function compressImage(
  file: File,
  options?: { maxDim?: number; quality?: number },
): Promise<File> {
  const maxDim = options?.maxDim ?? 2400
  const quality = options?.quality ?? 0.85

  // GIF: si es animado canvas pierde la animación. Pasamos a través.
  if (file.type === 'image/gif') return file

  // Si la imagen es pequeña y liviana, no la tocamos.
  if (file.size <= 600 * 1024) {
    const dims = await readImageDimensions(file)
    if (
      dims.width > 0 &&
      dims.height > 0 &&
      Math.max(dims.width, dims.height) <= maxDim
    ) {
      return file
    }
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Image load failed'))
    el.src = dataUrl
  })

  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight
  let targetW = naturalW
  let targetH = naturalH
  if (Math.max(naturalW, naturalH) > maxDim) {
    const scale = maxDim / Math.max(naturalW, naturalH)
    targetW = Math.round(naturalW * scale)
    targetH = Math.round(naturalH * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return file // sin canvas2d (raro), fallback al original
  // Fondo blanco antes del draw — evita que JPEG con alpha quede negro
  // en zonas transparentes. Para fotos típicas no afecta nada.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(img, 0, 0, targetW, targetH)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
  if (!blob) return file

  // Si la compresión NO redujo el tamaño (raro, pero pasa con imágenes
  // ya muy optimizadas), devolvemos el original.
  if (blob.size >= file.size) return file

  const cleanName = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '') + '.jpg'
  return new File([blob], cleanName, { type: 'image/jpeg' })
}
