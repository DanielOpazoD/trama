/**
 * Trama — Recortes · service worker (Manifest V3).
 *
 * Un solo gesto: clic derecho sobre texto seleccionado → «Guardar selección
 * en Trama». El recorte viaja a POST /api/recortes con el token personal
 * (trama_pat_*) guardado en chrome.storage.local. Nada de scraping pasivo:
 * solo se lee la pestaña activa cuando el usuario actúa.
 */

const MENU_ID = 'trama-save-selection'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Guardar selección en Trama',
    contexts: ['selection'],
  })
})

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

async function saveRecorte({ text, tab, note }) {
  const { token, baseUrl } = await getConfig()
  if (!token) {
    return { ok: false, error: 'Falta el token. Ábrelo desde el icono de Trama.' }
  }
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
  try {
    const res = await fetch(`${baseUrl}/api/recortes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        sourceUrl: tab?.url ?? null,
        sourceTitle: meta.title ?? tab?.title ?? null,
        sourceAuthor: meta.author,
        note: note || null,
        capturedAt: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const detail = res.status === 401 ? 'token inválido o revocado' : `HTTP ${res.status}`
      return { ok: false, error: `No se pudo guardar (${detail}).` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Sin conexión con Trama.' }
  }
}

function notify(ok, message) {
  // Feedback mínimo sin permiso "notifications": badge en el icono.
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#4a6b4f' : '#8a3b2e' })
  if (message) chrome.action.setTitle({ title: message })
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' })
    chrome.action.setTitle({ title: 'Guardar en Trama' })
  }, 4000)
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return
  const result = await saveRecorte({ text: info.selectionText.trim(), tab })
  notify(result.ok, result.ok ? 'Recorte guardado en Trama' : result.error)
})

// El popup delega el guardado acá (un solo camino al backend).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind !== 'trama-save') return undefined
  saveRecorte(msg).then(sendResponse)
  return true // respuesta async
})
