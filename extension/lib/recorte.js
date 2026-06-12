// @ts-check
/** Armado del payload, camino de guardado y subida de imágenes internas. */
import { getConfig } from './config.js'
import { enqueue, flashBadge, sendPayload } from './queue.js'
import { readPageMeta } from './inject.js'

/**
 * Sube una imagen (Blob) al store interno y devuelve su imageKey. A diferencia
 * de un recorte de texto, la imagen no se encola: pesa y solo tiene sentido con
 * conexión. La usan la captura de región y el guardado de imágenes de la web.
 * @param {Blob} blob
 * @param {string} [filename]
 * @returns {Promise<{ ok: boolean, imageKey?: string, reason?: string }>}
 */
export async function uploadImage(blob, filename) {
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, reason: 'sin token' }
  try {
    const fd = new FormData()
    fd.append('file', blob, filename || 'imagen.webp')
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

/**
 * Arma el payload definitivo (resuelve meta AHORA, no al reintentar).
 * `override` fuerza autor/fuente/imagen (captura estructurada, imagen,
 * artículo) sin re-leer los meta. `captureMode` etiqueta cómo se capturó;
 * default 'citation'. `imageKey` es el blob interno authed (región/screenshot),
 * distinto de `imageUrl` (URL externa).
 * @param {SaveArgs} args
 * @returns {Promise<RecortePayload>}
 */
export async function buildPayload({
  text,
  tab,
  note,
  imageUrl,
  imageKey,
  captureMode,
  override,
}) {
  let meta = { author: null, title: tab?.title ?? null }
  if (!override && tab?.id != null) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readPageMeta,
      })
      if (result?.result) meta = { ...meta, ...result.result }
    } catch {
      /* página restringida (chrome://, store) — seguimos con el título de la tab */
    }
  }
  // El backend corta texto a 20.000; recortamos antes para no gastar un viaje
  // en un 400 seguro.
  const clean = String(text).slice(0, 20000)
  return {
    text: clean,
    sourceUrl: override?.sourceUrl ?? tab?.url ?? null,
    sourceTitle: override?.sourceTitle ?? meta.title ?? tab?.title ?? null,
    sourceAuthor: override?.sourceAuthor ?? meta.author,
    imageUrl: imageUrl ?? null,
    imageKey: imageKey ?? null,
    captureMode: captureMode ?? 'citation',
    note: note || null,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Camino único de guardado. Intenta enviar al instante; si falla de forma
 * reintentable, encola y devuelve `queued`. Solo el 400 (payload inválido) es
 * un fracaso duro.
 * @param {SaveArgs} args
 * @returns {Promise<{ ok: boolean, queued?: boolean, reason?: string, error?: string }>}
 */
export async function saveRecorte({
  text,
  tab,
  note,
  imageUrl,
  imageKey,
  captureMode,
  override,
}) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'No hay texto que guardar.' }
  const payload = await buildPayload({
    text: trimmed,
    tab,
    note,
    imageUrl,
    imageKey,
    captureMode,
    override,
  })
  const r = await sendPayload(payload)
  if (r.ok) {
    flashBadge(true)
    return { ok: true }
  }
  if (r.retryable) {
    await enqueue(payload)
    flashBadge(false)
    return { ok: true, queued: true, reason: r.reason }
  }
  flashBadge(false)
  return { ok: false, error: `No se pudo guardar (${r.reason}).` }
}
