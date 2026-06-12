// @ts-check
/**
 * Badge del icono + cola offline de capturas.
 *
 * El SW de MV3 es efímero y la red puede fallar. Por eso una captura nunca se
 * hace "a ciegas": si el envío falla de forma reintentable (red / 5xx / token)
 * el payload entra a una COLA en chrome.storage.local y un alarm la reintenta
 * cada minuto. La cola sobrevive a que Chrome mate el SW (vive en storage, no
 * en memoria). Solo el 400 (payload inválido) se descarta.
 */
import { getConfig } from './config.js'

const QUEUE_KEY = 'tramaQueue'
export const ALARM_FLUSH = 'trama-flush'

/**
 * Envía un payload ya armado. Devuelve la naturaleza del resultado para
 * decidir si encolar (reintentable) o descartar (400 → inválido).
 * @param {RecortePayload} payload
 * @returns {Promise<{ ok: boolean, retryable?: boolean, reason?: string }>}
 */
export async function sendPayload(payload) {
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, retryable: true, reason: 'sin token' }
  try {
    const res = await fetch(`${baseUrl}/api/recortes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401)
      return { ok: false, retryable: true, reason: 'token inválido' }
    if (res.status >= 500)
      return { ok: false, retryable: true, reason: `HTTP ${res.status}` }
    return { ok: false, retryable: false, reason: `HTTP ${res.status}` }
  } catch {
    return { ok: false, retryable: true, reason: 'sin conexión' }
  }
}

/** @returns {Promise<RecortePayload[]>} */
async function getQueue() {
  const { [QUEUE_KEY]: q } = await chrome.storage.local.get(QUEUE_KEY)
  return Array.isArray(q) ? q : []
}

/** @param {RecortePayload[]} q */
async function setQueue(q) {
  await chrome.storage.local.set({ [QUEUE_KEY]: q })
  paintBadge(q.length)
}

/** @param {RecortePayload} payload */
export async function enqueue(payload) {
  const q = await getQueue()
  q.push(payload)
  await setQueue(q)
  // Alarm de reintento (mínimo 1 min en MV3). (Re)programarlo siempre: crear
  // un alarm con el mismo nombre reemplaza el anterior.
  chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 1 })
}

/**
 * Vacía la cola: cada payload se reintenta; sale de la cola al lograrse o al
 * ser un descarte permanente (400). Para si la red sigue caída.
 */
export async function flushQueue() {
  const q = await getQueue()
  if (q.length === 0) {
    chrome.alarms.clear(ALARM_FLUSH)
    return
  }
  const pending = []
  for (const payload of q) {
    const r = await sendPayload(payload)
    if (r.ok) continue // enviado: fuera de la cola
    if (!r.retryable) continue // 400: descartar (payload inválido)
    pending.push(payload) // red/5xx/token: sigue esperando
  }
  await setQueue(pending)
  if (pending.length === 0) chrome.alarms.clear(ALARM_FLUSH)
}

/** Badge: número de pendientes si hay cola, vacío si no. */
export function paintBadge(queueLen) {
  if (queueLen > 0) {
    chrome.action.setBadgeText({ text: String(queueLen) })
    chrome.action.setBadgeBackgroundColor({ color: '#a07900' }) // gold = esperando
    chrome.action.setTitle({
      title: `Trama · ${queueLen} captura(s) esperando conexión`,
    })
  } else {
    chrome.action.setBadgeText({ text: '' })
    chrome.action.setTitle({ title: 'Guardar en Trama' })
  }
}

/** Badge efímero: ✓ al guardar, ! si error; vuelve al estado de la cola. */
export function flashBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#4a6b4f' : '#8a3b2e' })
  setTimeout(() => void getQueue().then((q) => paintBadge(q.length)), 3500)
}

/** Repinta el badge según la cantidad pendiente en la cola (sin flash). */
export function refreshBadge() {
  void getQueue().then((q) => paintBadge(q.length))
}
