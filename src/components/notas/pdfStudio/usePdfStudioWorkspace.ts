import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { initHistory, pushHistory, type History } from '../../../lib/pdfStudio/history'
import {
  addImageSource,
  clearPdfFormFieldValues,
  normalizeDoc,
  reseedIds,
  type ImageAsset,
  type PdfDoc,
} from '../../../lib/pdfStudio/model'
import {
  deleteSavedDoc,
  listSavedDocs,
  loadDraft,
  putSavedDoc,
  saveDraft,
  type SavedDoc,
} from '../../../lib/pdfStudio/persistence'
import { useCurrentClientUserId } from '../../../lib/clientIdentity'
import { downloadBlob } from '../../../lib/downloadBlob'
import { useToast } from '../../../state'

export function usePdfStudioWorkspace({
  clearSelection,
  commit,
  doc,
  setHistory,
}: {
  clearSelection: () => void
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  doc: PdfDoc
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
}) {
  const toast = useToast()
  const userKey = useCurrentClientUserId() ?? 'anon'
  const [loaded, setLoaded] = useState(false)
  const [library, setLibrary] = useState<ImageAsset[]>([])
  const [saved, setSaved] = useState<SavedDoc[]>([])
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEffect(() => {
    let alive = true
    void loadDraft(userKey).then((draft) => {
      if (!alive) return
      if (draft && (draft.doc.pages.length > 0 || draft.library.length > 0)) {
        const restored = normalizeDoc(draft.doc)
        reseedIds(restored)
        setHistory(initHistory(restored))
        setLibrary(draft.library)
        if (draft.library.length > 0) setPanelCollapsed(false)
        toastRef.current.show({
          message: 'Borrador del editor restaurado.',
          tone: 'success',
        })
      }
      setLoaded(true)
    })
    void listSavedDocs(userKey).then((list) => {
      if (!alive) return
      setSaved(list)
      if (list.length > 0) setPanelCollapsed(false)
    })
    return () => {
      alive = false
    }
  }, [setHistory, userKey])

  useEffect(() => {
    if (!loaded) return
    const t = window.setTimeout(() => void saveDraft(userKey, doc, library), 600)
    return () => window.clearTimeout(t)
  }, [doc, library, loaded, userKey])

  function addAssets(assets: ImageAsset[]) {
    if (assets.length === 0) return
    setLibrary((lib) => [...lib, ...assets])
    setPanelCollapsed(false)
  }

  function addLibraryToDoc(asset: ImageAsset) {
    commit((d) => addImageSource(d, asset.file))
  }

  function removeFromLibrary(id: string) {
    setLibrary((lib) => lib.filter((a) => a.id !== id))
  }

  function downloadLibrary(asset: ImageAsset) {
    downloadBlob(asset.file, asset.file.name || 'imagen')
  }

  function saveCreation(name: string) {
    const s: SavedDoc = { id: crypto.randomUUID(), name, doc, savedAt: Date.now() }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    toast.show({ message: `Guardado "${name}".`, tone: 'success' })
  }

  function saveTemplate(name: string) {
    const template = clearPdfFormFieldValues(doc)
    const s: SavedDoc = {
      id: crypto.randomUUID(),
      name,
      doc: template,
      savedAt: Date.now(),
    }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    toast.show({ message: `Planilla "${name}" guardada.`, tone: 'success' })
  }

  function openSaved(s: SavedDoc) {
    const hadWork = doc.pages.length > 0
    const restored = normalizeDoc(s.doc)
    reseedIds(restored)
    setHistory((h) => pushHistory(h, restored))
    clearSelection()
    if (hadWork) {
      toast.show({
        message: `Abriste "${s.name}". El documento anterior queda en el historial (⌘Z).`,
        tone: 'default',
      })
    }
  }

  function openTemplate(s: SavedDoc) {
    const hadWork = doc.pages.length > 0
    const restored = normalizeDoc(clearPdfFormFieldValues(s.doc))
    reseedIds(restored)
    setHistory((h) => pushHistory(h, restored))
    clearSelection()
    toast.show({
      message: hadWork
        ? `Planilla "${s.name}" abierta para rellenar. El documento anterior queda en el historial.`
        : `Planilla "${s.name}" abierta para rellenar.`,
      tone: 'default',
    })
  }

  function renameSaved(id: string, name: string) {
    setSaved((list) => {
      const next = list.map((s) => (s.id === id ? { ...s, name } : s))
      const target = next.find((s) => s.id === id)
      if (target) void putSavedDoc(userKey, target)
      return next
    })
  }

  function removeSaved(id: string) {
    setSaved((list) => list.filter((s) => s.id !== id))
    void deleteSavedDoc(userKey, id)
  }

  return {
    addAssets,
    addLibraryToDoc,
    downloadLibrary,
    library,
    openSaved,
    openTemplate,
    panelCollapsed,
    removeFromLibrary,
    removeSaved,
    renameSaved,
    saveCreation,
    saveTemplate,
    saved,
    setPanelCollapsed,
    userKey,
  }
}
