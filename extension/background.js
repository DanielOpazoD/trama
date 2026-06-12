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
const MENU_COLLECT = 'trama-collect'
const MENU_IMAGE = 'trama-save-image'
const MENU_PAGE = 'trama-save-page'
const QUEUE_KEY = 'tramaQueue'
const COLLECTION_KEY = 'tramaCollection'
const ALARM_FLUSH = 'trama-flush'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Guardar selección en Trama',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: MENU_COLLECT,
      title: 'Añadir a la colección de Trama',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: MENU_IMAGE,
      title: 'Guardar imagen en Trama',
      contexts: ['image'],
    })
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: 'Guardar artículo en Trama',
      contexts: ['page'],
    })
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

/** Arma el payload definitivo (resuelve meta AHORA, no al reintentar).
 *  `override` permite forzar autor/fuente/imagen (captura estructurada,
 *  imagen, artículo) sin re-leer los meta de la página. */
async function buildPayload({ text, tab, note, imageUrl, override }) {
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
  // El backend corta texto a 20.000; recortamos antes para no gastar un
  // viaje en un 400 seguro.
  const clean = String(text).slice(0, 20000)
  return {
    text: clean,
    sourceUrl: override?.sourceUrl ?? tab?.url ?? null,
    sourceTitle: override?.sourceTitle ?? meta.title ?? tab?.title ?? null,
    sourceAuthor: override?.sourceAuthor ?? meta.author,
    imageUrl: imageUrl ?? null,
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
async function saveRecorte({ text, tab, note, imageUrl, override }) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'No hay texto que guardar.' }
  const payload = await buildPayload({ text: trimmed, tab, note, imageUrl, override })
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
 * Inyectado: extracción "readability-lite" del artículo principal, sin
 * dependencias. Elige el mejor contenedor (article > main > el bloque con
 * más texto de párrafos) y junta su prosa (encabezados, párrafos, listas,
 * citas) en orden. Devuelve { text, title, byline }.
 */
function pageExtractArticle() {
  function paragraphScore(el) {
    let score = 0
    const ps = el.querySelectorAll('p')
    for (let i = 0; i < ps.length; i++) {
      const len = (ps[i].innerText || '').trim().length
      if (len > 40) score += len
    }
    return score
  }
  let container = document.querySelector('article')
  if (!container) container = document.querySelector('main')
  if (!container) {
    // Mejor bloque por densidad de párrafos.
    const candidates = document.querySelectorAll('div, section')
    let best = null
    let bestScore = 0
    for (let i = 0; i < candidates.length; i++) {
      const s = paragraphScore(candidates[i])
      if (s > bestScore) {
        bestScore = s
        best = candidates[i]
      }
    }
    container = best
  }
  if (!container) return null
  const blocks = container.querySelectorAll('h1, h2, h3, p, li, blockquote')
  const parts = []
  for (let i = 0; i < blocks.length; i++) {
    const t = (blocks[i].innerText || '').trim()
    if (t.length > 1) parts.push(t)
  }
  const text = parts.join('\n\n').slice(0, 20000)
  if (text.length < 200) return null // probablemente no es un artículo
  const byline =
    document
      .querySelector('meta[name="author"], meta[property="article:author"]')
      ?.getAttribute('content') || null
  return { text, title: document.title || null, byline }
}

/**
 * Inyectado: captura estructurada en X/Twitter y Reddit. Usa el nodo de la
 * selección para encontrar el tweet/post que la contiene; si no hay
 * selección, toma el primero. Devuelve { text, author, url } o null —
 * siempre best-effort: ante cualquier cambio de DOM, devuelve null y el
 * flujo cae a la selección cruda.
 */
function pageExtractStructured() {
  const host = location.hostname.replace(/^www\./, '')
  const sel = window.getSelection()
  const anchor = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null
  const fromAnchor = (selector) => {
    let node = anchor && anchor.nodeType === 1 ? anchor : anchor?.parentElement
    while (node && node !== document.body) {
      if (node.matches && node.matches(selector)) return node
      node = node.parentElement
    }
    return document.querySelector(selector)
  }
  try {
    if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
      const article = fromAnchor('article[data-testid="tweet"]')
      if (!article) return null
      const textEl = article.querySelector('[data-testid="tweetText"]')
      const text = textEl ? textEl.innerText.trim() : ''
      if (!text) return null
      const nameEl = article.querySelector('[data-testid="User-Name"]')
      const author = nameEl ? nameEl.innerText.split('\n')[0].trim() : null
      const timeLink = article.querySelector('a[href*="/status/"] time')
      const url = timeLink ? timeLink.parentElement.href : location.href
      return { text, author, url, title: author ? `${author} en X` : 'X' }
    }
    if (host.endsWith('reddit.com')) {
      const post = fromAnchor('shreddit-post, [data-testid="post-container"]')
      if (!post) return null
      const title =
        post.getAttribute('post-title') ||
        post.querySelector('h1, [slot="title"]')?.innerText?.trim() ||
        document.title
      const bodyEl = post.querySelector(
        '[slot="text-body"], [data-post-click-location="text-body"]',
      )
      const body = bodyEl ? bodyEl.innerText.trim() : ''
      const author = post.getAttribute('author') || null
      const permalink = post.getAttribute('permalink')
      const url = permalink ? location.origin + permalink : location.href
      const text = [title, body].filter(Boolean).join('\n\n').trim()
      if (!text) return null
      return { text, author: author ? `u/${author}` : null, url, title }
    }
  } catch {
    return null
  }
  return null
}

/** Lee el subgrafo estructurado de la pestaña (best-effort). */
async function tryStructured(tab) {
  if (tab?.id == null) return null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractStructured,
    })
    return res?.result || null
  } catch {
    return null
  }
}

// ---- Colección (varios resaltados → un solo recorte) --------------------

async function getCollection() {
  const { [COLLECTION_KEY]: c } = await chrome.storage.local.get(COLLECTION_KEY)
  return c && Array.isArray(c.fragments) ? c : null
}

async function addToCollection(text, tab) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { count: 0 }
  let c = await getCollection()
  if (!c) {
    c = { sourceUrl: tab?.url ?? null, sourceTitle: tab?.title ?? null, fragments: [] }
  }
  c.fragments.push(trimmed.slice(0, 5000))
  await chrome.storage.local.set({ [COLLECTION_KEY]: c })
  // Badge naranja con la cuenta de la colección.
  chrome.action.setBadgeText({ text: String(c.fragments.length) })
  chrome.action.setBadgeBackgroundColor({ color: '#b8804a' })
  chrome.action.setTitle({
    title: `Trama · ${c.fragments.length} fragmento(s) en la colección`,
  })
  return { count: c.fragments.length }
}

async function clearCollection() {
  await chrome.storage.local.remove(COLLECTION_KEY)
  void getQueue().then((q) => paintBadge(q.length))
}

/** Junta los fragmentos en un solo recorte (cada uno como párrafo). */
async function saveCollection() {
  const c = await getCollection()
  if (!c || c.fragments.length === 0)
    return { ok: false, error: 'La colección está vacía.' }
  const text = c.fragments.join('\n\n— · —\n\n')
  const r = await saveRecorte({
    text,
    tab: null,
    override: { sourceUrl: c.sourceUrl, sourceTitle: c.sourceTitle, sourceAuthor: null },
  })
  if (r.ok) await clearCollection()
  return r
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

/** Guarda una selección, prefiriendo la captura estructurada (X/Reddit). */
async function saveSelection(rawText, tab) {
  const structured = await tryStructured(tab)
  if (structured && structured.text) {
    return saveRecorte({
      text: structured.text,
      tab,
      override: {
        sourceUrl: structured.url,
        sourceTitle: structured.title,
        sourceAuthor: structured.author,
      },
    })
  }
  return saveRecorte({ text: rawText, tab })
}

/** Guarda el artículo principal de la página (readability-lite). */
async function saveArticle(tab) {
  if (tab?.id == null) return { ok: false, error: 'Sin pestaña.' }
  let article = null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractArticle,
    })
    article = res?.result || null
  } catch {
    /* página restringida */
  }
  if (!article) return { ok: false, error: 'No se encontró un artículo en esta página.' }
  return saveRecorte({
    text: article.text,
    tab,
    override: {
      sourceUrl: tab.url,
      sourceTitle: article.title,
      sourceAuthor: article.byline,
    },
  })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText) {
    if (tab?.id != null) void flashHighlight(tab.id)
    await saveSelection(info.selectionText, tab)
  } else if (info.menuItemId === MENU_COLLECT && info.selectionText) {
    if (tab?.id != null) void flashHighlight(tab.id)
    await addToCollection(info.selectionText, tab)
  } else if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
    // El recorte exige texto; usamos el título de la página como pie.
    await saveRecorte({
      text: tab?.title || 'Imagen guardada',
      tab,
      imageUrl: info.srcUrl,
    })
  } else if (info.menuItemId === MENU_PAGE) {
    const r = await saveArticle(tab)
    flashBadge(r.ok)
  }
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
    await saveSelection(text, tab)
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
  if (msg?.kind === 'trama-article') {
    activeTab().then((tab) => saveArticle(tab).then(sendResponse))
    return true
  }
  if (msg?.kind === 'trama-collection') {
    getCollection().then((c) => sendResponse({ count: c ? c.fragments.length : 0 }))
    return true
  }
  if (msg?.kind === 'trama-collection-add') {
    addToCollection(msg.text, msg.tab).then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-collection-save') {
    saveCollection().then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-collection-clear') {
    clearCollection().then(() => sendResponse({ ok: true }))
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
