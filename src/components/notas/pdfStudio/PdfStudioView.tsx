import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  emptyDoc,
  isPdfTemplate,
  setDocSettings,
  setDocTitle,
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
import { clearDraft } from '../../../lib/pdfStudio/render/persistence'
import { BulkBar } from './shell/BulkBar'
import { PdfDocTitleInput } from './shell/PdfDocTitleInput'
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
import { usePdfStudioSavedPdfUpload } from './shell/usePdfStudioSavedPdfUpload'
import { usePdfStudioPreview } from './shell/usePdfStudioPreview'
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
  const { cancelExport, downloadSaved, exportPdf, preparePdf, exportStatus, saving } =
    usePdfStudioExport({ compression: exportCompression })
  const { openPreview, previewModal } = usePdfStudioPreview({ preparePdf })
  const uploadSavedPdf = usePdfStudioSavedPdfUpload({ preparePdf })
  const [textPage, setTextPage] = useState<number | null>(null)
  const [editorSessionZoom, setEditorSessionZoom] = useState(1)
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
  const workspace = usePdfStudioWorkspace({
    clearSelection,
    doc,
    setHistory,
    uploadSavedPdf,
  })
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
    openPreview,
    openSaved: workspace.openSaved,
    openTemplate: workspace.openTemplate,
    saveTemplate: workspace.saveTemplate,
  })
  usePdfStudioDraftSanitizer({
    mode: effectiveTemplateMode,
    setDraftSanitizer: workspace.setDraftSanitizer,
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
  // El renombre no pasa por el historial (como los settings): renombrar no es
  // un paso de edición que se deshaga con ⌘Z.
  const updateTitle = useCallback((title: string) => {
    setHistory((h) => ({ ...h, present: setDocTitle(h.present, title) }))
  }, [])
  const { addFiles, busy } = usePdfStudioImport({
    commit,
    doc,
    onImageAssets: workspace.addAssets,
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
  const { printFilledTemplate, printMailMergeTemplate, saveFilledTemplateCopy } =
    usePdfStudioFilledTemplateActions({
      activeTemplateName,
      doc,
      openPreview,
      saveFilledCopy: workspace.saveFilledCopy,
    })
  const {
    bulkDelete,
    bulkDuplicate,
    bulkRotate,
    cropSelectedPage,
    exportMarked,
    newDoc,
    nudge,
    reorder,
  } = usePdfStudioPageActions({
    clearDraft,
    clearSelection,
    commit,
    doc,
    exportPdf,
    resetTemplateMode,
    selectedCount,
    selectedIndices,
    userKey: workspace.userKey,
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
    workspace.setPanelCollapsed(false)
    setSaveTemplateSignal((signal) => signal + 1)
  }
  const total = doc.pages.length
  const empty = total === 0
  const undoable = canUndo(history)
  const redoable = canRedo(history)
  const hasVisibleSaved = templatesEnabled
    ? workspace.saved.length > 0
    : workspace.saved.some((s) => !isPdfTemplate(s.doc))
  const canCropSelectedPage =
    selectedCount === 1 && selectedIndices[0] != null && !!doc.pages[selectedIndices[0]]
  const showPanel = !empty || hasVisibleSaved
  const editBar = !empty && effectiveTemplateMode !== 'fill' && (
    <BulkBar
      context={templatesEnabled ? 'templates' : 'editor'}
      count={selectedCount}
      total={total}
      onRotate={bulkRotate}
      onDuplicate={bulkDuplicate}
      onDelete={bulkDelete}
      onExport={exportMarked}
      onCrop={canCropSelectedPage ? () => void cropSelectedPage() : undefined}
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
        folders={workspace.folders}
        saved={workspace.saved}
        templatesEnabled={templatesEnabled}
        canSave={!empty}
        canSaveTemplate={templatesEnabled && !empty && isPdfTemplate(doc)}
        suggestedSaveName={doc.title}
        collapsed={workspace.panelCollapsed}
        onCreateFolder={workspace.createFolder}
        onRenameFolder={workspace.renameFolder}
        onUpdateFolderColor={workspace.updateFolderColor}
        onDeleteFolder={workspace.removeFolder}
        onSaveCreation={workspace.saveCreation}
        onSaveTemplate={saveTemplateWithMode}
        saveTemplateSignal={saveTemplateSignal}
        onOpenSaved={(saved) => {
          openSavedWithMode(saved)
          // Editar plantilla / abrir copia: abre el editor directo (sin doble clic).
          if (isPdfTemplate(saved.doc)) setTextPage(0)
        }}
        onUseTemplate={(saved) => {
          openTemplateWithFillMode(saved)
          setTextPage(0)
        }}
        onRenameSaved={workspace.renameSaved}
        onMoveSavedToFolder={workspace.moveSavedToFolder}
        onDeleteSaved={workspace.removeSaved}
        onDownloadSaved={downloadSaved}
        onDuplicateSaved={workspace.duplicateSaved}
        onExportTemplatePackage={workspace.exportTemplatePackage}
        onToggleCollapsed={() => workspace.setPanelCollapsed((c) => !c)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {topBar}
        <div
          ref={setScrollRoot}
          className="pdf-studio-canvas min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto max-w-5xl space-y-5 px-5 pb-24 pt-6 md:px-8">
            {!templatesEnabled && !empty && (
              <PdfDocTitleInput title={doc.title ?? ''} onCommit={updateTitle} />
            )}
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
              onSavePdf={() => void openPreview(doc)}
              // "Descargar rellenable" va por la vista previa en modal (no descarga
              // directa): Safari bloquea el a.click() tras el ensamblado async, fuera
              // del gesto del usuario. En el modal la descarga sale del click del botón
              // (gesto fresco) — el mismo camino seguro que ya usa "Guardar PDF".
              onDownloadFillable={() => void openPreview(doc, 'rellenable')}
              onCancelExport={cancelExport}
              onNewDoc={newDoc}
              onOpenOcr={() => setOcrOpen(true)}
              onInspectForms={() => void inspectForms()}
              onPrintTemplate={() =>
                void openPreview(doc, 'planilla', { flattenFormFields: true })
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
                fieldCount={doc.formFields?.length ?? 0}
                pageCount={total}
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
          onDisplayZoomChange={setEditorSessionZoom}
          onPrint={printFilledTemplate}
          onMailMerge={templatesEnabled ? printMailMergeTemplate : undefined}
          onSaveCopy={templatesEnabled ? saveFilledTemplateCopy : undefined}
          sessionZoom={editorSessionZoom}
        />
      )}
      {previewModal}
    </section>
  )
}
