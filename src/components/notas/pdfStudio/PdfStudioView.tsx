import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  applyEdits,
  deletePages,
  duplicatePages,
  emptyDoc,
  movePage,
  movePageByDelta,
  pageThumbKey,
  rotatePages,
  setDocSettings,
  subsetDoc,
  type Annotation,
  type DocSettings,
  type PdfDoc,
} from '../../../lib/pdfStudio/model'
import type { AssembleOptions } from '../../../lib/pdfStudio/assemble'
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/history'
import { disposePdfStudio, forgetThumb } from '../../../lib/pdfStudio/pdfRender'
import { clearDraft } from '../../../lib/pdfStudio/persistence'
import { BulkBar } from './BulkBar'
import { WorkspacePanel } from './WorkspacePanel'
import { PdfDropzone } from './PdfDropzone'
import { PageGrid } from './PageGrid'
import { PdfStudioDocumentToolbar } from './PdfStudioDocumentToolbar'
import { PdfStudioFormPanel } from './PdfStudioFormPanel'
import { PdfTextEditor } from './PdfTextEditor'
import { usePageSelection } from './usePageSelection'
import { usePdfStudioExport } from './usePdfStudioExport'
import { usePdfStudioImport } from './usePdfStudioImport'
import { usePdfStudioForms } from './usePdfStudioForms'
import { usePdfStudioPageKeyboard } from './usePdfStudioPageKeyboard'
import { usePdfStudioWorkspace } from './usePdfStudioWorkspace'
import { useToast } from '../../../state'

const ACCEPT = 'application/pdf,image/*'

export function PdfStudioView({ topBar }: { topBar?: ReactNode }) {
  const toast = useToast()
  const [exportCompression, setExportCompression] =
    useState<AssembleOptions['compression']>('balanced')
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const { cancelExport, downloadPdf, downloadSaved, exportPdf, exportStatus, saving } =
    usePdfStudioExport({ compression: exportCompression })
  const [textPage, setTextPage] = useState<number | null>(null)
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  const pageClipboardRef = useRef<PdfDoc | null>(null)
  const {
    selectedIds,
    selectedIndices,
    selectedCount,
    toggleSelect,
    clearSelection,
    selectAll,
  } = usePageSelection(doc.pages)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commit = useCallback((next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? next(h.present) : next
      return pushHistory(h, value)
    })
  }, [])

  const {
    addAssets,
    addLibraryToDoc,
    downloadLibrary,
    library,
    openSaved,
    panelCollapsed,
    removeFromLibrary,
    removeSaved,
    renameSaved,
    saveCreation,
    saved,
    setPanelCollapsed,
    userKey,
  } = usePdfStudioWorkspace({ clearSelection, commit, doc, setHistory })
  const selectedIndicesRef = useRef(selectedIndices)
  selectedIndicesRef.current = selectedIndices
  const docRef = useRef(doc)
  docRef.current = doc
  const selectAllRef = useRef(selectAll)
  selectAllRef.current = selectAll

  const updateSettings = useCallback((settings: DocSettings) => {
    setHistory((h) => ({ ...h, present: setDocSettings(h.present, settings) }))
  }, [])

  const { addFiles, busy } = usePdfStudioImport({
    commit,
    doc,
    onImageAssets: addAssets,
  })
  const { applyForms, formSummary, forms, inspectForms, updateFormValue } =
    usePdfStudioForms(doc, commit)

  // Al desmontar la sección, libera las miniaturas/documentos de pdf.js.
  useEffect(() => () => disposePdfStudio(), [])

  usePdfStudioPageKeyboard({
    textPage,
    selectedIndicesRef,
    docRef,
    pageClipboardRef,
    selectAllRef,
    clearSelection,
    commit,
    setHistory,
    showToast: (message) => toast.show({ message, tone: 'default' }),
  })

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

  const mainPane = empty ? (
    <PdfDropzone
      onClick={() => fileInputRef.current?.click()}
      onDropFiles={onDropFiles}
    />
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
            <PdfStudioDocumentToolbar
              busy={busy}
              empty={empty}
              exportStatus={exportStatus}
              exportCompression={exportCompression}
              pageNumbers={pageNumbers}
              redoable={redoable}
              saving={saving}
              total={total}
              undoable={undoable}
              watermarkText={watermarkText}
              onImport={() => fileInputRef.current?.click()}
              onUndo={() => setHistory((h) => undo(h))}
              onRedo={() => setHistory((h) => redo(h))}
              onSavePdf={() => void exportPdf(doc)}
              onDownload={() => void downloadPdf(doc)}
              onCancelExport={cancelExport}
              onNewDoc={newDoc}
              onInspectForms={() => void inspectForms()}
              onSetExportCompression={setExportCompression}
              onSetPageNumbers={setPageNumbers}
              onSetWatermark={setWatermark}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={onFileInput}
            />
            {formSummary && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-ink-100 bg-paper-50/80 px-3 py-2 text-caption text-ink-600"
              >
                {formSummary}
              </div>
            )}
            <PdfStudioFormPanel
              forms={forms}
              onApply={(flatten) => void applyForms(flatten)}
              onChange={updateFormValue}
            />

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
