// @ts-check
/**
 * Guardado de imágenes de la web (clic derecho → «Guardar imagen en Trama»).
 *
 * Objetivo: DESCARGAR los bytes a tu almacenamiento (la imagen sobrevive aunque
 * la fuente la borre) conservando el link de la página de origen (sourceUrl).
 * Conseguir los bytes de otro dominio es lo difícil; se intenta en cascada:
 *
 *   1. data: URL → se lee directo (sin permisos).
 *   2. Permiso de host por-dominio (optional_host_permissions, on-demand): se
 *      pide PRIMERO, sincrónico dentro del clic, para no perder el "gesto de
 *      usuario". Con permiso, el service worker descarga sin CORS.
 *   3. Desde la PÁGINA (content script): fetch con cookies/referer del sitio o
 *      canvas sobre la imagen ya cargada. Salva los casos en que el server
 *      rechaza el fetch del SW (diarios con hotlink protection).
 *   4. Fallback: guardar la URL externa — nunca se pierde la captura.
 */
import { saveRecorte, uploadImage } from './recorte.js'
import { pageGrabImage } from './inject.js'

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif)$/
const HOST_PERMISSION_EVENTS_KEY = 'tramaHostPermissionEvents'
const HOST_PERMISSION_EVENTS_LIMIT = 20

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

function imageOrigin(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin
  } catch {
    /* URL inválida */
  }
  return null
}

async function recordHostPermissionDecision({ srcUrl, pattern, granted }) {
  const origin = imageOrigin(srcUrl)
  if (!origin) return
  try {
    const stored = await chrome.storage.local.get(HOST_PERMISSION_EVENTS_KEY)
    const current = Array.isArray(stored?.[HOST_PERMISSION_EVENTS_KEY])
      ? stored[HOST_PERMISSION_EVENTS_KEY]
      : []
    const next = [
      {
        at: new Date().toISOString(),
        origin,
        pattern,
        granted,
        surface: 'image',
      },
      ...current,
    ].slice(0, HOST_PERMISSION_EVENTS_LIMIT)
    await chrome.storage.local.set({ [HOST_PERMISSION_EVENTS_KEY]: next })
  } catch {
    // La telemetría local no debe bloquear una captura.
  }
}

/** fetch + Blob, validando que sea una imagen soportada. null si no. */
async function imageBlobFromFetch(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const b = await res.blob()
    return ALLOWED_MIME.test(b.type) ? b : null
  } catch {
    return null
  }
}

/** Pide al content script los bytes de la imagen (cookies/referer o canvas). */
async function grabViaPage(srcUrl, tabId) {
  if (tabId == null) return null
  let dataUrl
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: pageGrabImage,
      args: [srcUrl],
    })
    dataUrl = res?.result
  } catch {
    return null
  }
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
  return imageBlobFromFetch(dataUrl)
}

/**
 * Consigue el Blob de la imagen. El permiso se pide PRIMERO (gesto intacto).
 * @param {string} srcUrl
 * @param {number|undefined|null} tabId
 * @returns {Promise<Blob | null>}
 */
async function downloadImageBlob(srcUrl, tabId) {
  if (srcUrl.startsWith('data:')) return imageBlobFromFetch(srcUrl)

  // Pedir el permiso del dominio PRIMERO: es el primer await de la cadena, así
  // el gesto del clic sigue vigente (request() lo exige). Ya concedido → true
  // sin volver a preguntar; denegado → seguimos con el camino de la página.
  const pattern = imageOriginPattern(srcUrl)
  let granted = false
  if (pattern) {
    try {
      granted = await chrome.permissions.request({ origins: [pattern] })
    } catch {
      granted = false
    }
    await recordHostPermissionDecision({ srcUrl, pattern, granted })
  }

  // Con permiso: el SW descarga sin CORS (limpio, sin ruido en la consola).
  if (granted) {
    const b = await imageBlobFromFetch(srcUrl)
    if (b) return b
  }
  // Desde la página: sirve sin permiso (same-origin) o cuando el server bloquea
  // el fetch del SW pero la imagen ya está cargada en la pestaña.
  return grabViaPage(srcUrl, tabId)
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
  const blob = await downloadImageBlob(srcUrl, tab?.id)
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
