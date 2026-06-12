// @ts-check
/**
 * Trama — Recortes · service worker (Manifest V3), punto de entrada.
 *
 * Capturar desde la web → bandeja de Recortes. Nada de scraping pasivo: solo
 * se lee/inyecta la pestaña activa cuando el usuario actúa (clic derecho,
 * atajo o popup). Este archivo solo cablea los eventos de Chrome (menús,
 * atajo, mensajes, alarms); la lógica vive en ./lib/*. Robustez (cola offline
 * que sobrevive a que Chrome mate el SW) en ./lib/queue.js.
 */
import { ALARM_FLUSH, flashBadge, flushQueue } from './lib/queue.js'
import { saveRecorte } from './lib/recorte.js'
import {
  activeTab,
  flashHighlight,
  getRecent,
  saveArticle,
  saveHtml,
  saveSelection,
  showPageToast,
  testConnection,
} from './lib/capture.js'
import {
  addToCollection,
  clearCollection,
  getCollection,
  saveCollection,
} from './lib/collection.js'
import { cropAndSaveRegion, startRegionCapture } from './lib/region.js'

const MENU_ID = 'trama-save-selection'
const MENU_COLLECT = 'trama-collect'
const MENU_IMAGE = 'trama-save-image'
const MENU_PAGE = 'trama-save-page'
const MENU_HTML = 'trama-save-html'

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
    chrome.contextMenus.create({
      id: MENU_HTML,
      title: 'Guardar página como Markdown en Trama',
      contexts: ['page'],
    })
  })
})

// Al despertar el SW, si quedaron capturas en cola, intentar vaciarla.
chrome.runtime.onStartup.addListener(() => void flushQueue())

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_FLUSH) void flushQueue()
})

/**
 * Mensaje del toast on-page según el resultado de un guardado. Solo se usa en
 * los flujos con el popup CERRADO (clic derecho, atajo, región); los del popup
 * muestran su propio estado.
 * @param {{ ok: boolean, queued?: boolean, error?: string }} r
 */
function toastForResult(r) {
  if (r.ok && r.queued) return { msg: 'Sin conexión — guardado en cola', tone: 'ok' }
  if (r.ok) return { msg: 'Guardado en Recortes', tone: 'ok' }
  return { msg: r.error || 'No se pudo guardar', tone: 'err' }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id
  if (info.menuItemId === MENU_ID && info.selectionText) {
    if (tabId != null) void flashHighlight(tabId)
    const r = await saveSelection(info.selectionText, tab)
    const t = toastForResult(r)
    void showPageToast(tabId, t.msg, t.tone)
  } else if (info.menuItemId === MENU_COLLECT && info.selectionText) {
    if (tabId != null) void flashHighlight(tabId)
    const { count } = await addToCollection(info.selectionText, tab)
    void showPageToast(tabId, `Sumado a la colección · ${count}`, 'ok')
  } else if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
    // El recorte exige texto; usamos el título de la página como pie.
    const r = await saveRecorte({
      text: tab?.title || 'Imagen guardada',
      tab,
      imageUrl: info.srcUrl,
      captureMode: 'image',
    })
    const t = toastForResult(r)
    void showPageToast(tabId, t.msg, t.tone)
  } else if (info.menuItemId === MENU_PAGE) {
    const r = await saveArticle(tab)
    flashBadge(r.ok)
    const t = toastForResult(r)
    void showPageToast(tabId, t.msg, t.tone)
  } else if (info.menuItemId === MENU_HTML) {
    const r = await saveHtml(tab)
    flashBadge(r.ok)
    const t = toastForResult(r)
    void showPageToast(tabId, t.msg, t.tone)
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
      func: () => window.getSelection()?.toString() ?? '',
    })
    const text = res?.result ?? ''
    if (text.trim()) void flashHighlight(tab.id)
    const r = await saveSelection(text, tab)
    const t = toastForResult(r)
    void showPageToast(tab.id, t.msg, t.tone)
  } catch {
    flashBadge(false)
  }
})

// El popup delega acá: guardar, probar conexión y leer el estado de la cola.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind === 'trama-save') {
    saveRecorte(msg).then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-region-start') {
    activeTab().then((tab) => startRegionCapture(tab).then(sendResponse))
    return true
  }
  if (msg?.kind === 'trama-region-rect') {
    // Llega desde el overlay inyectado: sender.tab tiene id/url/title/windowId.
    // El popup ya está cerrado durante el arrastre → badge + toast + título.
    cropAndSaveRegion(msg.rect, msg.dpr, sender.tab).then((r) => {
      flashBadge(r.ok)
      if (!r.ok && r.error) chrome.action.setTitle({ title: `Trama · ${r.error}` })
      const t = toastForResult(r)
      void showPageToast(sender.tab?.id, t.msg, t.tone)
    })
    return false
  }
  if (msg?.kind === 'trama-test') {
    testConnection().then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-queue') {
    getQueueLen().then((pending) => sendResponse({ pending }))
    return true
  }
  if (msg?.kind === 'trama-recent') {
    getRecent().then(sendResponse)
    return true
  }
  if (msg?.kind === 'trama-article') {
    activeTab().then((tab) => saveArticle(tab, msg.note).then(sendResponse))
    return true
  }
  if (msg?.kind === 'trama-html') {
    activeTab().then((tab) => saveHtml(tab, msg.note).then(sendResponse))
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

/** Cantidad de capturas en cola (para el aviso del popup). */
async function getQueueLen() {
  const { tramaQueue } = await chrome.storage.local.get('tramaQueue')
  return Array.isArray(tramaQueue) ? tramaQueue.length : 0
}
