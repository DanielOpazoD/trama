import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  deletePages,
  duplicatePages,
  emptyDoc,
  movePage,
  movePageByDelta,
  isPdfTemplate,
  pageThumbKey,
  rotatePages,
  setDocSettings,
  subsetDoc,
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
import { PdfDropzone } from './PdfDropzone'
import { PageGrid } from './PageGrid'
import { PdfStudioDocumentToolbar } from './PdfStudioDocumentToolbar'
import { PdfStudioFormPanel } from './PdfStudioFormPanel'
import { PdfStudioOcrPanel } from './PdfStudioOcrPanel'
import { PdfStudioWorkspacePanelHost } from './PdfStudioWorkspacePanelHost'
import { PdfTextEditor, type PdfTextEditorResult } from './PdfTextEditor'
import { applyPdfTextEditorResult } from './pdfTextEditorResult'
import { usePageSelection } from './usePageSelection'
import { usePdfStudioExport } from './usePdfStudioExport'
import { usePdfStudioImport } from './usePdfStudioImport'
import { usePdfStudioForms } from './usePdfStudioForms'
import { usePdfStudioPageKeyboard } from './usePdfStudioPageKeyboard'
import { usePdfStudioOcr } from './usePdfStudioOcr'
import { usePdfStudioTemplateMode } from './usePdfStudioTemplateMode'
import { usePdfStudioWorkspace } from './usePdfStudioWorkspace'
import { useToast } from '../../../state'
const ACCEPT = 'application/pdf,image/*'
export type PdfStudioMode = 'editor' | 'templates'
export function PdfStudioView({
  topBar,
  studioMode = 'editor',
}: {
  topBar?: ReactNode
  studioMode?: PdfStudioMode
}) {
  const toast = useToast()
  const templatesEnabled = studioMode === 'templates'
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
    openTemplate,
    openSaved,
    panelCollapsed,
    removeFromLibrary,
    removeSaved,
    renameSaved,
    saveCreation,
    saveTemplate,
    saved,
    setPanelCollapsed,
    userKey,
  } = usePdfStudioWorkspace({ clearSelection, commit, doc, setHistory })
  const {
    effectiveTemplateMode,
    openSavedWithMode,
    resetTemplateMode,
    saveTemplateWithMode,
    templateModeBanner,
    openTemplateWithFillMode,
  } = usePdfStudioTemplateMode({
    doc,
    exportPdf,
    openSaved,
    openTemplate,
    saveTemplate,
  })
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
  const { applyForms, clearForms, formSummary, forms, inspectForms, updateFormValue } =
    usePdfStudioForms(doc, commit)
  const {
    cancelOcr,
    language: ocrLanguage,
    ocrOpen,
    ocrRunning,
    ocrStatus,
    setLanguage: setOcrLanguage,
    setOcrOpen,
    startOcr,
  } = usePdfStudioOcr({ compression: exportCompression })
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

  function newDoc() {
    commit(emptyDoc())
    clearSelection()
    resetTemplateMode()
    void clearDraft(userKey)
  }
  function closeTextEditor(edits: PdfTextEditorResult | null) {
    if (edits) commit((d) => applyPdfTextEditorResult(d, edits))
    setTextPage(null)
  }
  function printFilledTemplate(edits: PdfTextEditorResult) {
    const next = applyPdfTextEditorResult(doc, edits)
    commit(next)
    void exportPdf(next, 'planilla')
  }
  function exportMarked() {
    if (selectedIndices.length > 0)
      void exportPdf(subsetDoc(doc, selectedIndices), 'seleccion')
  }

  const total = doc.pages.length
  const empty = total === 0
  const undoable = canUndo(history)
  const redoable = canRedo(history)
  const hasVisibleSaved = templatesEnabled
    ? saved.length > 0
    : saved.some((s) => !isPdfTemplate(s.doc))
  const showPanel = !empty || library.length > 0 || hasVisibleSaved
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
      <PdfStudioWorkspacePanelHost
        show={showPanel}
        library={library}
        saved={saved}
        templatesEnabled={templatesEnabled}
        canSave={!empty}
        canSaveTemplate={templatesEnabled && !empty && isPdfTemplate(doc)}
        collapsed={panelCollapsed}
        onAddImage={addLibraryToDoc}
        onRemoveImage={removeFromLibrary}
        onDownloadImage={downloadLibrary}
        onSaveCreation={saveCreation}
        onSaveTemplate={saveTemplateWithMode}
        onOpenSaved={openSavedWithMode}
        onUseTemplate={(saved) => {
          openTemplateWithFillMode(saved)
          setTextPage(0)
        }}
        onRenameSaved={renameSaved}
        onDeleteSaved={removeSaved}
        onDownloadSaved={downloadSaved}
        onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
      />
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
              onOpenOcr={() => setOcrOpen(true)}
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
            {templateModeBanner}
            <PdfStudioFormPanel
              forms={forms}
              onApply={(flatten) => void applyForms(flatten)}
              onClear={clearForms}
              onChange={updateFormValue}
            />
            {ocrOpen && (
              <PdfStudioOcrPanel
                disabled={empty || saving || busy}
                doc={doc}
                language={ocrLanguage}
                running={ocrRunning}
                status={ocrStatus}
                totalPages={total}
                onCancel={cancelOcr}
                onChangeLanguage={setOcrLanguage}
                onRun={() => void startOcr(doc)}
              />
            )}
            {editBar}
            {mainPane}
          </div>
        </div>
      </div>
      {textPage !== null && (
        <PdfTextEditor
          doc={doc}
          pageIndex={textPage}
          detectedForms={forms}
          mode={effectiveTemplateMode === 'fill' ? 'fill' : 'edit'}
          templateToolsEnabled={templatesEnabled}
          onFormValueChange={updateFormValue}
          onInspectForms={templatesEnabled ? () => void inspectForms() : undefined}
          onClose={closeTextEditor}
          onPrint={printFilledTemplate}
        />
      )}
    </section>
  )
}
