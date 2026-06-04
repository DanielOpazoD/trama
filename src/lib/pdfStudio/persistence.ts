/**
 * Persistencia del borrador del editor de PDF en IndexedDB (browser-only, sin
 * backend). Guarda el `PdfDoc` completo —incluye los `File` de los sources, que
 * IndexedDB clona de forma nativa— bajo una clave POR USUARIO, así el trabajo
 * sobrevive recargas/navegación. Todo es best-effort (try/catch): si IndexedDB
 * no está disponible (modo privado, cuota), el editor sigue funcionando sin
 * autoguardado. Excluido del coverage: API de navegador, se verifica en el navegador.
 */
import type { PdfDoc } from './model'

const DB_NAME = 'trama-pdf-studio'
const STORE = 'drafts'
const VERSION = 1

type DraftRecord = { doc: PdfDoc; savedAt: number; v: number }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Autoguarda el documento de trabajo del usuario. Best-effort. */
export async function saveDraft(userKey: string, doc: PdfDoc): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const rec: DraftRecord = { doc, savedAt: Date.now(), v: VERSION }
      tx.objectStore(STORE).put(rec, userKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch {
    // best-effort: el editor sigue sin autoguardado.
  }
}

/** Devuelve el borrador guardado del usuario, o null si no hay / falla. */
export async function loadDraft(userKey: string): Promise<PdfDoc | null> {
  try {
    const db = await openDb()
    const rec = await new Promise<DraftRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(userKey)
      r.onsuccess = () => resolve(r.result as DraftRecord | undefined)
      r.onerror = () => reject(r.error)
    })
    db.close()
    if (!rec || rec.v !== VERSION) return null
    return rec.doc
  } catch {
    return null
  }
}

/** Borra el borrador del usuario. */
export async function clearDraft(userKey: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(userKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // no-op
  }
}
