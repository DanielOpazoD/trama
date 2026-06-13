// @ts-check
/**
 * Popup de Trama - Recortes. Precarga la seleccion de la pestana activa
 * (solo al abrirse: gesto explicito del usuario), deja anotar, y delega el
 * guardado al service worker (un solo camino al backend, con cola offline).
 * El estado de "conexion" vive arriba; ahi se guarda token y servidor y se
 * prueba la conexion.
 */

/**
 * Acceso a elementos del popup. Devuelve `any` a propósito: el HTML es fijo y
 * conocido, así que evitamos castear `.value`/`.hidden`/`.src` en cada uso.
 * @param {string} id
 * @returns {any}
 */
const $ = (id) => document.getElementById(id)

let currentTab = null
// Modo de captura activo: 'citation' (texto seleccionado) | 'article'
// (artículo con estructura) | 'region' (recorte visual). 'citation' usa el
// textarea; los demás lo ocultan — y 'region' además cierra el popup para
// arrastrar el recuadro en la página.
let currentMode = 'citation'

const MODE_HINT = {
  article:
    'Captura el artículo principal conservando su estructura (títulos, listas, enlaces).',
  region: 'Arrastra un recuadro sobre la página para recortarlo como imagen.',
}
const MODE_BUTTON = {
  citation: 'Guardar en Recortes',
  article: 'Guardar artículo',
  region: 'Capturar región',
}

function setMode(mode) {
  currentMode = mode
  const opts = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('.mode-opt')
  )
  for (const btn of opts) {
    btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false')
  }
  const isPage = mode !== 'citation'
  // En modos de página el textarea no aplica (se captura todo) → se oculta y
  // el botón queda siempre habilitado; en cita vuelve la cuenta de caracteres.
  $('textoLabel').hidden = isPage
  $('modeHint').hidden = !isPage
  $('modeHint').textContent = isPage ? MODE_HINT[mode] : ''
  $('guardar').textContent = MODE_BUTTON[mode]
  if (isPage) {
    $('guardar').disabled = false
  } else {
    updateCount()
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Carga la pestaña activa: la necesitan el favorito y la precarga de cita. */
async function loadTab() {
  currentTab = await activeTab()
}

async function preloadSelection() {
  const tab = currentTab ?? (await activeTab())
  if (!tab?.id) return
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    })
    if (result?.result) {
      $('texto').value = result.result.trim()
      updateCount()
    }
  } catch {
    /* paginas restringidas: el usuario puede pegar a mano */
  }
}

function updateCount() {
  const n = $('texto').value.trim().length
  $('count').textContent = n.toLocaleString('es')
  $('guardar').disabled = n === 0
}

function setEstado(text, kind) {
  const el = $('estado')
  el.className = ''
  el.textContent = ''
  if (!text) return
  if (kind) el.classList.add(kind, 'flash')
  if (kind) {
    const dot = document.createElement('span')
    dot.className = 'dot'
    el.appendChild(dot)
  }
  el.appendChild(document.createTextNode(text))
}

async function loadConfig() {
  const { tramaToken, tramaBaseUrl } = await chrome.storage.local.get([
    'tramaToken',
    'tramaBaseUrl',
  ])
  if (tramaToken) $('token').value = tramaToken
  $('baseUrl').value = tramaBaseUrl || 'https://tramahub.app'
  if (!tramaToken) $('config').open = true
}

/** Estado de conexión automático al abrir: el punto de «conexión» se pone
 *  verde si el servidor responde con el token, rojo si falla, gris si aún no
 *  hay token. Así no hace falta pulsar «Probar conexión» para saber si está
 *  sincronizado. */
/** Refleja el estado en el indicador del tope (punto + etiqueta):
 *  '' = sin token (gris), 'ok' = conectado (verde), 'err' = sin conexión (rojo). */
function setConn(state) {
  $('connDot').className = state ? `conn-dot ${state}` : 'conn-dot'
  $('connLabel').textContent =
    state === 'ok' ? 'conectado' : state === 'err' ? 'sin conexión' : 'conexión'
}

async function refreshConnStatus() {
  if (!$('token').value.trim()) {
    setConn('')
    return
  }
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'trama-test' })
    setConn(res?.ok ? 'ok' : 'err')
  } catch {
    setConn('err')
  }
}

/** Tema del popup: auto (sigue al sistema) o forzado papel/noche/vela —
 *  los tres temas de la casa. Persistido en chrome.storage.local. */
function applyTheme(theme) {
  if (!theme || theme === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  const opts = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('.theme-opt')
  )
  for (const btn of opts) {
    btn.setAttribute(
      'aria-pressed',
      btn.dataset.theme === (theme || 'auto') ? 'true' : 'false',
    )
  }
}

async function loadTheme() {
  const { tramaTheme } = await chrome.storage.local.get('tramaTheme')
  applyTheme(tramaTheme || 'auto')
}

$('themeOpts').addEventListener('click', (e) => {
  const btn = e.target.closest('.theme-opt')
  if (!btn) return
  const theme = btn.dataset.theme
  applyTheme(theme)
  chrome.storage.local.set({ tramaTheme: theme })
})

async function refreshQueue() {
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'trama-queue' })
    const pending = res?.pending ?? 0
    if (pending > 0) {
      $('queueNote').hidden = false
      $('queueNote').textContent =
        `${pending} captura(s) esperando conexion - se reintenta solo.`
    } else {
      $('queueNote').hidden = true
    }
  } catch {
    /* SW dormido: sin novedad */
  }
}

$('modes').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-opt')
  if (!btn) return
  setMode(btn.dataset.mode)
})

$('texto').addEventListener('input', updateCount)
// ⌘/Ctrl + Enter guarda sin levantar la mano del teclado.
$('texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    $('guardar').click()
  }
})

$('guardarConfig').addEventListener('click', async () => {
  await chrome.storage.local.set({
    tramaToken: $('token').value.trim(),
    tramaBaseUrl: $('baseUrl').value.trim() || 'https://tramahub.app',
  })
  setEstado('conexion guardada', 'ok')
})

$('probar').addEventListener('click', async () => {
  // Guardamos primero para probar con lo que esta escrito.
  await chrome.storage.local.set({
    tramaToken: $('token').value.trim(),
    tramaBaseUrl: $('baseUrl').value.trim() || 'https://tramahub.app',
  })
  $('probar').disabled = true
  setConn('')
  const res = await chrome.runtime.sendMessage({ kind: 'trama-test' })
  $('probar').disabled = false
  if (res?.ok) {
    setConn('ok')
    setEstado('conexion verificada', 'ok')
  } else {
    setConn('err')
    setEstado(res?.reason ?? 'no se pudo conectar', 'err')
  }
})

function relativeDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const day = 86400000
  if (diff < day) return 'hoy'
  if (diff < 2 * day) return 'ayer'
  if (diff < 7 * day) return `hace ${Math.floor(diff / day)} días`
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** Mini-bandeja: los últimos recortes pendientes, traídos del servidor. */
async function refreshRecent() {
  let res
  try {
    res = await chrome.runtime.sendMessage({ kind: 'trama-recent' })
  } catch {
    return
  }
  const baseUrl = res?.baseUrl || 'https://tramahub.app'
  const root = baseUrl.replace(/\/+$/, '')
  $('openTray').href = `${root}/?view=recortes`
  $('openFavorites').href = `${root}/?view=recortes&tab=favoritos`
  if (!res?.ok) return // sin token o sin conexión: la sección queda oculta
  const list = $('recentList')
  list.textContent = ''
  if (res.items.length === 0) {
    const p = document.createElement('p')
    p.className = 'recent-empty'
    p.textContent = 'Todavía sin recortes pendientes.'
    list.appendChild(p)
  } else {
    for (const it of res.items) {
      const host = hostOf(it.sourceUrl)
      const a = document.createElement('a')
      a.className = 'recent-item'
      a.href = it.sourceUrl || $('openTray').href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      const img = document.createElement('img')
      img.alt = ''
      img.src = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : ''
      const body = document.createElement('div')
      body.className = 'ri-body'
      const txt = document.createElement('div')
      txt.className = 'ri-text'
      txt.textContent = `«${it.text}»`
      const meta = document.createElement('div')
      meta.className = 'ri-meta'
      meta.textContent = [it.sourceTitle || host, relativeDate(it.capturedAt)]
        .filter(Boolean)
        .join(' · ')
      body.appendChild(txt)
      body.appendChild(meta)
      a.appendChild(img)
      a.appendChild(body)
      list.appendChild(a)
    }
  }
  $('recent').hidden = false
}

/** Captura de artículo: delega al SW, que lee y extrae la pestaña. */
async function savePageMode() {
  setEstado('leyendo el artículo...')
  const res = await chrome.runtime.sendMessage({ kind: 'trama-article' })
  if (res?.ok) {
    setEstado('artículo guardado en Recortes', 'ok')
    refreshRecent()
    refreshQueue()
  } else {
    setEstado(res?.error ?? 'no se pudo capturar el artículo', 'err')
  }
}

$('guardar').addEventListener('click', async () => {
  if (currentMode === 'region') {
    // Arranca el overlay de arrastre en la página y cierra el popup para no
    // tapar la pantalla. El recorte se guarda al soltar; el badge + toast
    // confirman.
    const res = await chrome.runtime.sendMessage({ kind: 'trama-region-start' })
    if (res?.ok) window.close()
    else setEstado(res?.error ?? 'no se puede capturar aquí', 'err')
    return
  }
  $('guardar').disabled = true
  if (currentMode !== 'citation') {
    await savePageMode()
    $('guardar').disabled = false
    return
  }
  const text = $('texto').value.trim()
  if (!text) {
    $('guardar').disabled = false
    return
  }
  setEstado('prensando el recorte...')
  const tab = currentTab ?? (await activeTab())
  const result = await chrome.runtime.sendMessage({
    kind: 'trama-save',
    text,
    captureMode: 'citation',
    tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null,
  })
  if (result?.ok && !result.queued) {
    setEstado('guardado en Recortes', 'ok')
    $('texto').value = ''
    updateCount()
    refreshRecent()
  } else if (result?.queued) {
    setEstado('sin señal — lo guardo y lo llevo después', 'ok')
    $('texto').value = ''
    updateCount()
    refreshQueue()
  } else {
    setEstado(result?.error ?? 'no se pudo guardar', 'err')
    $('guardar').disabled = false
    if (/token/i.test($('estado').textContent)) $('config').open = true
  }
})
/** Pinta el botón como ya guardado: estrella dorada y rellena, y lo deshabilita
 *  para no duplicar el marcador. */
function markFavoriteSaved() {
  $('saveFavorite').classList.add('saved')
  $('saveFavorite').disabled = true
  $('saveFavorite').title = 'Ya está en tus Favoritos'
  $('favStar').textContent = '★'
}

/** Al abrir: ¿la página ya es favorita? Si sí, abre con la estrella dorada. */
async function checkFavorite() {
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'trama-favorite-status' })
    if (res?.ok && res.exists) markFavoriteSaved()
  } catch {
    /* sin token/conexión: el botón queda en su estado normal */
  }
}

$('saveFavorite').addEventListener('click', async () => {
  setEstado('marcando como favorito...')
  const res = await chrome.runtime.sendMessage({ kind: 'trama-favorite' })
  if (res?.ok) {
    markFavoriteSaved()
    setEstado('página guardada en Favoritos', 'ok')
  } else {
    setEstado(res?.error ?? 'no se pudo guardar', 'err')
  }
})
;(async () => {
  await loadTheme()
  setMode('citation')
  // loadConfig + loadTab primero: token listo para el estado de conexión y
  // pestaña activa lista para precargar la selección.
  await Promise.all([loadConfig(), loadTab()])
  await Promise.all([
    preloadSelection(),
    refreshConnStatus(),
    refreshQueue(),
    refreshRecent(),
    checkFavorite(),
  ])
  updateCount()
  // Foco en el textarea para pegar de inmediato (solo en modo cita).
  if (currentMode === 'citation') $('texto').focus()
})()
