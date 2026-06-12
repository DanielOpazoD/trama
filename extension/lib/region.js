// @ts-check
/** Captura de región visual: overlay de arrastre → recorte → WebP → subida. */
import { getConfig } from './config.js'
import { saveRecorte } from './recorte.js'
import { regionOverlay } from './inject.js'

/**
 * Sube una imagen (Blob) al store interno y devuelve su imageKey. A diferencia
 * de un recorte de texto, la imagen no se encola: pesa y la región solo tiene
 * sentido con conexión. Si falla, el llamador avisa.
 * @param {Blob} blob
 * @param {string} [filename]
 * @returns {Promise<{ ok: boolean, imageKey?: string, reason?: string }>}
 */
export async function uploadImage(blob, filename) {
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, reason: 'sin token' }
  try {
    const fd = new FormData()
    fd.append('file', blob, filename || 'region.webp')
    const res = await fetch(`${baseUrl}/api/recortes-image-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const j = await res.json()
    if (!j?.imageKey) return { ok: false, reason: 'respuesta sin imageKey' }
    return { ok: true, imageKey: j.imageKey }
  } catch {
    return { ok: false, reason: 'sin conexión' }
  }
}

/** Inyecta el overlay de región en la pestaña activa. */
export async function startRegionCapture(tab) {
  if (tab?.id == null) return { ok: false, error: 'Sin pestaña.' }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: regionOverlay,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'No se puede capturar en esta página.' }
  }
}

/**
 * Recibe el rect del overlay: captura el viewport visible, recorta a la región
 * (en px de dispositivo) vía OffscreenCanvas, comprime a WebP, sube el blob y
 * guarda un recorte 'region' con su imageKey.
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {number} dpr
 * @param {{ id?: number, url?: string, title?: string, windowId?: number }} tab
 */
export async function cropAndSaveRegion(rect, dpr, tab) {
  if (tab?.id == null) return { ok: false, error: 'Sin pestaña.' }
  let dataUrl
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  } catch {
    return { ok: false, error: 'No se pudo capturar la pantalla.' }
  }
  if (!dataUrl) return { ok: false, error: 'Captura vacía.' }
  let webp
  try {
    const full = await (await fetch(dataUrl)).blob()
    const bitmap = await createImageBitmap(full)
    const ratio = dpr || 1
    let sx = Math.round(rect.x * ratio)
    let sy = Math.round(rect.y * ratio)
    let sw = Math.round(rect.w * ratio)
    let sh = Math.round(rect.h * ratio)
    // Clamp a los límites reales del bitmap (evita drawImage fuera de rango).
    sx = Math.max(0, Math.min(sx, bitmap.width - 1))
    sy = Math.max(0, Math.min(sy, bitmap.height - 1))
    sw = Math.max(1, Math.min(sw, bitmap.width - sx))
    sh = Math.max(1, Math.min(sh, bitmap.height - sy))
    const canvas = new OffscreenCanvas(sw, sh)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, error: 'No se pudo recortar la imagen.' }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
    bitmap.close?.()
    webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
  } catch {
    return { ok: false, error: 'No se pudo recortar la imagen.' }
  }
  const up = await uploadImage(webp, 'region.webp')
  if (!up.ok) return { ok: false, error: `No se pudo subir la imagen (${up.reason}).` }
  return saveRecorte({
    text: tab.title || 'Recorte visual de la página',
    tab: { id: tab.id, url: tab.url, title: tab.title },
    imageKey: up.imageKey,
    captureMode: 'region',
    override: {
      sourceUrl: tab.url ?? null,
      sourceTitle: tab.title ?? null,
      sourceAuthor: null,
    },
  })
}
