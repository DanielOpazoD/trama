import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { initHistory, type History } from '../../../lib/pdfStudio/history'
import {
  normalizeDoc,
  reseedIds,
  type ImageAsset,
  type PdfDoc,
} from '../../../lib/pdfStudio/model'
import {
  listSavedDocs,
  loadDraft,
  saveDraft,
  type SavedDoc,
} from '../../../lib/pdfStudio/persistence'
import { useCurrentClientUserId } from '../../../lib/clientIdentity'
import { useToast } from '../../../state'

export function usePdfStudioWorkspace({
  doc,
  setHistory,
}: {
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

  return {
    library,
    panelCollapsed,
    saved,
    setLibrary,
    setPanelCollapsed,
    setSaved,
    userKey,
  }
}
