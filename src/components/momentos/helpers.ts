import type { Momento } from '../../types'

export type MomentoPhotoItem = {
  storageKey: string
  width?: number
  height?: number
  /** ω-video: 'video' para clips; ausente o 'image' para fotos. */
  type?: 'image' | 'video'
}

/** True si el item es un clip de video (no una foto). Los items legacy no
 *  traen `type`, así que se leen como imagen. */
export function isVideoItem(item: Pick<MomentoPhotoItem, 'type'>): boolean {
  return item.type === 'video'
}

/**
 * Helpers puros para Momentos. Sin React, sin queries — todo testeable
 * con vitest sin DOM. La idea es que MomentosView y sus sub-componentes
 * importen de acá para no duplicar lógica de fecha / agrupación.
 */

/**
 * URL pública para leer una foto/audio de Momentos. Codifica cada segmento
 * por separado para que `userId/blob.ext` siga siendo un path real de dos
 * segmentos y no dependa de `%2F`, que algunos routers tratan de forma
 * distinta antes de entregar params al handler.
 */
export function momentoMediaUrl(storageKey: string): string {
  return `/api/momentos-file/${storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

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

function normalizePhotoItems(
  items: Array<{
    storageKey: string
    width?: number
    height?: number
    type?: 'image' | 'video'
  }>,
): MomentoPhotoItem[] {
  return items
    .map((item) => ({
      storageKey: item.storageKey.trim(),
      width: item.width,
      height: item.height,
      type: item.type,
    }))
    .filter((item) => item.storageKey.length > 0)
}

/**
 * Devuelve las fotos visibles de un momento soportando los tres formatos
 * que existen en datos reales:
 * - items[]: formato actual.
 * - photos[] + primaryStorageKey: legado de fotos múltiples.
 * - storageKey/width/height: legado de foto única.
 *
 * Las escrituras nuevas normalizan a items[], pero la lectura debe ser
 * tolerante para no ocultar fotos ya persistidas.
 */
export function getMomentoPhotoItems(payload: Momento['payload']): MomentoPhotoItem[] {
  const items =
    payload.items && payload.items.length > 0
      ? normalizePhotoItems(payload.items)
      : payload.photos && payload.photos.length > 0
        ? normalizePhotoItems(payload.photos)
        : []

  if (items.length > 0) {
    const primaryKey =
      typeof payload.primaryStorageKey === 'string'
        ? payload.primaryStorageKey.trim()
        : ''
    if (!primaryKey) return items
    const primary = items.find((item) => item.storageKey === primaryKey)
    if (!primary) return items
    return [primary, ...items.filter((item) => item.storageKey !== primaryKey)]
  }

  const storageKey =
    typeof payload.storageKey === 'string' && payload.storageKey.trim()
      ? payload.storageKey.trim()
      : typeof payload.primaryStorageKey === 'string'
        ? payload.primaryStorageKey.trim()
        : ''

  return storageKey ? [{ storageKey, width: payload.width, height: payload.height }] : []
}

/**
 * Convierte un ISO timestamp al formato que <input type="datetime-local">
 * espera: "YYYY-MM-DDTHH:mm" en hora LOCAL del usuario (no UTC).
 *
 * Devuelve '' si el ISO es inválido — el input acepta string vacío.
 */
export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/**
 * Inversa de toDateTimeLocalInput: lee el valor de un <input type="datetime-local">
 * (formato "YYYY-MM-DDTHH:mm", hora local) y devuelve ISO UTC.
 *
 * Devuelve null si el valor es inválido o vacío — el caller decide si
 * mantener el capturedAt original o rechazar el submit.
 */
export function fromDateTimeLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
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
 * ω-video: tope de tamaño para media de Momentos, alineado con el
 * `MAX_BYTES` del endpoint `momentos-upload.mts`. Los videos no se
 * comprimen client-side (haría falta transcodificar), así que el composer
 * valida ESTE límite antes de intentar subir y da un mensaje claro en vez
 * de dejar que el backend rechace el body. Subirlo requeriría upload
 * directo al store (fuera del alcance de esta capa).
 */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024

/** Formatos de video que aceptamos. DEBE coincidir con la lista blanca del
 *  backend (`momentos-upload.mts`) y con el `accept` del input del composer. */
export const SUPPORTED_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const

/** True si el File es un video (cualquier mimeType `video/*`). Sirve para
 *  distinguir video de imagen; para saber si además es un formato aceptado,
 *  usar `isSupportedVideoFile`. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/')
}

/** True si el File es un video de un formato que el backend acepta. Un `.avi`
 *  o similar es video pero no soportado: se rechaza con aviso en vez de dejar
 *  que el upload falle. */
export function isSupportedVideoFile(file: File): boolean {
  return (SUPPORTED_VIDEO_MIMES as readonly string[]).includes(file.type)
}

/**
 * Lee width/height de un video del lado del cliente cargando su metadata
 * (sin descargar el archivo entero). Resuelve {0,0} si falla — mismo
 * contrato tolerante que `readImageDimensions`: el caller guarda sin
 * dimensiones y el render cae a un aspect-ratio por defecto.
 */
export function readVideoDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    video.src = url
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
