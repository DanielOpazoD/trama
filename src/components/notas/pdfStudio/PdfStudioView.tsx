import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AssembleOptions } from '../../../lib/pdfStudio/assemble/assemble'
import { canRedo, canUndo, redo, undo } from '../../../lib/pdfStudio/model/history'
import { disposePdfStudio } from '../../../lib/pdfStudio/render/pdfRender'
import { clearDraft } from '../../../lib/pdfStudio/render/persistence'
import { buildPdfStudioPreflight } from '../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import { BulkBar } from './shell/BulkBar'
import { usePdfTextEditorLoader } from './editor/PdfTextEditorLazy'
import { PdfStudioTextEditorOverlay } from './PdfStudioTextEditorOverlay'
import { PdfStudioViewCanvas } from './PdfStudioViewCanvas'
import { PdfStudioWorkspacePanel } from './PdfStudioWorkspacePanel'
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
import {
  usePdfStudioDocumentHistory,
  type ExternalDocumentHistory,
} from './shell/usePdfStudioDocumentHistory'
import { usePdfStudioDocumentSettings } from './shell/usePdfStudioDocumentSettings'
import { usePdfStudioExternalFiles } from './shell/usePdfStudioExternalFiles'
import { usePdfStudioKeyboardRefs } from './shell/usePdfStudioKeyboardRefs'
import { useToast } from '../../../state'
import { usePdfStudioTemplateSaveAction } from './shell/usePdfStudioTemplateSaveAction'
import { derivePdfStudioViewLayoutState } from './PdfStudioViewModel'

export type PdfStudioMode = 'editor' | 'templates'
type PdfStudioViewProps = {
  externalFiles?: File[]
  onExternalFilesConsumed?: () => void
  topBar?: ReactNode
  studioMode?: PdfStudioMode
  /**
   * Historial del documento gobernado desde fuera. Imprenta se desmonta al
   * salir de su sección, así que sin esto el documento en curso se pierde y el
   * siguiente recorte enviado empieza uno nuevo en vez de sumar páginas.
   */
  documentHistory?: ExternalDocumentHistory
}
export function PdfStudioView({
  externalFiles = [],
  onExternalFilesConsumed,
  topBar,
  studioMode = 'editor',
  documentHistory,
}: PdfStudioViewProps) {
  const toast = useToast()
  const templatesEnabled = studioMode === 'templates'
  const [exportCompression, setExportCompression] =
    useState<AssembleOptions['compression']>('balanced')
  const { history, setHistory, doc, commit, updateSettings, updateTitle } =
    usePdfStudioDocumentHistory(documentHistory)
  const { cancelExport, downloadSaved, exportPdf, preparePdf, exportStatus, saving } =
    usePdfStudioExport({ compression: exportCompression })
  const { openPreview, previewModal } = usePdfStudioPreview({ preparePdf })
  const uploadSavedPdf = usePdfStudioSavedPdfUpload({ preparePdf })
  const [textPage, setTextPage] = useState<number | null>(null)
  const [editorSessionZoom, setEditorSessionZoom] = useState(1)
  const [saveTemplateSignal, setSaveTemplateSignal] = useState(0)
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  const {
    selectedIds,
    selectedIndices,
    selectedCount,
    toggleSelect,
    clearSelection,
    selectAll,
  } = usePageSelection(doc.pages)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workspace = usePdfStudioWorkspace({
    clearSelection,
    doc,
    setHistory,
    syncTemplatesToCloud: templatesEnabled,
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
  const { docRef, pageClipboardRef, selectedIndicesRef, selectAllRef } =
    usePdfStudioKeyboardRefs({ doc, selectedIndices, selectAll })
  const { addFiles, busy, onFileInput, onDropFiles } = usePdfStudioImport({
    commit,
    doc,
    onImageAssets: workspace.addAssets,
  })
  usePdfStudioExternalFiles({
    addFiles,
    externalFiles,
    onConsumed: onExternalFilesConsumed,
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
  const { canCropSelectedPage, canSaveTemplate, empty, showEditBar, showPanel, total } =
    derivePdfStudioViewLayoutState({
      doc,
      saved: workspace.saved,
      selectedCount,
      selectedIndices,
      templateMode: effectiveTemplateMode,
      templatesEnabled,
    })
  const openTextEditor = usePdfTextEditorLoader(!empty, setTextPage)
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
  function closeTextEditor(edits: PdfTextEditorResult | null) {
    if (edits) commit((d) => applyPdfTextEditorResult(d, edits))
    // Cancelar: el borrador local vuelve al doc confirmado (descarta autosaves vivos).
    else workspace.autosaveSnapshot(doc)
    setTextPage(null)
  }
  const startTemplateSave = usePdfStudioTemplateSaveAction({
    doc,
    empty,
    enabled: templatesEnabled,
    setPanelCollapsed: workspace.setPanelCollapsed,
    setSaveTemplateSignal,
    setTextPage,
  })
  const preflightReport = buildPdfStudioPreflight(doc, { action: 'export' })
  const undoable = canUndo(history)
  const redoable = canRedo(history)
  const editBar = showEditBar && (
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
  const {
    footerText,
    headerText,
    imagesPerPage,
    pageNumbers,
    setFooter,
    setHeader,
    setImagesPerPage,
    setPageNumbers,
    setWatermark,
    watermarkText,
  } = usePdfStudioDocumentSettings(doc, updateSettings)
  return (
    <section className="pdf-studio flex min-h-0 flex-1" aria-hidden={textPage !== null}>
      <PdfStudioWorkspacePanel
        show={showPanel}
        workspace={workspace}
        templatesEnabled={templatesEnabled}
        empty={empty}
        canSaveTemplate={canSaveTemplate}
        docTitle={doc.title}
        saveTemplateSignal={saveTemplateSignal}
        downloadSaved={downloadSaved}
        onSaveTemplate={saveTemplateWithMode}
        onOpenSavedWithMode={openSavedWithMode}
        onOpenTemplateWithFillMode={openTemplateWithFillMode}
        setTextPage={setTextPage}
      />
      <PdfStudioViewCanvas
        topBar={topBar}
        setScrollRoot={setScrollRoot}
        documentControlsProps={{
          autosaveState: workspace.autosaveState,
          doc,
          effectiveTemplateMode,
          empty,
          fileInputRef,
          formSummary,
          onFileInput,
          preflightReport,
          templatesEnabled,
          total,
          updateTitle,
          toolbarProps: {
            busy,
            canSaveTemplate,
            empty,
            exportStatus,
            exportCompression,
            formsEnabled: templatesEnabled,
            footerText,
            headerText,
            imagesPerPage,
            pageNumbers,
            redoable,
            saving,
            studioMode,
            templateMode: effectiveTemplateMode ?? 'design',
            total,
            undoable,
            watermarkText,
            onImport: () => fileInputRef.current?.click(),
            onUndo: () => setHistory((h) => undo(h)),
            onRedo: () => setHistory((h) => redo(h)),
            onSavePdf: () => void openPreview(doc),
            onDownloadFillable: () => void openPreview(doc, 'rellenable'),
            onCancelExport: cancelExport,
            onNewDoc: newDoc,
            onOpenOcr: () => setOcrOpen(true),
            onInspectForms: () => void inspectForms(),
            onPrintTemplate: () =>
              void openPreview(doc, 'planilla', { flattenFormFields: true }),
            onStartSaveTemplate: startTemplateSave,
            onSetExportCompression: setExportCompression,
            onSetFooter: setFooter,
            onSetHeader: setHeader,
            onSetImagesPerPage: setImagesPerPage,
            onSetPageNumbers: setPageNumbers,
            onSetWatermark: setWatermark,
          },
        }}
        templateModeBanner={templateModeBanner}
        formPanelProps={
          templatesEnabled
            ? {
                forms,
                onApply: (flatten) => void applyForms(flatten),
                onClear: clearForms,
                onChange: updateFormValue,
              }
            : null
        }
        ocrPanelProps={
          ocrOpen
            ? {
                disabled: empty || saving || busy,
                doc,
                language: ocrLanguage,
                running: ocrRunning,
                status: ocrStatus,
                totalPages: total,
                onCancel: cancelOcr,
                onChangeLanguage: setOcrLanguage,
                onRun: () => void startOcr(doc),
              }
            : null
        }
        editBar={editBar}
        mainPaneProps={{
          doc,
          interactionMode: pageMode({
            templatesEnabled,
            templateMode: effectiveTemplateMode,
          }),
          isTemplates: templatesEnabled,
          scrollRoot,
          selectedIds,
          onDropFiles,
          onNudge: nudge,
          onOpenText: openTextEditor,
          onPickFiles: () => fileInputRef.current?.click(),
          onReorder: reorder,
          onToggleSelect: toggleSelect,
        }}
      />
      <PdfStudioTextEditorOverlay
        doc={doc}
        pageIndex={textPage}
        detectedForms={forms}
        templateMode={effectiveTemplateMode}
        templateToolsEnabled={templatesEnabled}
        onFormValueChange={updateFormValue}
        onInspectForms={templatesEnabled ? () => void inspectForms() : undefined}
        onAutosave={(edits) =>
          workspace.autosaveSnapshot(applyPdfTextEditorResult(doc, edits))
        }
        autosaveState={workspace.autosaveState}
        onClose={closeTextEditor}
        onDisplayZoomChange={setEditorSessionZoom}
        onPrint={printFilledTemplate}
        onMailMerge={templatesEnabled ? printMailMergeTemplate : undefined}
        onSaveCopy={templatesEnabled ? saveFilledTemplateCopy : undefined}
        sessionZoom={editorSessionZoom}
        stampAssetUserKey={workspace.userKey}
      />
      {previewModal}
    </section>
  )
}
