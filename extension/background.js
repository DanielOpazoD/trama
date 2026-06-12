/**
 * Trama — Recortes · service worker (Manifest V3).
 *
 * Captura desde la web → bandeja de Recortes. Dos gestos: clic derecho
 * sobre una selección, o el atajo de teclado. Nada de scraping pasivo:
 * solo se lee la pestaña activa cuando el usuario actúa.
 *
 * ROBUSTEZ — el SW de MV3 es efímero (Chrome lo mata entre eventos) y la
 * red puede no estar. Por eso una captura nunca se hace "a ciegas":
 *   1. Se arma el payload COMPLETO en el momento (texto + meta de la
 *      página), porque al reintentar la pestaña ya puede no existir.
 *   2. Si el envío falla por red / 5xx / token, el payload entra a una
 *      COLA en chrome.storage.local y un alarm la reintenta cada minuto.
 *   3. La cola sobrevive a que Chrome mate el SW (vive en storage, no en
 *      memoria). El badge muestra cuántas capturas esperan.
 * Resultado: ninguna captura se pierde, aunque guardes sin conexión.
 */

const MENU_ID = 'trama-save-selection'
const QUEUE_KEY = 'tramaQueue'
const ALARM_FLUSH = 'trama-flush'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Guardar selección en Trama',
    contexts: ['selection'],
  })
})

// Al despertar el SW, si quedaron capturas en cola, intentar vaciarla.
chrome.runtime.onStartup.addListener(() => void flushQueue())

async function getConfig() {
  const { tramaToken, tramaBaseUrl } = await chrome.storage.local.get([
    'tramaToken',
    'tramaBaseUrl',
  ])
  return {
    token: tramaToken || null,
    baseUrl: (tramaBaseUrl || 'https://tramahub.app').replace(/\/+$/, ''),
  }
}

/** Lee metadatos de la página (autor de meta tags) en el contexto de la tab. */
function readPageMeta() {
  const pick = (sel) => document.querySelector(sel)?.getAttribute('content') || null
  return {
    author:
      pick('meta[name="author"]') ||
      pick('meta[property="article:author"]') ||
      pick('meta[name="twitter:creator"]'),
    title: pick('meta[property="og:title"]') || document.title || null,
  }
}

/** Arma el payload definitivo (resuelve meta AHORA, no al reintentar). */
async function buildPayload({ text, tab, note }) {
  let meta = { author: null, title: tab?.title ?? null }
  if (tab?.id != null) {
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
  // El backend corta texto a 20.000; recortamos antes para no gastar un
  // viaje en un 400 seguro.
  const clean = String(text).slice(0, 20000)
  return {
    text: clean,
    sourceUrl: tab?.url ?? null,
    sourceTitle: meta.title ?? tab?.title ?? null,
    sourceAuthor: meta.author,
    note: note || null,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Envía un payload ya armado. Devuelve la naturaleza del resultado para
 * decidir si encolar (red/5xx/token → reintentable) o descartar (400 →
 * el payload es inválido, reintentar no ayuda).
 */
async function sendPayload(payload) {
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

async function getQueue() {
  const { [QUEUE_KEY]: q } = await chrome.storage.local.get(QUEUE_KEY)
  return Array.isArray(q) ? q : []
}

async function setQueue(q) {
  await chrome.storage.local.set({ [QUEUE_KEY]: q })
  paintBadge(q.length)
}

async function enqueue(payload) {
  const q = await getQueue()
  q.push(payload)
  await setQueue(q)
  // Alarm de reintento (mínimo 1 min en MV3). Lo (re)programamos siempre:
  // crear un alarm con el mismo nombre reemplaza el anterior.
  chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 1 })
}

/** Vacía la cola: cada payload se reintenta; sale de la cola al lograrse
 *  o al ser un descarte permanente (400). Para si la red sigue caída. */
async function flushQueue() {
  let q = await getQueue()
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_FLUSH) void flushQueue()
})

/** Badge: ✓ efímero al guardar, número de pendientes si hay cola, ! si error. */
function paintBadge(queueLen) {
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

function flashBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#4a6b4f' : '#8a3b2e' })
  setTimeout(() => void getQueue().then((q) => paintBadge(q.length)), 3500)
}

/**
 * Camino único de guardado. Intenta enviar al instante; si falla de forma
 * reintentable, encola y devuelve `queued`. Solo el 400 (payload inválido)
 * es un fracaso duro.
 */
async function saveRecorte({ text, tab, note }) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'No hay texto que guardar.' }
  const payload = await buildPayload({ text: trimmed, tab, note })
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

/** Resuelve la pestaña activa (para el atajo de teclado y el menú). */
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

function readSelection() {
  return window.getSelection()?.toString() ?? ''
}

/**
 * Inyectado EN la página: pinta la selección con un barrido dorado de
 * marcador que se desvanece. Confirmación visual de QUÉ se capturó, justo
 * donde pasó. No muta el DOM — una capa de overlays sobre los rects de la
 * selección, así sirve en cualquier markup. Respeta reduced-motion.
 * Debe ser autocontenida (se serializa hacia el contexto de la página).
 */
function pageFlashHighlight() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
  const rects = []
  for (let i = 0; i < sel.rangeCount; i++) {
    const list = sel.getRangeAt(i).getClientRects()
    for (let j = 0; j < list.length; j++) {
      const r = list[j]
      if (r.width > 0 && r.height > 0) rects.push(r)
    }
  }
  if (rects.length === 0) return
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const layer = document.createElement('div')
  layer.setAttribute('data-trama-highlight', '')
  layer.style.cssText =
    'position:fixed;inset:0;margin:0;padding:0;z-index:2147483647;pointer-events:none;'
  rects.forEach((rect, i) => {
    const m = document.createElement('div')
    m.style.cssText =
      'position:absolute;background:rgba(160,121,0,0.34);border-radius:2px;' +
      'left:' +
      rect.left +
      'px;top:' +
      rect.top +
      'px;width:' +
      rect.width +
      'px;height:' +
      rect.height +
      'px;'
    if (!reduce && typeof m.animate === 'function') {
      m.style.clipPath = 'inset(0 100% 0 0)'
      m.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
        duration: 240,
        delay: i * 45,
        easing: 'cubic-bezier(0.25,1,0.5,1)',
        fill: 'forwards',
      })
    }
    layer.appendChild(m)
  })
  document.documentElement.appendChild(layer)
  const hold = reduce ? 350 : 650
  setTimeout(() => {
    if (typeof layer.animate === 'function') {
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' })
      setTimeout(() => layer.remove(), 440)
    } else {
      layer.remove()
    }
  }, hold)
}

/** Dispara el barrido dorado en la pestaña (best-effort, páginas normales). */
async function flashHighlight(tabId) {
  if (tabId == null) return
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: pageFlashHighlight })
  } catch {
    /* página restringida (chrome://, store): sin resaltado, el badge confirma */
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return
  if (tab?.id != null) void flashHighlight(tab.id)
  await saveRecorte({ text: info.selectionText, tab })
})

// Atajo de teclado: lee la selección de la pestaña activa y la guarda.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'save-selection') return
  const tab = await activeTab()
  if (!tab?.id) return
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readSelection,
    })
    const text = res?.result ?? ''
    if (text.trim()) void flashHighlight(tab.id)
    await saveRecorte({ text, tab })
  } catch {
    flashBadge(false)
  }
})

// El popup delega acá: guardar, probar conexión y leer el estado de la cola.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'trama-save') {
    saveRecorte(msg).then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-test') {
    testConnection().then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-queue') {
    getQueue().then((q) => sendResponse({ pending: q.length }))
    return true
  }
  if (msg?.kind === 'trama-recent') {
    getRecent().then(sendResponse)
    return true
  }
  return undefined
})

/** Trae los últimos recortes pendientes para la mini-bandeja del popup. */
async function getRecent() {
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, items: [], baseUrl }
  try {
    const res = await fetch(`${baseUrl}/api/recortes?status=pending`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, items: [], baseUrl }
    const all = await res.json()
    const items = (Array.isArray(all) ? all : []).slice(0, 4).map((r) => ({
      text: r.text,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      capturedAt: r.captured_at || r.created_at,
    }))
    return { ok: true, items, baseUrl }
  } catch {
    return { ok: false, items: [], baseUrl }
  }
}

/** Probar conexión: pide la lista de recortes (GET liviano) con el token. */
async function testConnection() {
  const { token, baseUrl } = await getConfig()
  if (!token) return { ok: false, reason: 'Falta el token.' }
  try {
    const res = await fetch(`${baseUrl}/api/recortes?status=pending`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, reason: 'Token inválido o revocado.' }
    return { ok: false, reason: `Servidor respondió ${res.status}.` }
  } catch {
    return { ok: false, reason: 'Sin conexión con el servidor.' }
  }
}
