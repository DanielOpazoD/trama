import { useCallback, useEffect, useRef, useState } from 'react'
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
  subsetDoc,
  type Annotation,
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
import { BulkBar } from './BulkBar'
import { WorkspacePanel } from './WorkspacePanel'
import { PageGrid } from './PageGrid'
import { PdfTextEditor } from './PdfTextEditor'
import { usePageSelection } from './usePageSelection'
import {
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

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Nombre de archivo del PDF exportado, con fecha local para no pisar descargas. */
function exportName(kind?: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `trama-${kind ? `${kind}-` : ''}${stamp}.pdf`
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
export function PdfStudioView() {
  const toast = useToast()
  // El documento vive detrás de un historial (undo/redo). `doc` = presente.
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const [busy, setBusy] = useState(false) // importando
  const [saving, setSaving] = useState(false)
  const [textPage, setTextPage] = useState<number | null>(null)
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
            if (isPdf(file)) {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } else if (isImage(file)) {
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
  /** Re-abre una creación guardada en el editor (reemplaza lo que haya en pantalla). */
  function openSaved(s: SavedDoc) {
    if (
      doc.pages.length > 0 &&
      !window.confirm('¿Abrir esta creación? Se reemplazará lo que tenés en pantalla.')
    ) {
      return
    }
    const restored = normalizeDoc(s.doc)
    reseedIds(restored)
    setHistory(initHistory(restored))
    clearSelection()
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
      const { blob } = await assemble(s.doc)
      downloadBlob(blob, `${s.name || 'creacion'}.pdf`)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo descargar.',
        tone: 'error',
      })
    }
  }

  // Exporta un documento: ensambla y lo abre en el VISOR del navegador (pestaña
  // nueva), donde imprimir y "guardar como PDF" sí funcionan. La pestaña se abre
  // ANTES de ensamblar (en el gesto del clic) para esquivar el bloqueador de
  // pop-ups; si igual la bloquean, plan B = descarga directa. "Guardar PDF" exporta
  // SIEMPRE el documento completo; "Exportar marcadas" usa el subconjunto del tick.
  async function exportPdf(target: PdfDoc, kind?: string) {
    if (!canExport(target) || saving) return
    setSaving(true)
    const viewer = openBlankPdfTab()
    try {
      const { blob, skipped } = await assemble(target)
      showPdfInTab(viewer, blob, () => downloadBlob(blob, exportName(kind)))
      if (skipped.length > 0) {
        toast.show({
          message: `Se preparó el PDF, pero se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
    } catch (err) {
      viewer?.close()
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo preparar el PDF.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  /** Exporta SÓLO las hojas marcadas con el tick (acción de la barra de edición). */
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
      className="group mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-ink-200 bg-paper-50/40 px-6 py-16 text-center transition-colors hover:border-ink-300 hover:bg-paper-50/70"
    >
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: 'var(--accent-sage-soft)', color: ACCENT }}
      >
        <FilePdfIcon size={26} />
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

  return (
    <section className="pdf-studio">
      <div className="flex items-start">
        {/* Panel = SEGUNDA barra lateral, adosada a la navegación principal (flush a
            la izquierda), full-height sticky en desktop. */}
        {showPanel && (
          <div className="shrink-0 self-stretch md:sticky md:top-0 md:h-[calc(100dvh-3.25rem)] md:self-start">
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
        )}

        {/* Área de trabajo: barra de acciones · barra de edición · grilla. Tiene su
            propio padding; el panel queda flush contra la navegación. */}
        <div className="min-w-0 flex-1 space-y-5 px-5 pb-24 pt-6 md:px-8">
          {/* Barra de acciones: izquierda (agregar · historial) — derecha (contador · nuevo · guardar) */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-100/40 hover:text-ink-800 disabled:opacity-50"
              >
                <UploadIcon size={13} />
                {busy ? 'Agregando…' : 'Agregar PDF o imagen'}
              </button>
              {(undoable || redoable) && (
                <div className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden divide-x divide-ink-100">
                  <button
                    type="button"
                    onClick={() => setHistory((h) => undo(h))}
                    disabled={!undoable}
                    aria-label="Deshacer"
                    title="Deshacer (⌘Z)"
                    className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
                  >
                    <UndoIcon size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistory((h) => redo(h))}
                    disabled={!redoable}
                    aria-label="Rehacer"
                    title="Rehacer (⌘⇧Z)"
                    className="touch-target inline-flex h-7 w-8 items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-500 transition-colors"
                  >
                    <RedoIcon size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!empty && (
                <span className="mr-1 text-micro text-ink-300 tabular-nums">
                  {total} {total === 1 ? 'página' : 'páginas'}
                </span>
              )}
              {!empty && (
                <button
                  type="button"
                  onClick={newDoc}
                  title="Empezar un documento nuevo (descarta el borrador; deshacible)"
                  className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-ink-200 text-ink-600 hover:text-ink-800 hover:border-ink-300 hover:bg-ink-100/40 transition-colors"
                >
                  <FileIcon size={13} />
                  Nuevo
                </button>
              )}
              <button
                type="button"
                onClick={() => void exportPdf(doc)}
                disabled={empty || saving || busy}
                title="Abrir el visor para imprimir o guardar todo el documento"
                className="btn-ink text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <PrinterIcon size={13} />
                {saving ? 'Preparando…' : 'Guardar PDF'}
              </button>
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

      {textPage !== null && (
        <PdfTextEditor doc={doc} pageIndex={textPage} onClose={closeTextEditor} />
      )}
    </section>
  )
}
