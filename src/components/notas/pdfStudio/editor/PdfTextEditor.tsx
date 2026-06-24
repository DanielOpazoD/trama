import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type Annotation,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import {
  initHistory,
  pushHistory,
  type History,
} from '../../../../lib/pdfStudio/model/history'
import { useFocusTrap } from '../../../../hooks/useFocusTrap'
import { EditorToolbar } from './EditorToolbar'
import { PdfTextEditorHeaderSlot } from './PdfTextEditorHeaderSlot'
import { SelectionInspector } from './SelectionInspector'
import type { DrawingRect } from './AnnotationLayer'
import type { SnapGuide } from './pdfAnnotationSnap'
import { usePdfTextEditorInteractions } from './usePdfTextEditorInteractions'
import { usePdfTextEditorForms } from '../planillas/usePdfTextEditorForms'
import { usePdfTextEditorKeyboard } from './usePdfTextEditorKeyboard'
import { usePdfTextEditorSelection } from './usePdfTextEditorSelection'
import { defaultEditorTextStyle, resolveActiveEditorStyle } from './pdfEditorStyleState'
import { type TextStyle, type Tool } from './editorStyle'
import { STAMP_ACCEPT } from './pdfImageStamp'
import { PdfTextEditorStampAssetSlot } from './PdfTextEditorStampAssetSlot'
import { PdfTextEditorPageSurface } from './PdfTextEditorPageSurface'
import { usePdfTextEditorPageNavigation } from './usePdfTextEditorPageNavigation'
import { usePdfTextEditorViewport } from './usePdfTextEditorViewport'
import { PdfTextEditorFloatingFormTools } from './PdfTextEditorFloatingFormTools'
import { PdfTextEditorFillSidebar } from '../planillas/fill/PdfTextEditorFillSidebar'
import { usePdfTextEditorFormSuggestions } from '../planillas/usePdfTextEditorFormSuggestions'
import { PdfTextEditorAuxiliaryControls } from './PdfTextEditorAuxiliaryControls'
import { PdfTextEditorScrollArea } from './PdfTextEditorScrollArea'
import { pdfTextEditorDialogLabel } from './pdfTextEditorDialogMode'
import { pdfTextEditorBodyClass } from './pdfTextEditorLayoutClasses'
import { formFieldTextStyle } from '../planillas/pdfFormFieldStyle'
import { fillProgressForTemplateFields } from '../planillas/fill/pdfTemplateFillProgress'
import { usePdfTextEditorFillFocus } from '../planillas/fill/usePdfTextEditorFillFocus'
import { usePdfTextEditorFillSidebarProps } from '../planillas/fill/usePdfTextEditorFillSidebarProps'
import { usePdfTextEditorHeaderProps } from './usePdfTextEditorHeaderProps'
import { usePdfTextEditorXMarks } from './usePdfTextEditorXMarks'
import { usePdfTextEditorInsertions } from './usePdfTextEditorInsertions'
import type { PdfTextEditorProps } from './PdfTextEditorProps'

type PdfTextEditorHistory = History<Record<number, Annotation[]>>
export function PdfTextEditor({
  doc,
  pageIndex,
  detectedForms = [],
  mode = 'edit',
  templateToolsEnabled = true,
  onFormValueChange = () => undefined,
  onInspectForms,
  onClose,
  onDisplayZoomChange,
  onMailMerge,
  onPrint,
  onSaveCopy,
  sessionZoom,
  stampAssetUserKey,
}: PdfTextEditorProps) {
  const total = doc.pages.length
  const fillMode = mode === 'fill'
  const designMode = !fillMode && templateToolsEnabled
  const [currentPage, setCurrentPage] = useState(pageIndex)
  const [history, setHistory] = useState<PdfTextEditorHistory>(() => initHistory({}))
  const edited = history.present
  const editedRef = useRef(edited)
  editedRef.current = edited
  const page = doc.pages[currentPage]
  const annotations = edited[currentPage] ?? page?.annotations ?? []
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [drawing, setDrawing] = useState<DrawingRect | null>(null)
  const [selectionMarquee, setSelectionMarquee] = useState<DrawingRect | null>(null)
  const [selectionLasso, setSelectionLasso] = useState<{ x: number; y: number }[] | null>(
    null,
  )
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const {
    activeLayout,
    activeLayoutRef,
    changeZoom,
    displayZoom,
    prepareZoomAnchor,
    scrollContainerRef,
    setActivePageLayout,
    stepZoomIn,
    stepZoomOut,
    zoom,
    zoomInDisabled,
    zoomOutDisabled,
  } = usePdfTextEditorViewport(currentPage, {
    initialDisplayZoom: sessionZoom,
    onDisplayZoomChange,
  })
  // Marcas X: tamaño/grosor GLOBALES, toggle y redimensionado — fuera de este
  // archivo para mantenerlo acotado (ver usePdfTextEditorXMarks).
  const {
    xMarkSize,
    xMarkStroke,
    toggleAnnotationDisabled,
    resizeAllXMarks,
    setAllXMarkStroke,
  } = usePdfTextEditorXMarks({ doc, setHistory, activeLayout, activeLayoutRef })
  const stampInputRef = useRef<HTMLInputElement>(null)
  const backdropDownRef = useRef<{ x: number; y: number } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)
  useEffect(() => {
    dialogRef.current?.focus()
    // Calienta las fuentes del menú de estilo. Caveat ("Manuscrita") puede no
    // haberse usado aún en esta sesión: si se descargara recién al abrir el
    // menú, el reflow de la carga dispara el cierre-por-scroll del popover.
    void document.fonts?.load?.('16px Caveat')?.catch(() => {})
  }, [])
  const selectedRef = useRef<string | null>(null)
  const editingRef = useRef<string | null>(null)
  editingRef.current = editingId
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const annClipboardRef = useRef<Annotation | null>(null)
  const setAnnotations = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) =>
        pushHistory(h, {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        }),
      )
    },
    [doc],
  )
  const editLive = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) => ({
        ...h,
        present: {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        },
      }))
    },
    [doc],
  )
  const [style, setStyle] = useState<TextStyle>({ ...defaultEditorTextStyle() })
  const arrangeGeometry = activeLayout
    ? { pageWidthPx: activeLayout.innerW, pageHeightPx: activeLayout.innerH }
    : null
  const {
    selectedId,
    selectedIds: operationSelectedIds,
    selectedAnn,
    selectedBounds,
    setSelectedId,
    selectAnnotationIds,
    toggleSelectedId,
    applyStyle,
    alignSelection,
    distributeSelection,
    moveSelectionLayer,
    toggleSelectionLocked,
    updateSelectionBounds,
    groupSelection,
    ungroupSelection,
    removeAnnotation,
  } = usePdfTextEditorSelection({
    annotations,
    arrangeGeometry,
    setAnnotations,
    setStyle,
    clearEditing: () => setEditingId(null),
  })
  selectedRef.current = selectedId
  usePdfTextEditorKeyboard({
    editingRef,
    selectedRef,
    annotationsRef,
    annotationClipboardRef: annClipboardRef,
    setSelectedId,
    setEditingId,
    setHistory,
    setAnnotations,
    onClose,
  })
  const selected = selectedAnn?.kind === 'text' ? selectedAnn : null
  const update = (id: string, patch: Partial<Omit<TextAnnotation, 'id' | 'kind'>>) =>
    setAnnotations((list) =>
      list.map((a) => (a.id === id && a.kind === 'text' ? { ...a, ...patch } : a)),
    )
  const annotationStyle = resolveActiveEditorStyle(selectedAnn, style)
  const { addImageStamp, addText, duplicateImage, duplicateText, insertImageAnnotation } =
    usePdfTextEditorInsertions({
      activeLayout,
      setAnnotations,
      setEditingId,
      setSelectedId,
      setTool,
      style,
    })
  const { startDrag, startResize, startDraw, startMarquee } =
    usePdfTextEditorInteractions({
      layout: activeLayout,
      layoutRef: activeLayoutRef,
      zoom,
      tool,
      style,
      xMarkSize,
      xMarkStroke,
      editedRef,
      annotationsRef,
      setSelectedId,
      selectAnnotationIds,
      setDrawing,
      setSelectionMarquee,
      setSelectionLasso,
      setSnapGuides,
      setHistory,
      setAnnotations,
      setTool,
      editLive,
    })
  const {
    addFormField,
    addSuggestedFormFields,
    alignDraftFormFields,
    applyDraftFormValues,
    cancelPendingFormField,
    clearDraftFormValues,
    deleteDraftFormField,
    distributeDraftFormFields,
    formFields,
    chooseSignatureImage,
    applyDraftFieldStyle,
    openSignature,
    pendingFormKind,
    patchDraftFormField,
    placePendingFormField,
    selectedDraftFormField,
    saveSignatureDataUrl,
    selectedFormFieldId,
    selectedFormFieldIds,
    selectDraftFormField,
    setSignatureFile,
    setSignatureField,
    signatureField,
    signatureInputRef,
    startDraftDrag,
    startDraftResize,
    updateDraftFormValue,
  } = usePdfTextEditorForms({
    doc,
    page,
    layout: activeLayout,
    zoom,
    style,
    setTool,
    setEditingId,
    setSelectedId,
  })
  const activeStyle = selectedDraftFormField
    ? { ...annotationStyle, ...formFieldTextStyle(selectedDraftFormField) }
    : annotationStyle
  const applyEditorStyle = (patch: Partial<TextStyle>) => {
    applyStyle(patch)
    applyDraftFieldStyle(patch)
  }
  const { activatePage, goToPage, isInitialPagePositioning, syncPageFromScroll } =
    usePdfTextEditorPageNavigation({
      currentPage,
      scrollContainerRef,
      setActivePageLayout,
      setCurrentPage,
      setEditingId,
      setSelectedId,
      scrollInitialPage: true,
      total,
      zoom,
    })
  const { status: formSuggestionStatus, suggestCurrentPage } =
    usePdfTextEditorFormSuggestions({
      currentPage,
      doc,
      formFields,
      onAddSuggested: addSuggestedFormFields,
    })
  const pageIndexById = Object.fromEntries(doc.pages.map((p, i) => [p.id, i]))
  const { activeFillFieldId, jumpToFormField, setActiveFillFieldId } =
    usePdfTextEditorFillFocus({ goToPage, pageIndexById })
  const currentEdits = () => ({
    annotations: edited,
    formFields,
    settings: { ...doc.settings, xMarkSize, xMarkStroke },
  })
  const { fillSidebarProps, showFillGuides } = usePdfTextEditorFillSidebarProps({
    activeFillFieldId,
    applyDraftFormValues,
    clearDraftFormValues,
    formFields,
    jumpToFormField,
    onMailMergeRows:
      fillMode && onMailMerge ? (rows) => onMailMerge(currentEdits(), rows) : undefined,
    pageIndexById,
    setActiveFillFieldId,
    updateDraftFormValue,
  })
  // Al elegir una herramienta de dibujo (X), cancela el campo de formulario
  // pendiente para que el clic dibuje la marca en vez de colocar un casillero.
  const changeTool = (t: Tool) => {
    if (t !== 'select') cancelPendingFormField()
    setTool(t)
  }
  const fillProgress = fillProgressForTemplateFields(formFields)
  const headerProps = usePdfTextEditorHeaderProps({
    changeZoom,
    currentEdits,
    currentPage,
    displayZoom,
    fillMode,
    goToPage,
    history,
    onClose,
    onPrint,
    onSaveCopy,
    prepareZoomAnchor,
    setEditingId,
    setHistory,
    setSelectedId,
    stepZoomIn,
    stepZoomOut,
    total,
    zoomInDisabled,
    zoomOutDisabled,
  })
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pdfTextEditorDialogLabel({ currentPage, designMode, fillMode })}
      onPointerDown={(e) => {
        backdropDownRef.current =
          e.target === e.currentTarget ? { x: e.clientX, y: e.clientY } : null
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const start = backdropDownRef.current
        backdropDownRef.current = null
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 4)
          onClose(designMode ? currentEdits() : null)
      }}
      className="pdf-studio fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // focus-ring-exempt: contenedor de modal con foco programático (tabIndex={-1})
        className="relative h-full w-full max-w-[min(1360px,85vw)] overflow-hidden border-x border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col focus:outline-none"
      >
        <PdfTextEditorHeaderSlot
          changeZoom={changeZoom}
          designMode={designMode}
          displayZoom={displayZoom}
          fillMode={fillMode}
          fillProgress={fillProgress}
          headerProps={headerProps}
          onCreateTemplateField={() => addFormField('text')}
          prepareZoomAnchor={prepareZoomAnchor}
          stepZoomIn={stepZoomIn}
          stepZoomOut={stepZoomOut}
          zoomInDisabled={zoomInDisabled}
          zoomOutDisabled={zoomOutDisabled}
        />
        {!fillMode ? (
          <EditorToolbar
            context={templateToolsEnabled ? 'templateDesign' : 'editor'}
            tool={tool}
            onToolChange={changeTool}
            xMarkSize={xMarkSize}
            onXMarkSizeChange={resizeAllXMarks}
            xMarkStroke={xMarkStroke}
            onXMarkStrokeChange={setAllXMarkStroke}
            onAddText={addText}
            onAddImage={() => stampInputRef.current?.click()}
            stampAssetMenu={
              <PdfTextEditorStampAssetSlot
                layout={activeLayout}
                opacity={style.opacity ?? 1}
                onInsert={insertImageAnnotation}
                userKey={stampAssetUserKey}
              />
            }
            onAddFormField={templateToolsEnabled ? addFormField : undefined}
            onInspectForms={templateToolsEnabled ? onInspectForms : undefined}
            onSuggestFormFields={
              templateToolsEnabled ? () => void suggestCurrentPage() : undefined
            }
            activeFont={activeStyle.font}
            activeSize={activeStyle.sizeRatio}
            activeBold={activeStyle.bold}
            activeItalic={activeStyle.italic ?? false}
            activeColor={activeStyle.color}
            activeOpacity={activeStyle.opacity ?? 1}
            activeRotation={activeStyle.rotation ?? 0}
            onApplyStyle={applyEditorStyle}
            hasDuplicableSelection={
              !selectedAnn?.locked && (!!selected || selectedAnn?.kind === 'image')
            }
            duplicateLabel={
              selectedAnn?.kind === 'image' ? 'Duplicar imagen' : 'Duplicar texto'
            }
            onDuplicate={() => {
              if (selected) duplicateText(selected)
              else if (selectedAnn?.kind === 'image') duplicateImage(selectedAnn)
            }}
            hasSelection={!!selectedAnn}
            onDelete={() => selectedAnn && removeAnnotation(selectedAnn.id)}
            zoom={displayZoom}
            onPrepareZoomAnchor={prepareZoomAnchor}
            onZoomChange={changeZoom}
          />
        ) : null}
        {!fillMode && selectedAnn && selectedBounds ? (
          <SelectionInspector
            annotation={selectedAnn}
            bounds={selectedBounds}
            selectionCount={operationSelectedIds.length}
            onAlign={alignSelection}
            onDistribute={distributeSelection}
            onGroup={groupSelection}
            onUngroup={ungroupSelection}
            onLayerMove={moveSelectionLayer}
            onToggleLocked={toggleSelectionLocked}
            onBoundsChange={updateSelectionBounds}
            onColorChange={(color) => applyStyle({ color })}
            onOpacityChange={(opacity) => applyStyle({ opacity })}
          />
        ) : null}
        <PdfTextEditorFloatingFormTools
          field={fillMode ? null : selectedDraftFormField}
          activeBold={activeStyle.bold}
          activeSizeRatio={activeStyle.sizeRatio}
          selectionCount={fillMode ? 0 : selectedFormFieldIds.length}
          signatureField={signatureField}
          onAlignFields={alignDraftFormFields}
          onApplyStyle={applyEditorStyle}
          onChooseSignatureImage={chooseSignatureImage}
          onDeleteField={deleteDraftFormField}
          onDistributeFields={distributeDraftFormFields}
          onPatchField={patchDraftFormField}
          onSaveSignature={saveSignatureDataUrl}
          onSetSignatureField={setSignatureField}
          onValueChange={updateDraftFormValue}
        />
        <PdfTextEditorAuxiliaryControls
          fillMode={fillMode}
          formSuggestionStatus={formSuggestionStatus}
          pendingFormKind={Boolean(pendingFormKind)}
          signatureInputRef={signatureInputRef}
          stampAccept={STAMP_ACCEPT}
          stampInputRef={stampInputRef}
          onCancelPendingFormField={cancelPendingFormField}
          onSignatureFile={setSignatureFile}
          onStampFile={(file) => void addImageStamp(file)}
        />
        <div className={pdfTextEditorBodyClass(fillMode)}>
          {fillMode ? <PdfTextEditorFillSidebar {...fillSidebarProps} /> : null}
          <PdfTextEditorScrollArea
            fillMode={fillMode}
            onScroll={(event) => syncPageFromScroll(event.currentTarget)}
            positioning={isInitialPagePositioning}
            scrollContainerRef={scrollContainerRef}
          >
            <div className="mx-auto flex min-w-full flex-col items-center gap-4">
              {doc.pages.map((_, i) => (
                <PdfTextEditorPageSurface
                  key={doc.pages[i]!.id}
                  doc={doc}
                  pageIndex={i}
                  isActive={i === currentPage}
                  mode={fillMode ? 'fill' : designMode ? 'design' : 'edit'}
                  edited={edited}
                  zoom={zoom}
                  tool={tool}
                  selectedId={selectedId}
                  selectedIds={operationSelectedIds}
                  editingId={editingId}
                  drawing={drawing}
                  selectionMarquee={selectionMarquee}
                  selectionLasso={selectionLasso}
                  snapGuides={snapGuides}
                  drawColor={style.color}
                  detectedForms={detectedForms}
                  draftFields={formFields}
                  pendingFormKind={Boolean(pendingFormKind)}
                  activeDraftId={activeFillFieldId}
                  showFillGuides={showFillGuides}
                  selectedDraftId={selectedFormFieldId}
                  selectedDraftIds={selectedFormFieldIds}
                  onActivate={activatePage}
                  onActiveLayoutChange={setActivePageLayout}
                  onStartDraw={startDraw}
                  onStartMarquee={startMarquee}
                  onStartFormField={placePendingFormField}
                  onStartDrag={startDrag}
                  onSelectAnnotation={setSelectedId}
                  onToggleAnnotation={toggleSelectedId}
                  onToggleAnnotationDisabled={toggleAnnotationDisabled}
                  onStartEdit={(id) => {
                    setSelectedId(id)
                    setEditingId(id)
                  }}
                  onCommitText={(id, text) => {
                    update(id, { text })
                    setEditingId(null)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onStartResize={startResize}
                  onDetectedValueChange={onFormValueChange}
                  onDraftValueChange={updateDraftFormValue}
                  onDraftFocus={(field) => setActiveFillFieldId(field.id)}
                  onSelectDraft={selectDraftFormField}
                  onStartDraftDrag={startDraftDrag}
                  onStartDraftResize={startDraftResize}
                  onOpenSignature={openSignature}
                />
              ))}
            </div>
          </PdfTextEditorScrollArea>
        </div>
      </div>
    </div>,
    document.body,
  )
}
