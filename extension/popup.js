/**
 * Popup de Trama — Recortes. Precarga la selección de la pestaña activa
 * (solo al abrirse: gesto explícito del usuario), deja anotar, y delega
 * el guardado al service worker (un solo camino al backend). La pestaña
 * «conexión» guarda token y servidor en chrome.storage.local.
 */

const $ = (id) => document.getElementById(id)

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

async function preloadSelection() {
  const tab = await activeTab()
  if (!tab?.id) return
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    })
    if (result?.result) $('texto').value = result.result.trim()
  } catch {
    /* páginas restringidas: el usuario puede pegar a mano */
  }
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

$('guardarConfig').addEventListener('click', async () => {
  await chrome.storage.local.set({
    tramaToken: $('token').value.trim(),
    tramaBaseUrl: $('baseUrl').value.trim() || 'https://tramahub.app',
  })
  $('estado').textContent = 'conexión guardada'
  $('config').open = false
})

$('guardar').addEventListener('click', async () => {
  const text = $('texto').value.trim()
  if (!text) {
    $('estado').textContent = 'no hay texto que guardar'
    return
  }
  $('guardar').disabled = true
  $('estado').textContent = 'guardando…'
  const tab = await activeTab()
  const result = await chrome.runtime.sendMessage({
    kind: 'trama-save',
    text,
    note: $('nota').value.trim(),
    tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null,
  })
  if (result?.ok) {
    $('estado').textContent = 'guardado en Recortes ✓'
    $('texto').value = ''
    $('nota').value = ''
  } else {
    $('estado').textContent = result?.error ?? 'no se pudo guardar'
    if (/token/i.test($('estado').textContent)) $('config').open = true
  }
  $('guardar').disabled = false
})

preloadSelection()
loadConfig()
