import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  initHistory,
  pushHistory,
  type History,
} from '../../../../lib/pdfStudio/model/history'
import {
  clearPdfFormFieldValues,
  normalizeDoc,
  reseedIds,
  type ImageAsset,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import {
  deleteSavedDoc,
  deleteSavedFolder,
  listSavedFolders,
  listSavedDocs,
  putSavedFolder,
  loadDraft,
  putSavedDoc,
  saveDraft,
  type SavedDoc,
  type SavedFolder,
  type SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import { useCurrentClientUserId } from '../../../../lib/clientIdentity'
import { downloadBlob } from '../../../../lib/downloadBlob'
import { useToast } from '../../../../state'
import {
  createAutosaveFailedState,
  createAutosaveRestoredState,
  createAutosaveSavingState,
  type PdfStudioAutosaveState,
} from './pdfStudioAutosaveState'
import { useWorkspaceTemplateCloud } from './useWorkspaceTemplateCloud'

export function usePdfStudioWorkspace({
  clearSelection,
  doc,
  setHistory,
  syncTemplatesToCloud = false,
  uploadSavedPdf,
}: {
  clearSelection: () => void
  doc: PdfDoc
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
  /** Sincroniza plantillas limpias con el servidor (mundo Planillas). */
  syncTemplatesToCloud?: boolean
  uploadSavedPdf?: (saved: SavedDoc) => Promise<NonNullable<SavedDoc['serverPdf']>>
}) {
  const toast = useToast()
  const userKey = useCurrentClientUserId() ?? 'anon'
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState<SavedDoc[]>([])
  const [folders, setFolders] = useState<SavedFolder[]>([])
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [autosaveState, setAutosaveState] = useState<PdfStudioAutosaveState>({
    kind: 'idle',
    pages: 0,
  })
  const toastRef = useRef(toast)
  const draftSanitizerRef = useRef<(draft: PdfDoc) => PdfDoc>((draft) => draft)
  const autosaveRunRef = useRef(0)
  toastRef.current = toast
  const templateCloud = useWorkspaceTemplateCloud({
    enabled: syncTemplatesToCloud,
    setSaved,
    userKey,
  })
  // Vía ref: el efecto de carga corre una sola vez por usuario.
  const templateCloudRef = useRef(templateCloud)
  templateCloudRef.current = templateCloud

  useEffect(() => {
    let alive = true
    void loadDraft(userKey).then((draft) => {
      if (!alive) return
      if (draft && draft.doc.pages.length > 0) {
        const restored = normalizeDoc(draft.doc)
        reseedIds(restored)
        setHistory(initHistory(restored))
        setAutosaveState(createAutosaveRestoredState(restored.pages.length))
        toastRef.current.show({
          message: 'Borrador del editor restaurado.',
          tone: 'success',
        })
      } else {
        setAutosaveState({ kind: 'idle', pages: 0 })
      }
      setLoaded(true)
    })
    void listSavedDocs(userKey).then((list) => {
      if (!alive) return
      setSaved(list)
      if (list.length > 0) setPanelCollapsed(false)
      templateCloudRef.current.syncTemplates(list)
    })
    void listSavedFolders(userKey).then((list) => {
      if (!alive) return
      setFolders(list)
      if (list.length > 0) setPanelCollapsed(false)
    })
    return () => {
      alive = false
    }
  }, [setHistory, userKey])

  const persistDraftSnapshot = useCallback(
    async (snapshot: PdfDoc) => {
      const runId = ++autosaveRunRef.current
      const sanitized = draftSanitizerRef.current(snapshot)
      if (sanitized.pages.length === 0) {
        if (autosaveRunRef.current === runId) {
          setAutosaveState({ kind: 'idle', pages: 0 })
        }
        return
      }
      setAutosaveState(createAutosaveSavingState(sanitized.pages.length))
      const savedOk = await saveDraft(userKey, sanitized, [])
      if (autosaveRunRef.current !== runId) return
      setAutosaveState(
        savedOk === false
          ? createAutosaveFailedState(sanitized.pages.length)
          : { kind: 'saved', pages: sanitized.pages.length, savedAt: Date.now() },
      )
    },
    [userKey],
  )

  useEffect(() => {
    if (!loaded) return
    const t = window.setTimeout(() => void persistDraftSnapshot(doc), 600)
    return () => window.clearTimeout(t)
  }, [doc, loaded, persistDraftSnapshot])

  /** Protege un snapshot puntual (ediciones vivas del editor modal o reset al
   *  cancelar), pasando por el mismo sanitizador y estados que el autosave. */
  function autosaveSnapshot(snapshot: PdfDoc) {
    if (!loaded) return
    void persistDraftSnapshot(snapshot)
  }

  function setDraftSanitizer(sanitize: (draft: PdfDoc) => PdfDoc) {
    draftSanitizerRef.current = sanitize
  }

  function addAssets(_assets: ImageAsset[]) {
    void _assets
  }

  async function syncSavedPdf(savedDoc: SavedDoc) {
    if (!uploadSavedPdf) return
    try {
      const serverPdf = await uploadSavedPdf(savedDoc)
      const synced = { ...savedDoc, serverPdf }
      setSaved((list) => list.map((item) => (item.id === savedDoc.id ? synced : item)))
      await putSavedDoc(userKey, synced)
    } catch {
      toastRef.current.show({
        message:
          'PDF guardado localmente. Se subirá al servidor cuando la conexión esté disponible.',
        tone: 'default',
      })
    }
  }

  function saveCreation(name: string) {
    const s: SavedDoc = {
      id: crypto.randomUUID(),
      name,
      doc,
      savedAt: Date.now(),
      kind: 'creation',
    }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    void syncSavedPdf(s)
    toast.show({ message: `Guardado "${name}".`, tone: 'success' })
  }

  function saveTemplate(name: string) {
    const template = clearPdfFormFieldValues(doc)
    const s: SavedDoc = {
      id: crypto.randomUUID(),
      name,
      doc: template,
      savedAt: Date.now(),
      kind: 'template',
    }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    void syncSavedPdf(s)
    templateCloud.pushTemplate(s)
    toast.show({ message: `Planilla "${name}" guardada.`, tone: 'success' })
  }

  function saveFilledCopy(name: string, filledDoc: PdfDoc) {
    const s: SavedDoc = {
      id: crypto.randomUUID(),
      name: uniqueFilledCopyName(name, saved),
      doc: normalizeDoc(filledDoc),
      savedAt: Date.now(),
      kind: 'filled-template',
    }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    void syncSavedPdf(s)
    toast.show({ message: `Copia con datos "${s.name}" guardada.`, tone: 'success' })
  }

  function duplicateSaved(s: SavedDoc): SavedDoc {
    const name = uniqueCopyName(s.name, saved)
    const copy: SavedDoc = {
      id: crypto.randomUUID(),
      name,
      doc: normalizeDoc(clearPdfFormFieldValues(s.doc)),
      savedAt: Date.now(),
      kind: 'template',
      // La copia hereda los metadatos pero nace como borrador: es una plantilla
      // derivada que todavía no está lista para usar.
      ...(s.description ? { description: s.description } : null),
      ...(s.tags?.length ? { tags: [...s.tags] } : null),
      status: 'draft',
    }
    setSaved((list) => [copy, ...list])
    void putSavedDoc(userKey, copy)
    templateCloud.pushTemplate(copy)
    toast.show({ message: `Planilla duplicada como "${name}".`, tone: 'success' })
    return copy
  }

  function exportTemplatePackage(s: SavedDoc, format: 'json' | 'csv') {
    const fileName = `${slugFileName(s.name || 'planilla')}-variables.${format}`
    const payload =
      format === 'json'
        ? templatePackageJson(s)
        : templatePackageCsv(s.doc.formFields ?? [])
    const type = format === 'json' ? 'application/json' : 'text/csv'
    downloadBlob(new Blob([payload], { type }), fileName)
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
      const next = list.map((s) =>
        s.id === id ? { ...s, name, savedAt: Date.now() } : s,
      )
      const target = next.find((s) => s.id === id)
      if (target) {
        void putSavedDoc(userKey, target)
        templateCloud.pushTemplate(target)
      }
      return next
    })
  }

  /** Actualiza los metadatos de biblioteca (descripción, tags, estado). */
  function updateSavedMeta(
    id: string,
    meta: Partial<Pick<SavedDoc, 'description' | 'tags' | 'status'>>,
  ) {
    setSaved((list) => {
      const next = list.map((s) =>
        s.id === id ? { ...s, ...meta, savedAt: Date.now() } : s,
      )
      const target = next.find((s) => s.id === id)
      if (target) {
        void putSavedDoc(userKey, target)
        templateCloud.pushTemplate(target)
      }
      return next
    })
  }

  function createFolder(input: { name: string; color: SavedFolderColor }) {
    const folder: SavedFolder = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      color: input.color,
      createdAt: Date.now(),
    }
    if (!folder.name) return
    setFolders((list) => [...list, folder])
    void putSavedFolder(userKey, folder)
    toast.show({ message: `Carpeta "${folder.name}" creada.`, tone: 'success' })
  }

  function renameFolder(id: string, name: string) {
    const cleanName = name.trim()
    if (!cleanName) return
    setFolders((list) => {
      const next = list.map((folder) =>
        folder.id === id ? { ...folder, name: cleanName } : folder,
      )
      const target = next.find((folder) => folder.id === id)
      if (target) void putSavedFolder(userKey, target)
      return next
    })
  }

  function updateFolderColor(id: string, color: SavedFolderColor) {
    setFolders((list) => {
      const next = list.map((folder) =>
        folder.id === id ? { ...folder, color } : folder,
      )
      const target = next.find((folder) => folder.id === id)
      if (target) void putSavedFolder(userKey, target)
      return next
    })
  }

  function removeFolder(id: string) {
    setFolders((list) => list.filter((folder) => folder.id !== id))
    setSaved((list) => {
      const next = list.map((s) => (s.folderId === id ? { ...s, folderId: null } : s))
      for (const item of next) {
        if (
          item.folderId === null &&
          list.find((s) => s.id === item.id)?.folderId === id
        ) {
          void putSavedDoc(userKey, item)
        }
      }
      return next
    })
    void deleteSavedFolder(userKey, id)
  }

  function moveSavedToFolder(id: string, folderId: string | null) {
    setSaved((list) => {
      const next = list.map((s) => (s.id === id ? { ...s, folderId } : s))
      const target = next.find((s) => s.id === id)
      if (target) void putSavedDoc(userKey, target)
      return next
    })
  }

  function removeSaved(id: string) {
    const target = saved.find((s) => s.id === id)
    setSaved((list) => list.filter((s) => s.id !== id))
    void deleteSavedDoc(userKey, id)
    if (target) templateCloud.removeRemoteTemplate(target)
  }

  return {
    addAssets,
    autosaveSnapshot,
    autosaveState,
    duplicateSaved,
    exportTemplatePackage,
    createFolder,
    renameFolder,
    updateFolderColor,
    removeFolder,
    folders,
    openSaved,
    openTemplate,
    panelCollapsed,
    removeSaved,
    renameSaved,
    moveSavedToFolder,
    saveCreation,
    saveFilledCopy,
    saveTemplate,
    saved,
    setPanelCollapsed,
    setDraftSanitizer,
    templateCloud,
    updateSavedMeta,
    userKey,
  }
}

function uniqueCopyName(name: string, saved: SavedDoc[]): string {
  const base = `${name.trim() || 'Planilla'} copia`
  const names = new Set(saved.map((s) => s.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

function uniqueFilledCopyName(name: string, saved: SavedDoc[]): string {
  const base = `${name.trim() || 'Planilla'} datos`
  const names = new Set(saved.map((s) => s.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

function slugFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'planilla'
}

function templatePackageJson(s: SavedDoc): string {
  return JSON.stringify(
    {
      version: 1,
      name: s.name,
      savedAt: s.savedAt,
      pages: s.doc.pages.map((page, index) => ({ id: page.id, index })),
      fields: templatePackageFields(s.doc),
    },
    null,
    2,
  )
}

function templatePackageFields(doc: PdfDoc) {
  const pageIndexById = new Map(doc.pages.map((page, index) => [page.id, index + 1]))
  return (doc.formFields ?? []).map((field) => ({
    name: field.name,
    type: field.fieldKind,
    page: pageIndexById.get(field.pageId) ?? null,
    required: Boolean(field.required),
    readOnly: Boolean(field.readOnly),
    xRatio: field.xRatio,
    yRatio: field.yRatio,
    wRatio: field.wRatio,
    hRatio: field.hRatio,
    options: field.options ?? [],
  }))
}

function templatePackageCsv(fields: PdfFormFieldDraft[]): string {
  const rows = [
    [
      'name',
      'type',
      'pageId',
      'required',
      'readOnly',
      'xRatio',
      'yRatio',
      'wRatio',
      'hRatio',
    ],
    ...fields.map((field) => [
      field.name,
      field.fieldKind,
      field.pageId,
      String(Boolean(field.required)),
      String(Boolean(field.readOnly)),
      String(field.xRatio),
      String(field.yRatio),
      String(field.wRatio),
      String(field.hRatio),
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
