import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addImageSource,
  addPdfSource,
  applyEdits,
  canExport,
  deletePages,
  duplicatePages,
  emptyDoc,
  insertPages,
  movePage,
  movePageByDelta,
  normalizeDoc,
  pageThumbKey,
  reseedIds,
  rotatePages,
  setDocSettings,
  subsetDoc,
  type Annotation,
  type DocSettings,
  type ImageAsset,
  type PdfDoc,
} from '../../../lib/pdfStudio/model'
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/history'
import {
  disposePdfStudio,
  forgetThumb,
  getPdfPageCount,
} from '../../../lib/pdfStudio/pdfRender'
import { assemble } from '../../../lib/pdfStudio/assemble'
import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import { openBlankPdfTab, showPdfInTab } from '../../../lib/pdfStudio/printPdf'
import {
  clearDraft,
  deleteSavedDoc,
  listSavedDocs,
  loadDraft,
  putSavedDoc,
  saveDraft,
  type SavedDoc,
} from '../../../lib/pdfStudio/persistence'
import { downloadBlob } from '../../../lib/downloadBlob'
import { useCurrentClientUserId } from '../../../lib/clientIdentity'
import { OverflowMenu, OverflowMenuItem } from '../../OverflowMenu'
import { BulkBar } from './BulkBar'
import { WorkspacePanel } from './WorkspacePanel'
import { PageGrid } from './PageGrid'
import { PdfTextEditor } from './PdfTextEditor'
import {
  exportPdfName,
  isPdfFile,
  isStudioImageFile,
  shouldDownloadPdfDirectly,
} from './pdfStudioFileUtils'
import { describePdfExportError, pdfExportProgressLabel } from './pdfExportFeedback'
import { usePageSelection } from './usePageSelection'
import {
  DownloadIcon,
  FileIcon,
  FilePdfIcon,
  PrinterIcon,
  RedoIcon,
  UndoIcon,
  UploadIcon,
} from '../../Icons'
import { useToast } from '../../../state'

const ACCENT = 'var(--accent-sage)'
const ACCEPT = 'application/pdf,image/*'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Imprenta (submódulo del mundo Notas), 100% client-side: combina PDFs e imágenes
 * en un solo documento, a nivel de PÁGINA (estilo iLovePDF). Cada PDF se expande en
 * sus páginas y cada imagen es una página; todas se ven como miniaturas
 * reordenables (arrastrando o con ◄ ► del teclado) y borrables, y se exportan al
 * visor del navegador para imprimir o guardar como PDF. El modelo es puro y
 * testeado; el render (pdf.js) y el ensamblado (pdf-lib) son perezosos y viven en
 * archivos aparte.
 */
export function PdfStudioView({ topBar }: { topBar?: ReactNode }) {
  const isMac = isMacLike()
  const toast = useToast()
  // El documento vive detrás de un historial (undo/redo). `doc` = presente.
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const [busy, setBusy] = useState(false) // importando
  const [saving, setSaving] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [textPage, setTextPage] = useState<number | null>(null)
  // Contenedor scrolleable del área de trabajo: raíz del IntersectionObserver del
  // lazy-load de las miniaturas (el app-shell scrollea acá adentro, no el viewport).
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  // Portapapeles INTERNO de páginas (copiar/cortar/pegar por teclado): guarda un
  // subdocumento con las páginas marcadas; `insertPages` les da ids nuevos al pegar.
  const pageClipboardRef = useRef<PdfDoc | null>(null)
  // Selección múltiple de páginas (por ID → sobrevive reordenar/borrar).
  const {
    selectedIds,
    selectedIndices,
    selectedCount,
    toggleSelect,
    clearSelection,
    selectAll,
  } = usePageSelection(doc.pages)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Borrador autoguardado por usuario (sin Clerk, `getCurrentClientUserId` es
  // null → clave 'anon'). `loaded` evita autoguardar antes de restaurar.
  const userKey = useCurrentClientUserId() ?? 'anon'
  const [loaded, setLoaded] = useState(false)
  // Biblioteca de imágenes subidas (workspace reutilizable, aparte del documento).
  // Arranca colapsada (riel finito); se abre al subir la primera imagen.
  const [library, setLibrary] = useState<ImageAsset[]>([])
  // Creaciones guardadas (con nombre, perduran aparte del borrador de trabajo).
  const [saved, setSaved] = useState<SavedDoc[]>([])
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  // `toast` cambia de referencia al mostrarse uno (el contexto lleva el actual);
  // se accede por ref para que el efecto de carga NO se re-dispare en loop.
  const toastRef = useRef(toast)
  toastRef.current = toast
  // Refs para leer selección/doc actuales desde el handler de teclado (montado una
  // sola vez) sin re-suscribirlo en cada cambio de selección.
  const selectedIndicesRef = useRef(selectedIndices)
  selectedIndicesRef.current = selectedIndices
  const docRef = useRef(doc)
  docRef.current = doc
  const selectAllRef = useRef(selectAll)
  selectAllRef.current = selectAll

  /** Aplica un cambio al documento y lo registra en el historial. */
  const commit = useCallback((next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? next(h.present) : next
      return pushHistory(h, value)
    })
  }, [])

  /** Actualiza los ajustes del documento (numeración/marca de agua) SIN entrada de
   *  historial (son config, no edición de contenido); igual persisten en el doc. */
  const updateSettings = useCallback((settings: DocSettings) => {
    setHistory((h) => ({ ...h, present: setDocSettings(h.present, settings) }))
  }, [])

  // Al desmontar la sección, libera las miniaturas/documentos de pdf.js.
  useEffect(() => () => disposePdfStudio(), [])

  // Al montar: restaura el borrador autoguardado del usuario (si tiene páginas).
  // `reseedIds` continúa el contador de ids para no colisionar tras recargar.
  useEffect(() => {
    let alive = true
    void loadDraft(userKey).then((draft) => {
      if (!alive) return
      if (draft && (draft.doc.pages.length > 0 || draft.library.length > 0)) {
        // Compat: anotaciones de borradores viejos (sin `kind`) → texto.
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
    // Lista de creaciones guardadas (perdura aparte del borrador).
    void listSavedDocs(userKey).then((list) => {
      if (!alive) return
      setSaved(list)
      if (list.length > 0) setPanelCollapsed(false)
    })
    return () => {
      alive = false
    }
  }, [userKey])

  // Autoguardado debounced del documento + la biblioteca (tras restaurar).
  useEffect(() => {
    if (!loaded) return
    const t = window.setTimeout(() => void saveDraft(userKey, doc, library), 600)
    return () => window.clearTimeout(t)
  }, [doc, library, loaded, userKey])

  // Atajos de teclado de la grilla (con el editor de texto cerrado y fuera de
  // inputs): deshacer/rehacer (⌘Z/⌘⇧Z), seleccionar todo (⌘A), copiar/cortar/pegar
  // las páginas marcadas (⌘C/⌘X/⌘V) y eliminarlas (Supr/Retroceso). Lee la
  // selección/doc por ref para no re-suscribirse en cada cambio.
  useEffect(() => {
    const hasTextSelection = () => !!window.getSelection()?.toString()
    const forgetThumbsFor = (indices: number[], from: PdfDoc) => {
      const drop = new Set(indices)
      const surviving = new Set(
        from.pages.filter((_, i) => !drop.has(i)).map(pageThumbKey),
      )
      for (const i of indices) {
        const page = from.pages[i]
        if (page && !surviving.has(pageThumbKey(page))) forgetThumb(pageThumbKey(page))
      }
    }
    const deleteMarked = (indices: number[]) => {
      forgetThumbsFor(indices, docRef.current)
      commit((d) => deletePages(d, indices))
      clearSelection()
    }
    const onKey = (e: KeyboardEvent) => {
      if (textPage !== null) return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const sel = selectedIndicesRef.current

      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if (mod && key === 'z') {
        e.preventDefault()
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
        return
      }
      if (mod && key === 'a') {
        if (hasTextSelection()) return // dejá que ⌘A seleccione texto real
        e.preventDefault()
        selectAllRef.current()
        return
      }
      if (mod && (key === 'c' || key === 'x')) {
        if (sel.length === 0 || hasTextSelection()) return
        e.preventDefault()
        pageClipboardRef.current = subsetDoc(docRef.current, sel)
        toastRef.current.show({
          message: `${sel.length} ${sel.length === 1 ? 'página copiada' : 'páginas copiadas'}.`,
          tone: 'default',
        })
        if (key === 'x') deleteMarked(sel)
        return
      }
      if (mod && key === 'v') {
        const clip = pageClipboardRef.current
        if (!clip) return
        e.preventDefault()
        const at = sel.length ? Math.max(...sel) + 1 : undefined
        commit((d) => insertPages(d, clip, at))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length === 0) return
        e.preventDefault()
        deleteMarked(sel)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [textPage, clearSelection, commit])

  const addFiles = useCallback(
    async (list: FileList | File[] | null) => {
      const files = list ? Array.from(list) : []
      if (files.length === 0) return
      setBusy(true)
      try {
        let next = doc
        const failed: string[] = []
        const newAssets: ImageAsset[] = []
        for (const file of files) {
          try {
            if (isPdfFile(file)) {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } else if (isStudioImageFile(file)) {
              next = addImageSource(next, file)
              // Las imágenes subidas quedan además en la biblioteca reutilizable.
              newAssets.push({ id: crypto.randomUUID(), file })
            } else {
              failed.push(file.name)
            }
          } catch {
            failed.push(file.name)
          }
        }
        commit(next)
        if (newAssets.length > 0) {
          setLibrary((lib) => [...lib, ...newAssets])
          setPanelCollapsed(false)
        }
        if (failed.length > 0) {
          toast.show({
            message: `No se pudo leer: ${failed.join(', ')} (¿PDF cifrado o formato no soportado?).`,
            tone: 'error',
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [doc, toast, commit],
  )

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    void addFiles(e.target.files)
    e.currentTarget.value = ''
  }

  function onDropFiles(e: React.DragEvent) {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault()
      void addFiles(e.dataTransfer.files)
    }
  }

  // Libera las miniaturas de las páginas que se van, PERO sólo las que ningún
  // página sobreviviente sigue usando (los duplicados comparten `thumbKey`, así
  // que revocar a ciegas rompería la imagen del que queda).
  function forgetRemovedThumbs(indices: number[]) {
    const drop = new Set(indices)
    const surviving = new Set(doc.pages.filter((_, i) => !drop.has(i)).map(pageThumbKey))
    for (const i of indices) {
      const page = doc.pages[i]
      if (page && !surviving.has(pageThumbKey(page))) forgetThumb(pageThumbKey(page))
    }
  }

  function reorder(from: number, to: number) {
    commit((d) => movePage(d, from, to))
  }

  function nudge(index: number, delta: -1 | 1) {
    commit((d) => movePageByDelta(d, index, delta))
  }

  // ── Acciones en lote sobre la selección (barra de edición) ────────────────
  /** Abre el editor de texto de la única hoja marcada (botón "Texto" de la barra). */
  function editSelectedText() {
    if (selectedIndices.length === 1) setTextPage(selectedIndices[0]!)
  }

  function bulkRotate(delta: -1 | 1) {
    if (selectedCount > 0) commit((d) => rotatePages(d, selectedIndices, delta))
  }

  function bulkDuplicate() {
    if (selectedCount > 0) commit((d) => duplicatePages(d, selectedIndices))
  }

  function bulkDelete() {
    if (selectedCount === 0) return
    forgetRemovedThumbs(selectedIndices)
    commit((d) => deletePages(d, selectedIndices))
    clearSelection()
  }

  /** Empieza un documento nuevo (descarta el borrador; es deshacible). */
  function newDoc() {
    commit(emptyDoc())
    clearSelection()
    void clearDraft(userKey)
  }

  function closeTextEditor(edits: Record<number, Annotation[]> | null) {
    // El editor permite navegar y editar varias páginas; entrega un mapa
    // índice→anotaciones de las páginas que tocó. Se confirman todas juntas.
    if (edits && Object.keys(edits).length > 0) {
      commit((d) => applyEdits(d, edits))
    }
    setTextPage(null)
  }

  // ── Biblioteca de imágenes ───────────────────────────────────────────────
  /** Agrega una imagen de la biblioteca como una página nueva del documento. */
  function addLibraryToDoc(asset: ImageAsset) {
    commit((d) => addImageSource(d, asset.file))
  }
  function removeFromLibrary(id: string) {
    setLibrary((lib) => lib.filter((a) => a.id !== id))
  }
  function downloadLibrary(asset: ImageAsset) {
    downloadBlob(asset.file, asset.file.name || 'imagen')
  }

  // ── Creaciones guardadas ─────────────────────────────────────────────────
  /** Guarda el documento actual como una creación con nombre (perdura). */
  function saveCreation(name: string) {
    const s: SavedDoc = { id: crypto.randomUUID(), name, doc, savedAt: Date.now() }
    setSaved((list) => [s, ...list])
    void putSavedDoc(userKey, s)
    toast.show({ message: `Guardado "${name}".`, tone: 'success' })
  }
  /** Re-abre una creación guardada en el editor (reemplaza lo que haya en pantalla;
   *  es deshacible con ⌘Z). */
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
  async function downloadSaved(s: SavedDoc) {
    try {
      const blob = await assembleOrToast(s.doc)
      if (blob) downloadBlob(blob, `${s.name || 'creacion'}.pdf`)
    } finally {
      setExportStatus(null)
    }
  }

  /** Ensambla `target` con UN solo manejo de errores y del aviso de archivos
   *  salteados (los tres caminos de export lo comparten → comportamiento idéntico,
   *  sin el bug silencioso de descartar `skipped`). Devuelve el blob o `null`. */
  async function assembleOrToast(target: PdfDoc): Promise<Blob | null> {
    setExportStatus(pdfExportProgressLabel(target.pages.length))
    try {
      const { blob, skipped } = await assemble(target)
      if (skipped.length > 0) {
        toast.show({
          message: `Se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
      return blob
    } catch (err) {
      toast.show({
        message: describePdfExportError(err),
        tone: 'error',
      })
      return null
    }
  }

  // "Guardar PDF": ensambla y abre el PDF en el VISOR del navegador (pestaña nueva),
  // donde imprimir y "guardar como PDF" sí funcionan. La pestaña se abre ANTES de
  // ensamblar (en el gesto del clic) para esquivar el bloqueador de pop-ups. En iOS
  // (donde abrir un blob en pestaña suele fallar) o si la bloquean → descarga directa
  // con aviso. Exporta SIEMPRE el documento completo (el subset es vía "Exportar").
  async function exportPdf(target: PdfDoc, kind?: string) {
    if (!canExport(target) || saving) return
    setSaving(true)
    const ios = shouldDownloadPdfDirectly()
    const viewer = ios ? null : openBlankPdfTab()
    try {
      const blob = await assembleOrToast(target)
      if (!blob) {
        viewer?.close()
        return
      }
      if (ios) {
        downloadBlob(blob, exportPdfName(undefined, kind))
        toast.show({
          message: 'Descargamos el PDF; ábrelo desde Archivos para imprimir.',
          tone: 'default',
        })
        return
      }
      showPdfInTab(viewer, blob, () => {
        downloadBlob(blob, exportPdfName(undefined, kind))
        toast.show({
          message: 'Tu navegador bloqueó la ventana; descargamos el PDF.',
          tone: 'default',
        })
      })
    } finally {
      setExportStatus(null)
      setSaving(false)
    }
  }

  /** Descarga el PDF directo a disco: 100% confiable, conserva el texto vectorial y
   *  da nombre con fecha; no depende del visor ni del bloqueador de pop-ups. */
  async function downloadPdf(target: PdfDoc, kind?: string) {
    if (!canExport(target) || saving) return
    setSaving(true)
    try {
      const blob = await assembleOrToast(target)
      if (blob) downloadBlob(blob, exportPdfName(undefined, kind))
    } finally {
      setExportStatus(null)
      setSaving(false)
    }
  }

  /** Exporta (al visor) SÓLO las hojas marcadas con el tick (barra de edición). */
  function exportMarked() {
    if (selectedIndices.length > 0)
      void exportPdf(subsetDoc(doc, selectedIndices), 'seleccion')
  }

  const total = doc.pages.length
  const empty = total === 0
  const undoable = canUndo(history)
  const redoable = canRedo(history)
  // El panel aparece cuando hay hojas (para poder guardar), imágenes o guardados.
  const showPanel = !empty || library.length > 0 || saved.length > 0

  const dropzone = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFiles}
      className="group mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-ink-200 bg-paper-50/55 px-6 py-16 text-center shadow-sm shadow-ink-900/5 transition-colors hover:border-ink-300 hover:bg-paper-50/80"
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-md transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: 'var(--accent-sage-soft)', color: ACCENT }}
      >
        <FilePdfIcon size={22} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-body font-medium text-ink-700">
          Arrastra PDFs o imágenes aquí
        </span>
        <span className="text-caption text-ink-400">o haz clic para elegir archivos</span>
      </span>
      <span className="flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
        {['PDF', 'JPG', 'PNG'].map((t) => (
          <span key={t} className="rounded bg-ink-100/60 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </span>
    </button>
  )

  const mainPane = empty ? (
    dropzone
  ) : (
    <PageGrid
      doc={doc}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onReorder={reorder}
      onNudge={nudge}
      onOpenText={setTextPage}
      onDropFiles={onDropFiles}
      scrollRoot={scrollRoot}
    />
  )

  // Barra de edición de hojas: SIEMPRE visible cuando hay páginas (actúa sobre las
  // marcadas con el tick). Vive en la columna izquierda, sobre la grilla.
  const editBar = !empty && (
    <BulkBar
      count={selectedCount}
      total={total}
      onEditText={editSelectedText}
      onRotate={bulkRotate}
      onDuplicate={bulkDuplicate}
      onDelete={bulkDelete}
      onExport={exportMarked}
      onSelectAll={selectAll}
      onClear={clearSelection}
    />
  )

  const pageNumbers = doc.settings?.pageNumbers
  const watermarkText = doc.settings?.watermark?.text ?? ''
  const setPageNumbers = (next: DocSettings['pageNumbers']) =>
    updateSettings({ ...doc.settings, pageNumbers: next })
  const setWatermark = (text: string) =>
    updateSettings({
      ...doc.settings,
      watermark: text.trim() ? { text } : undefined,
    })

  return (
    <section className="pdf-studio flex min-h-0 flex-1">
      {/* Panel = SEGUNDA barra lateral: adosada a la navegación y FULL-HEIGHT en
          DESKTOP. En MÓVIL, expandido es un drawer por encima (no le roba ancho a
          la grilla); colapsado es un riel fino. */}
      {showPanel && (
        <>
          {!panelCollapsed && (
            <button
              type="button"
              aria-label="Cerrar el panel"
              onClick={() => setPanelCollapsed(true)}
              className="fixed inset-0 z-30 bg-ink-900/40 md:hidden"
            />
          )}
          <div
            className={`shrink-0 self-stretch ${
              panelCollapsed
                ? ''
                : 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl'
            }`}
          >
            <WorkspacePanel
              library={library}
              onAddImage={addLibraryToDoc}
              onRemoveImage={removeFromLibrary}
              onDownloadImage={downloadLibrary}
              saved={saved}
              canSave={!empty}
              onSaveCreation={saveCreation}
              onOpenSaved={openSaved}
              onRenameSaved={renameSaved}
              onDeleteSaved={removeSaved}
              onDownloadSaved={downloadSaved}
              collapsed={panelCollapsed}
              onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
            />
          </div>
        </>
      )}

      {/* Columna de trabajo: topbar de la sección + contenido scrolleable y CENTRADO
          (los botones y los documentos quedan centrados, como antes). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {topBar}
        <div ref={setScrollRoot} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-5 pb-24 pt-6 md:px-8">
            <div
              role="toolbar"
              aria-label="Acciones del documento PDF"
              className="flex flex-nowrap items-center gap-1.5 border-y border-ink-100/70 bg-paper-50/70 px-1.5 py-1.5 shadow-sm shadow-ink-900/5"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  aria-label="Importar PDF o imagen"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-100/50 hover:text-ink-900 disabled:opacity-50"
                >
                  <UploadIcon size={13} />
                  {busy ? 'Agregando…' : 'Importar'}
                </button>
                {(undoable || redoable) && (
                  <div className="inline-flex items-center overflow-hidden rounded-md bg-ink-100/40">
                    <button
                      type="button"
                      onClick={() => setHistory((h) => undo(h))}
                      disabled={!undoable}
                      aria-label="Deshacer"
                      title={pdfCommandTooltip('undo', isMac)}
                      className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
                    >
                      <UndoIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistory((h) => redo(h))}
                      disabled={!redoable}
                      aria-label="Rehacer"
                      title={pdfCommandTooltip('redo', isMac)}
                      className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
                    >
                      <RedoIcon size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="ml-auto flex min-w-0 items-center gap-1.5">
                {!empty && (
                  <span className="hidden text-micro text-ink-300 tabular-nums sm:inline">
                    {total} {total === 1 ? 'página' : 'páginas'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void exportPdf(doc)}
                  disabled={empty || saving || busy}
                  title="Abrir el visor del navegador para imprimir o guardar todo el documento"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
                >
                  <PrinterIcon size={13} />
                  {saving ? 'Preparando…' : 'Guardar PDF'}
                </button>
                {exportStatus && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="hidden text-micro text-ink-400 sm:inline"
                  >
                    {exportStatus}
                  </span>
                )}
                <OverflowMenu
                  label="Más acciones del documento"
                  width="w-64"
                  triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
                >
                  {(close) => (
                    <>
                      <OverflowMenuItem
                        disabled={empty || saving || busy}
                        onClick={() => {
                          close()
                          void downloadPdf(doc)
                        }}
                      >
                        <DownloadIcon size={13} />
                        Descargar
                      </OverflowMenuItem>
                      {/*
                        Nuevo documento queda en acciones secundarias: útil, pero no
                        tanto como importar/guardar durante el armado cotidiano.
                      */}
                      <OverflowMenuItem
                        disabled={empty || busy}
                        onClick={() => {
                          close()
                          newDoc()
                        }}
                      >
                        <FileIcon size={13} />
                        Nuevo documento
                      </OverflowMenuItem>
                      {!empty && (
                        <div className="mt-1 border-t border-ink-100 px-2 py-2">
                          <p className="mb-2 text-micro uppercase tracking-eyebrow text-ink-300">
                            Ajustes
                          </p>
                          <label className="flex items-center gap-2 text-caption text-ink-700">
                            <input
                              type="checkbox"
                              checked={!!pageNumbers}
                              onChange={(e) =>
                                setPageNumbers(
                                  e.target.checked ? { position: 'center' } : undefined,
                                )
                              }
                            />
                            Numerar páginas
                          </label>
                          {pageNumbers && (
                            <div className="mt-1.5 flex gap-1 pl-6">
                              {(['left', 'center', 'right'] as const).map((position) => {
                                const on = pageNumbers.position === position
                                const label =
                                  position === 'left'
                                    ? 'Izq.'
                                    : position === 'center'
                                      ? 'Centro'
                                      : 'Der.'
                                return (
                                  <button
                                    key={position}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setPageNumbers({ position })}
                                    className={`rounded px-2 py-0.5 text-micro transition-colors ${
                                      on
                                        ? 'bg-[color:var(--accent-sage)] text-paper-50'
                                        : 'text-ink-500 hover:bg-ink-100/60'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          <label
                            className="mt-2 block text-caption text-ink-700"
                            htmlFor="pdf-watermark-menu"
                          >
                            Marca de agua
                          </label>
                          <input
                            id="pdf-watermark-menu"
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermark(e.target.value)}
                            placeholder="Ej: BORRADOR"
                            className="input-paper mt-1 w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
                          />
                        </div>
                      )}
                    </>
                  )}
                </OverflowMenu>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={onFileInput}
              />
            </div>

            {editBar}
            {mainPane}
          </div>
        </div>
      </div>

      {textPage !== null && (
        <PdfTextEditor doc={doc} pageIndex={textPage} onClose={closeTextEditor} />
      )}
    </section>
  )
}
