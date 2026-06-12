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

$('guardar').addEventListener('click', async () => {
  const text = $('texto').value.trim()
  if (!text) return
  $('guardar').disabled = true
  setEstado('guardando...')
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
  } else if (result?.queued) {
    setEstado('sin conexion - en cola, se reintenta', 'ok')
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
  await showSource()
  await Promise.all([preloadSelection(), loadConfig(), refreshQueue()])
  updateCount()
})()
