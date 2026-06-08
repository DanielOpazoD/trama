/**
 * Persistencia del borrador del editor de PDF en IndexedDB (browser-only, sin
 * backend). Guarda el `PdfDoc` completo —incluye los `File` de los sources, que
 * IndexedDB clona de forma nativa— bajo una clave POR USUARIO, así el trabajo
 * sobrevive recargas/navegación. Todo es best-effort (try/catch): si IndexedDB
 * no está disponible (modo privado, cuota), el editor sigue funcionando sin
 * autoguardado. Excluido del coverage: API de navegador, se verifica en el navegador.
 */
import { isPdfTemplate, type ImageAsset, type PdfDoc } from './model'

const DB_NAME = 'trama-pdf-studio'
const STORE = 'drafts'
const SAVED_STORE = 'saved'
// Versión del ESQUEMA de IndexedDB (sube al agregar stores). Distinta del formato
// del record del borrador (`DATA_VERSION`), para no invalidar borradores viejos.
const DB_VERSION = 2
const DATA_VERSION = 1

type DraftRecord = {
  doc: PdfDoc
  /** Biblioteca de imágenes del workspace (compat: borradores viejos no la tienen). */
  library?: ImageAsset[]
  savedAt: number
  v: number
}

export type Draft = { doc: PdfDoc; library: ImageAsset[] }

/** Una creación GUARDADA: snapshot con nombre del documento, que perdura aparte del
 *  borrador de trabajo (se puede re-abrir para editar, descargar/imprimir, borrar). */
export type SavedDocKind = 'creation' | 'template' | 'filled-template'
export type SavedDoc = {
  id: string
  name: string
  doc: PdfDoc
  savedAt: number
  kind?: SavedDocKind
}
type SavedRecord = SavedDoc & { userKey: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(SAVED_STORE)) db.createObjectStore(SAVED_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Autoguarda el documento + la biblioteca del usuario. Best-effort. */
export async function saveDraft(
  userKey: string,
  doc: PdfDoc,
  library: ImageAsset[],
): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const rec: DraftRecord = { doc, library, savedAt: Date.now(), v: DATA_VERSION }
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

/** Devuelve el borrador (documento + biblioteca) del usuario, o null si no hay / falla. */
export async function loadDraft(userKey: string): Promise<Draft | null> {
  try {
    const db = await openDb()
    const rec = await new Promise<DraftRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(userKey)
      r.onsuccess = () => resolve(r.result as DraftRecord | undefined)
      r.onerror = () => reject(r.error)
    })
    db.close()
    if (!rec || rec.v !== DATA_VERSION) return null
    return { doc: rec.doc, library: rec.library ?? [] }
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

// ── Creaciones guardadas (lista que perdura, aparte del borrador) ───────────
// Cada record va en el store `saved` bajo la clave `${userKey}:${id}` y lleva el
// `userKey` adentro para poder listar las del usuario (browser compartido).

/** Lista las creaciones guardadas del usuario (más nuevas primero). Best-effort. */
export async function listSavedDocs(userKey: string): Promise<SavedDoc[]> {
  try {
    const db = await openDb()
    const recs = await new Promise<SavedRecord[]>((resolve, reject) => {
      const tx = db.transaction(SAVED_STORE, 'readonly')
      const r = tx.objectStore(SAVED_STORE).getAll()
      r.onsuccess = () => resolve((r.result as SavedRecord[]) ?? [])
      r.onerror = () => reject(r.error)
    })
    db.close()
    return recs
      .filter((r) => r.userKey === userKey)
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(({ userKey: _u, ...s }) => normalizeSavedDocKind(s))
  } catch {
    return []
  }
}

/** Guarda (o actualiza) una creación con nombre. Best-effort. */
export async function putSavedDoc(userKey: string, saved: SavedDoc): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVED_STORE, 'readwrite')
      const rec: SavedRecord = { ...saved, userKey }
      tx.objectStore(SAVED_STORE).put(rec, `${userKey}:${saved.id}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch {
    // best-effort: la creación no se persiste, pero el editor sigue.
  }
}

/** Borra una creación guardada de la lista. Best-effort. */
export async function deleteSavedDoc(userKey: string, id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVED_STORE, 'readwrite')
      tx.objectStore(SAVED_STORE).delete(`${userKey}:${id}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // no-op
  }
}

export function normalizeSavedDocKind(saved: SavedDoc): SavedDoc {
  return saved.kind ? saved : { ...saved, kind: inferSavedDocKind(saved.doc) }
}

export function isSavedTemplate(saved: SavedDoc): boolean {
  return normalizeSavedDocKind(saved).kind === 'template'
}

export function isSavedFilledTemplate(saved: SavedDoc): boolean {
  return normalizeSavedDocKind(saved).kind === 'filled-template'
}

function inferSavedDocKind(doc: PdfDoc): SavedDocKind {
  return isPdfTemplate(doc) ? 'template' : 'creation'
}
