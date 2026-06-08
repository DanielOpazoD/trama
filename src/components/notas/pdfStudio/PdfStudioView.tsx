import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  emptyDoc,
  isPdfTemplate,
  setDocSettings,
  type DocSettings,
  type PdfDoc,
} from '../../../lib/pdfStudio/model/model'
import type { AssembleOptions } from '../../../lib/pdfStudio/assemble/assemble'
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/model/history'
import { disposePdfStudio } from '../../../lib/pdfStudio/render/pdfRender'
import {
  clearDraft,
  isSavedFilledTemplate,
} from '../../../lib/pdfStudio/render/persistence'
import { BulkBar } from './shell/BulkBar'
import { PdfStudioDocumentToolbar } from './shell/PdfStudioDocumentToolbar'
import { PdfStudioFormPanel } from './planillas/PdfStudioFormPanel'
import { PdfStudioMainPane } from './shell/PdfStudioMainPane'
import { PdfStudioOcrPanel } from './ocr/PdfStudioOcrPanel'
import { PdfTemplateWorkflowGuide } from './planillas/design/PdfTemplateWorkflowGuide'
import { PdfStudioWorkspacePanelHost } from './shell/PdfStudioWorkspacePanelHost'
import { PdfTextEditor } from './editor/PdfTextEditor'
import {
  applyPdfTextEditorResult,
  type PdfTextEditorResult,
} from './editor/pdfTextEditorResult'
import { usePageSelection } from './shell/usePageSelection'
import { usePdfStudioExport } from './shell/usePdfStudioExport'
import { usePdfStudioImport } from './shell/usePdfStudioImport'
import { usePdfStudioForms } from './planillas/usePdfStudioForms'
import { usePdfStudioPageKeyboard } from './shell/usePdfStudioPageKeyboard'
import { usePdfStudioPageActions } from './shell/usePdfStudioPageActions'
import { usePdfStudioOcr } from './ocr/usePdfStudioOcr'
import { usePdfStudioFilledTemplateActions } from './planillas/fill/usePdfStudioFilledTemplateActions'
import { usePdfStudioDraftSanitizer } from './workspace/usePdfStudioDraftSanitizer'
import { usePdfStudioTemplateMode } from './planillas/design/usePdfStudioTemplateMode'
import { usePdfStudioWorkspace } from './workspace/usePdfStudioWorkspace'
import { pdfStudioPageInteractionMode as pageMode } from './shell/pdfStudioPageInteractionMode'
import { useToast } from '../../../state'
const ACCEPT = 'application/pdf,image/*'
export type PdfStudioMode = 'editor' | 'templates'
type PdfStudioViewProps = { topBar?: ReactNode; studioMode?: PdfStudioMode }
export function PdfStudioView({ topBar, studioMode = 'editor' }: PdfStudioViewProps) {
  const toast = useToast()
  const templatesEnabled = studioMode === 'templates'
  const [exportCompression, setExportCompression] =
    useState<AssembleOptions['compression']>('balanced')
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const { cancelExport, downloadPdf, downloadSaved, exportPdf, exportStatus, saving } =
    usePdfStudioExport({ compression: exportCompression })
  const [textPage, setTextPage] = useState<number | null>(null)
  const [saveTemplateSignal, setSaveTemplateSignal] = useState(0)
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
    duplicateSaved,
    exportTemplatePackage,
    library,
    openTemplate,
    openSaved,
    panelCollapsed,
    removeFromLibrary,
    removeSaved,
    renameSaved,
    saveCreation,
    saveFilledCopy,
    saveTemplate,
    saved,
    setDraftSanitizer,
    setPanelCollapsed,
    userKey,
  } = usePdfStudioWorkspace({ clearSelection, commit, doc, setHistory })
  const {
    effectiveTemplateMode,
    activeTemplateName,
    openSavedWithMode,
    resetTemplateMode,
    saveTemplateWithMode,
    templateModeBanner,
    openTemplateWithFillMode,
  } = usePdfStudioTemplateMode({
    doc,
    enabled: templatesEnabled,
    exportPdf,
    openSaved,
    openTemplate,
    saveTemplate,
  })
  usePdfStudioDraftSanitizer({ mode: effectiveTemplateMode, setDraftSanitizer })
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
  const { printFilledTemplate, saveFilledTemplateCopy } =
    usePdfStudioFilledTemplateActions({
      activeTemplateName,
      doc,
      exportPdf,
      saveFilledCopy,
    })
  const { bulkDelete, bulkDuplicate, bulkRotate, exportMarked, newDoc, nudge, reorder } =
    usePdfStudioPageActions({
      clearDraft,
      clearSelection,
      commit,
      doc,
      exportPdf,
      resetTemplateMode,
      selectedCount,
      selectedIndices,
      userKey,
    })
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
  function closeTextEditor(edits: PdfTextEditorResult | null) {
    if (edits) commit((d) => applyPdfTextEditorResult(d, edits))
    setTextPage(null)
  }
  function startTemplateSave() {
    if (!templatesEnabled || empty) return
    if (!isPdfTemplate(doc)) return setTextPage(0)
    setPanelCollapsed(false)
    setSaveTemplateSignal((signal) => signal + 1)
  }
  function openTemplateDesigner() {
    if (!templatesEnabled || empty) return
    setTextPage(0)
  }
  const total = doc.pages.length
  const empty = total === 0
  const undoable = canUndo(history)
  const redoable = canRedo(history)
  const hasVisibleSaved = templatesEnabled
    ? saved.length > 0
    : saved.some((s) => !isPdfTemplate(s.doc))
  const showPanel = !empty || library.length > 0 || hasVisibleSaved
  const editBar = !empty && effectiveTemplateMode !== 'fill' && (
    <BulkBar
      context={templatesEnabled ? 'templates' : 'editor'}
      count={selectedCount}
      total={total}
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
    <section className="pdf-studio flex min-h-0 flex-1" aria-hidden={textPage !== null}>
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
        saveTemplateSignal={saveTemplateSignal}
        onOpenSaved={(saved) => {
          openSavedWithMode(saved)
          if (isSavedFilledTemplate(saved)) setTextPage(0)
        }}
        onUseTemplate={(saved) => {
          openTemplateWithFillMode(saved)
          setTextPage(0)
        }}
        onRenameSaved={renameSaved}
        onDeleteSaved={removeSaved}
        onDownloadSaved={downloadSaved}
        onDuplicateSaved={duplicateSaved}
        onExportTemplatePackage={exportTemplatePackage}
        onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {topBar}
        <div ref={setScrollRoot} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-5 pb-24 pt-6 md:px-8">
            <PdfStudioDocumentToolbar
              busy={busy}
              canSaveTemplate={templatesEnabled && !empty && isPdfTemplate(doc)}
              empty={empty}
              exportStatus={exportStatus}
              exportCompression={exportCompression}
              formsEnabled={templatesEnabled}
              pageNumbers={pageNumbers}
              redoable={redoable}
              saving={saving}
              studioMode={studioMode}
              templateMode={effectiveTemplateMode ?? 'design'}
              total={total}
              undoable={undoable}
              watermarkText={watermarkText}
              onImport={() => fileInputRef.current?.click()}
              onUndo={() => setHistory((h) => undo(h))}
              onRedo={() => setHistory((h) => redo(h))}
              onSavePdf={() => void exportPdf(doc)}
              onDownload={() => void downloadPdf(doc)}
              onDownloadFillable={() => void downloadPdf(doc, 'rellenable')}
              onCancelExport={cancelExport}
              onNewDoc={newDoc}
              onOpenOcr={() => setOcrOpen(true)}
              onInspectForms={() => void inspectForms()}
              onPrintTemplate={() =>
                void exportPdf(doc, 'planilla', { flattenFormFields: true })
              }
              onStartSaveTemplate={startTemplateSave}
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
            {templatesEnabled && effectiveTemplateMode !== 'fill' && (
              <PdfTemplateWorkflowGuide
                busy={busy}
                fieldCount={doc.formFields?.length ?? 0}
                pageCount={total}
                saving={saving}
                onAddFields={openTemplateDesigner}
                onDownloadFillable={() => void downloadPdf(doc, 'rellenable')}
                onImport={() => fileInputRef.current?.click()}
                onSaveTemplate={startTemplateSave}
              />
            )}
            {templatesEnabled && formSummary && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-ink-100 bg-paper-50/80 px-3 py-2 text-caption text-ink-600"
              >
                {formSummary}
              </div>
            )}
            {templateModeBanner}
            {templatesEnabled && (
              <PdfStudioFormPanel
                forms={forms}
                onApply={(flatten) => void applyForms(flatten)}
                onClear={clearForms}
                onChange={updateFormValue}
              />
            )}
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
            <PdfStudioMainPane
              doc={doc}
              interactionMode={pageMode({
                templatesEnabled,
                templateMode: effectiveTemplateMode,
              })}
              isTemplates={templatesEnabled}
              scrollRoot={scrollRoot}
              selectedIds={selectedIds}
              onDropFiles={onDropFiles}
              onNudge={nudge}
              onOpenText={setTextPage}
              onPickFiles={() => fileInputRef.current?.click()}
              onReorder={reorder}
              onToggleSelect={toggleSelect}
            />
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
          onSaveCopy={templatesEnabled ? saveFilledTemplateCopy : undefined}
        />
      )}
    </section>
  )
}
