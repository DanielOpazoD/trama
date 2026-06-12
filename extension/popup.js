/**
 * Popup de Trama - Recortes. Precarga la seleccion de la pestana activa
 * (solo al abrirse: gesto explicito del usuario), muestra la fuente
 * (favicon + dominio), deja anotar, y delega el guardado al service
 * worker (un solo camino al backend, con cola offline). La pestana
 * "conexion" guarda token y servidor, y permite probar la conexion.
 */

const $ = (id) => document.getElementById(id)

let currentTab = null

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

async function showSource() {
  currentTab = await activeTab()
  if (!currentTab?.url) return
  const host = hostOf(currentTab.url)
  if (!host) return
  $('srcTitle').textContent = currentTab.title || host
  $('srcHost').textContent = host
  // Favicon via el servicio de Google (no requiere permisos de host).
  $('favicon').src = `https://www.google.com/s2/favicons?domain=${host}&sz=32`
  $('source').hidden = false
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

/** Tema del popup: auto (sigue al sistema) o forzado papel/noche/vela —
 *  los tres temas de la casa. Persistido en chrome.storage.local. */
function applyTheme(theme) {
  if (!theme || theme === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  for (const btn of document.querySelectorAll('.theme-opt')) {
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

$('texto').addEventListener('input', updateCount)

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
  $('connDot').className = 'conn-dot'
  const res = await chrome.runtime.sendMessage({ kind: 'trama-test' })
  $('probar').disabled = false
  if (res?.ok) {
    $('connDot').className = 'conn-dot ok'
    setEstado('conexion verificada', 'ok')
  } else {
    $('connDot').className = 'conn-dot err'
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
  $('openTray').href = `${baseUrl.replace(/\/+$/, '')}/?view=recortes`
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

$('guardar').addEventListener('click', async () => {
  const text = $('texto').value.trim()
  if (!text) return
  $('guardar').disabled = true
  setEstado('prensando el recorte...')
  const tab = currentTab ?? (await activeTab())
  const result = await chrome.runtime.sendMessage({
    kind: 'trama-save',
    text,
    note: $('nota').value.trim(),
    tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null,
  })
  if (result?.ok && !result.queued) {
    setEstado('guardado en Recortes', 'ok')
    $('texto').value = ''
    $('nota').value = ''
    updateCount()
    refreshRecent()
  } else if (result?.queued) {
    setEstado('sin señal — lo guardo y lo llevo después', 'ok')
    $('texto').value = ''
    $('nota').value = ''
    updateCount()
    refreshQueue()
  } else {
    setEstado(result?.error ?? 'no se pudo guardar', 'err')
    $('guardar').disabled = false
    if (/token/i.test($('estado').textContent)) $('config').open = true
  }
})
;(async () => {
  await loadTheme()
  await showSource()
  await Promise.all([preloadSelection(), loadConfig(), refreshQueue(), refreshRecent()])
  updateCount()
})()
