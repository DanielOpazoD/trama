// @ts-check
/** Orquestación de las capturas de texto (selección, artículo) + utilidades. */
import { getConfig } from './config.js'
import { saveRecorte } from './recorte.js'
import {
  pageExtractHTML,
  pageExtractStructured,
  pageFlashHighlight,
  pageSelectionLink,
  pageToast,
} from './inject.js'

/** Resuelve la pestaña activa (para el atajo de teclado y el menú). */
export async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

/** Dispara el barrido dorado en la pestaña (best-effort, páginas normales). */
export async function flashHighlight(tabId) {
  if (tabId == null) return
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: pageFlashHighlight })
  } catch {
    /* página restringida (chrome://, store): sin resaltado, el badge confirma */
  }
}

/**
 * Toast on-page de confirmación cuando el popup ya está cerrado. Best-effort:
 * en páginas restringidas el executeScript falla y queda solo el badge.
 * @param {number|undefined|null} tabId
 * @param {string} message
 * @param {string} [tone]
 */
export async function showPageToast(tabId, message, tone) {
  if (tabId == null) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: pageToast,
      args: [message, tone ?? 'ok'],
    })
  } catch {
    /* página restringida: el badge ya confirmó */
  }
}

/** Lee el subgrafo estructurado de la pestaña (best-effort). */
export async function tryStructured(tab) {
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

/** Lee el href del enlace que envuelve/contiene la selección (best-effort). */
async function trySelectionLink(tab) {
  if (tab?.id == null) return null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageSelectionLink,
    })
    return res?.result || null
  } catch {
    return null
  }
}

/**
 * Guarda una selección. Prioriza la captura estructurada (X/Reddit). Si no, y
 * la selección está sobre un enlace (p.ej. un titular que linkea al artículo),
 * usa ESE enlace como fuente — así el recorte apunta a la noticia subyacente,
 * no a la portada donde estabas.
 */
export async function saveSelection(rawText, tab) {
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
  const link = await trySelectionLink(tab)
  if (link) {
    return saveRecorte({
      text: rawText,
      tab,
      override: { sourceUrl: link, sourceTitle: tab?.title ?? null, sourceAuthor: null },
    })
  }
  return saveRecorte({ text: rawText, tab })
}

/**
 * Guarda el artículo principal de la página conservando su ESTRUCTURA como
 * Markdown (encabezados, listas, citas, enlaces, énfasis) — no texto plano.
 */
export async function saveArticle(tab, note) {
  if (tab?.id == null) return { ok: false, error: 'Sin pestaña.' }
  let doc = null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractHTML,
    })
    doc = res?.result || null
  } catch {
    /* página restringida */
  }
  if (!doc) return { ok: false, error: 'No se encontró un artículo en esta página.' }
  return saveRecorte({
    text: doc.text,
    tab,
    note,
    captureMode: 'article',
    override: {
      sourceUrl: tab.url,
      sourceTitle: doc.title,
      sourceAuthor: doc.byline,
    },
  })
}

/** Trae los últimos recortes pendientes para la mini-bandeja del popup. */
export async function getRecent() {
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
export async function testConnection() {
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
