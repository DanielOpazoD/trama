import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addImageSource,
  addPdfSource,
  applyEdits,
  canExport,
  deletePage,
  deletePages,
  duplicatePages,
  emptyDoc,
  movePage,
  movePageByDelta,
  normalizeDoc,
  pageThumbKey,
  reseedIds,
  rotatePage,
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
import { printPdfBlob } from '../../../lib/pdfStudio/printPdf'
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
import { PdfPreviewModal } from './PdfPreviewModal'
import { PdfTextEditor } from './PdfTextEditor'
import { usePageSelection } from './usePageSelection'
import {
  DownloadIcon,
  EyeIcon,
  FilePdfIcon,
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
 * Editor de PDF (submódulo del mundo Notas), 100% client-side: combina PDFs e
 * imágenes en un solo documento, a nivel de PÁGINA (estilo iLovePDF). Cada PDF
 * se expande en sus páginas y cada imagen es una página; todas se ven como
 * miniaturas reordenables (botones ◄ ► o arrastrando) y borrables, y se guardan
 * como un PDF nuevo. El modelo es puro y testeado; el render (pdf.js) y el
 * ensamblado (pdf-lib) son perezosos y viven en archivos aparte.
 */
export function PdfStudioView() {
  const toast = useToast()
  // El documento vive detrás de un historial (undo/redo). `doc` = presente.
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const [busy, setBusy] = useState(false) // importando
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [textPage, setTextPage] = useState<number | null>(null)
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

  // Atajos: ⌘/Ctrl+Z deshace, ⌘/Ctrl+Shift+Z rehace (salvo en inputs o con el
  // editor de texto abierto, que tiene su propio estado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textPage !== null) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [textPage, clearSelection])

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

  function removePage(index: number) {
    forgetRemovedThumbs([index])
    commit((d) => deletePage(d, index))
  }

  function reorder(from: number, to: number) {
    commit((d) => movePage(d, from, to))
  }

  function nudge(index: number, delta: -1 | 1) {
    commit((d) => movePageByDelta(d, index, delta))
  }

  function rotate(index: number, delta: -1 | 1) {
    commit((d) => rotatePage(d, index, delta))
  }

  function duplicateOne(index: number) {
    commit((d) => duplicatePages(d, [index]))
  }

  // ── Acciones en lote sobre la selección ──────────────────────────────────
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

  // El documento a EXPORTAR: si hay hojas marcadas (tick), sólo esas; si no, todas.
  const exportDoc = selectedIndices.length ? subsetDoc(doc, selectedIndices) : doc

  // "Guardar PDF" abre el diálogo de impresión del navegador (guardar como PDF a
  // disco o imprimir), no descarga directo: ensambla y manda el PDF a `printPdfBlob`.
  async function save() {
    if (!canExport(doc) || saving) return
    setSaving(true)
    try {
      const { blob, skipped } = await assemble(exportDoc)
      printPdfBlob(blob)
      if (skipped.length > 0) {
        toast.show({
          message: `Se abrió la impresión, pero se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo preparar el PDF.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
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
      className="group w-full rounded-2xl border border-dashed border-ink-200 bg-paper-50/40 px-6 py-16 flex flex-col items-center justify-center gap-4 text-center transition-colors hover:border-ink-300 hover:bg-paper-50/70"
    >
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: 'var(--accent-primary-soft)', color: ACCENT }}
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
      onRotate={rotate}
      onDuplicate={duplicateOne}
      onDelete={removePage}
      onOpenText={setTextPage}
      onDropFiles={onDropFiles}
    />
  )

  return (
    <section className="space-y-5">
      <header>
        <p className="section-eyebrow text-ink-400">editor de pdf</p>
      </header>

      {/* Barra de acciones: izquierda (agregar · historial) — derecha (contador · guardar) */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
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
        <div className="flex items-center gap-3">
          {!empty && (
            <span className="text-micro text-ink-300 tabular-nums">
              {total} {total === 1 ? 'página' : 'páginas'}
            </span>
          )}
          {!empty && (
            <button
              type="button"
              onClick={newDoc}
              title="Empezar un documento nuevo (descarta el borrador; deshacible)"
              className="btn-ghost text-xs"
            >
              Nuevo
            </button>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              disabled={saving || busy}
              title={
                selectedCount > 0
                  ? 'Ver las hojas seleccionadas antes de guardar'
                  : 'Ver el PDF final antes de guardar'
              }
              className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <EyeIcon size={13} />
              Vista previa
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={empty || saving || busy}
            title={
              selectedCount > 0
                ? 'Abrir la impresión para guardar/imprimir las hojas seleccionadas'
                : 'Abrir la impresión para guardar/imprimir todas las hojas'
            }
            className="btn-ink text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <DownloadIcon size={13} />
            {saving
              ? 'Guardando…'
              : selectedCount > 0
                ? `Guardar PDF (${selectedCount})`
                : 'Guardar PDF'}
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

      {selectedCount > 0 && (
        <BulkBar
          count={selectedCount}
          total={total}
          onRotate={bulkRotate}
          onDuplicate={bulkDuplicate}
          onDelete={bulkDelete}
          onSelectAll={selectAll}
          onClear={clearSelection}
        />
      )}

      {showPanel ? (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">{mainPane}</div>
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
      ) : (
        mainPane
      )}

      {textPage !== null && (
        <PdfTextEditor doc={doc} pageIndex={textPage} onClose={closeTextEditor} />
      )}

      {previewing && (
        <PdfPreviewModal
          doc={exportDoc}
          onClose={() => setPreviewing(false)}
          onDownload={(blob) => {
            downloadBlob(blob, exportName())
            toast.show({ message: 'PDF guardado.', tone: 'success' })
            setPreviewing(false)
          }}
        />
      )}
    </section>
  )
}
