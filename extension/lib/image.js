// @ts-check
/**
 * Guardado de imágenes de la web (clic derecho → «Guardar imagen en Trama»).
 *
 * Idea: DESCARGAR los bytes a tu almacenamiento (la imagen sobrevive aunque la
 * fuente la borre) conservando el link de la página de origen (sourceUrl).
 * Descargar de otro dominio requiere permiso de host; se pide por-dominio y
 * on-demand (optional_host_permissions) la primera vez, en respuesta al clic.
 * Si el permiso se deniega o la descarga falla, cae a guardar la URL externa
 * de la imagen (comportamiento histórico) — nunca se pierde la captura.
 */
import { saveRecorte, uploadImage } from './recorte.js'

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif)$/

/** Patrón de origen para chrome.permissions (solo http/https). null si no aplica. */
export function imageOriginPattern(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') return `${u.origin}/*`
  } catch {
    /* URL inválida */
  }
  return null
}

/** ¿Tenemos —o conseguimos— permiso de host para descargar de ese origen? */
async function ensureOriginAccess(pattern) {
  try {
    if (await chrome.permissions.contains({ origins: [pattern] })) return true
    return await chrome.permissions.request({ origins: [pattern] })
  } catch {
    return false
  }
}

/** Descarga los bytes de la imagen como Blob (o null si no se puede / no es imagen). */
async function downloadImageBlob(srcUrl) {
  // data: URL → legible sin permiso de host.
  if (srcUrl.startsWith('data:')) {
    try {
      const b = await (await fetch(srcUrl)).blob()
      return ALLOWED_MIME.test(b.type) ? b : null
    } catch {
      return null
    }
  }
  const pattern = imageOriginPattern(srcUrl)
  if (!pattern) return null // blob:, chrome:, etc. — no descargable desde el SW
  if (!(await ensureOriginAccess(pattern))) return null
  try {
    const res = await fetch(srcUrl)
    if (!res.ok) return null
    const b = await res.blob()
    return ALLOWED_MIME.test(b.type) ? b : null
  } catch {
    return null
  }
}

/**
 * Guarda una imagen de la web. Devuelve el resultado del guardado más `stored`:
 * 'blob' si se descargó a tu almacenamiento, 'link' si cayó al fallback de URL.
 * @param {string} srcUrl
 * @param {{ id?: number, url?: string, title?: string } | null | undefined} tab
 * @returns {Promise<{ ok: boolean, queued?: boolean, error?: string, stored: 'blob' | 'link' }>}
 */
export async function saveImage(srcUrl, tab) {
  const text = tab?.title || 'Imagen guardada'
  const blob = await downloadImageBlob(srcUrl)
  if (blob) {
    const up = await uploadImage(blob, 'imagen')
    if (up.ok) {
      const r = await saveRecorte({
        text,
        tab,
        imageKey: up.imageKey,
        captureMode: 'image',
      })
      return { ...r, stored: 'blob' }
    }
  }
  // Fallback: guardar la URL externa de la imagen (sigue con su link de página).
  const r = await saveRecorte({ text, tab, imageUrl: srcUrl, captureMode: 'image' })
  return { ...r, stored: 'link' }
}
