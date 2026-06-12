// @ts-check
/** Colección: varios resaltados se juntan en un solo recorte. */
import { refreshBadge } from './queue.js'
import { saveRecorte } from './recorte.js'

const COLLECTION_KEY = 'tramaCollection'

/** @returns {Promise<{ sourceUrl: string|null, sourceTitle: string|null, fragments: string[] } | null>} */
export async function getCollection() {
  const { [COLLECTION_KEY]: c } = await chrome.storage.local.get(COLLECTION_KEY)
  return c && Array.isArray(c.fragments) ? c : null
}

/**
 * @param {string} text
 * @param {{ url?: string|null, title?: string|null } | null} [tab]
 */
export async function addToCollection(text, tab) {
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

export async function clearCollection() {
  await chrome.storage.local.remove(COLLECTION_KEY)
  refreshBadge()
}

/** Junta los fragmentos en un solo recorte (cada uno como párrafo). */
export async function saveCollection() {
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
