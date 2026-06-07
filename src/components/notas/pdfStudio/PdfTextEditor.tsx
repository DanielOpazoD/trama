import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cloneAnnotation,
  makeTextAnnotation,
  translateAnnotation,
  type Annotation,
  type ImageAnnotation,
  type PdfDoc,
  type PdfFormFieldDraft,
  type TextAnnotation,
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
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { EditorToolbar } from './EditorToolbar'
import { PdfTextEditorHeader } from './PdfTextEditorHeader'
import { SelectionInspector } from './SelectionInspector'
import type { SnapGuide } from './pdfAnnotationSnap'
import { usePdfTextEditorInteractions } from './usePdfTextEditorInteractions'
import { usePdfTextEditorForms } from './usePdfTextEditorForms'
import { usePdfTextEditorKeyboard } from './usePdfTextEditorKeyboard'
import { usePdfTextEditorSelection } from './usePdfTextEditorSelection'
import { defaultEditorTextStyle, resolveActiveEditorStyle } from './pdfEditorStyleState'
import { type TextStyle, type Tool } from './editorStyle'
import { createImageStampAnnotation, STAMP_ACCEPT } from './pdfImageStamp'
import { PdfTextEditorPageSurface } from './PdfTextEditorPageSurface'
import { type DetectedPdfFormForCanvas } from './pdfFormVisualMapping'
import { usePdfTextEditorPageNavigation } from './usePdfTextEditorPageNavigation'
import { usePdfTextEditorViewport } from './usePdfTextEditorViewport'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const FORM_ACCEPT = 'image/png,image/jpeg,image/webp'
export type PdfTextEditorResult = {
  annotations: Record<number, Annotation[]>
  formFields: PdfFormFieldDraft[]
}
export function PdfTextEditor({
  doc,
  pageIndex,
  detectedForms = [],
  mode = 'edit',
  templateToolsEnabled = true,
  onFormValueChange = () => undefined,
  onInspectForms,
  onClose,
  onPrint,
}: {
  doc: PdfDoc
  pageIndex: number
  detectedForms?: DetectedPdfFormForCanvas[]
  mode?: 'edit' | 'fill'
  templateToolsEnabled?: boolean
  onFormValueChange?: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onInspectForms?: () => void
  onClose: (edits: PdfTextEditorResult | null) => void
  onPrint?: (edits: PdfTextEditorResult) => void
}) {
  const total = doc.pages.length
  const fillMode = mode === 'fill'
  const [currentPage, setCurrentPage] = useState(pageIndex)
  const [history, setHistory] = useState<History<Record<number, Annotation[]>>>(() =>
    initHistory({}),
  )
  const edited = history.present
  const editedRef = useRef(edited)
  editedRef.current = edited

  const page = doc.pages[currentPage]
  const annotations = edited[currentPage] ?? page?.annotations ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [drawing, setDrawing] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [selectionMarquee, setSelectionMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
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
  } = usePdfTextEditorViewport(currentPage)
  const stampInputRef = useRef<HTMLInputElement>(null)
  const backdropDownRef = useRef<{ x: number; y: number } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)
  useEffect(() => {
    dialogRef.current?.focus()
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

  const [style, setStyle] = useState<TextStyle>({
    ...defaultEditorTextStyle(),
  })
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

  // La anotación seleccionada de CUALQUIER tipo (para color/opacidad/borrar) y, si
  // es texto, estrechada (para los controles de sólo-texto y la edición inline).
  const selected = selectedAnn?.kind === 'text' ? selectedAnn : null
  const update = (id: string, patch: Partial<Omit<TextAnnotation, 'id' | 'kind'>>) =>
    setAnnotations((list) =>
      list.map((a) => (a.id === id && a.kind === 'text' ? { ...a, ...patch } : a)),
    )
  const activeStyle = resolveActiveEditorStyle(selectedAnn, style)
  const activeFont = activeStyle.font
  const activeSize = activeStyle.sizeRatio
  const activeBold = activeStyle.bold
  const activeColor = activeStyle.color
  const activeOpacity = activeStyle.opacity ?? 1
  const activeRotation = activeStyle.rotation ?? 0

  function addText() {
    const a = makeTextAnnotation({
      text: 'Texto',
      xRatio: 0.2,
      yRatio: 0.2,
      wRatio: 0.24,
      hRatio: Math.max(0.055, style.sizeRatio * 1.7),
      sizeRatio: style.sizeRatio,
      color: style.color,
      font: style.font,
      bold: style.bold,
      opacity: style.opacity,
      rotation: style.rotation,
    })
    setTool('select')
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
    setEditingId(a.id) // se edita inline, sobre el cuadro, al toque
  }

  async function addImageStamp(file: File) {
    const a = await createImageStampAnnotation({
      file,
      layout: activeLayout,
      opacity: style.opacity,
    })
    if (!a) return
    setTool('select')
    setEditingId(null)
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
  }

  /** Duplica un texto con un pequeño offset y lo selecciona. */
  function duplicate(a: TextAnnotation) {
    const { id: _id, kind: _kind, ...rest } = a
    const copy = makeTextAnnotation({
      ...rest,
      xRatio: clamp01(a.xRatio + 0.03),
      yRatio: clamp01(a.yRatio + 0.03),
    })
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  function duplicateImage(a: ImageAnnotation) {
    const copy = translateAnnotation(cloneAnnotation(a), 0.03, 0.03)
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  const { startDrag, startResize, startDraw, startMarquee } =
    usePdfTextEditorInteractions({
      layout: activeLayout,
      layoutRef: activeLayoutRef,
      zoom,
      tool,
      style,
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
    deleteDraftFormField,
    formFields,
    chooseSignatureImage,
    openSignature,
    pendingFormKind,
    patchDraftFormField,
    placePendingFormField,
    selectedDraftFormField,
    saveSignatureDataUrl,
    selectedFormFieldId,
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
    setTool,
    setEditingId,
    setSelectedId,
  })
  const { activatePage, goToPage } = usePdfTextEditorPageNavigation({
    currentPage,
    setActivePageLayout,
    setCurrentPage,
    setEditingId,
    setSelectedId,
    total,
  })

  // Portal a <body>: el modal debe escapar de cualquier ancestro con overflow o
  // transform (el contenedor scrolleable del mundo Notas), que si no lo recorta.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fillMode ? 'Rellenar planilla' : `Editar página ${currentPage + 1}`}
      onPointerDown={(e) => {
        backdropDownRef.current =
          e.target === e.currentTarget ? { x: e.clientX, y: e.clientY } : null
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const start = backdropDownRef.current
        backdropDownRef.current = null
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 4)
          onClose(null)
      }}
      className="pdf-studio fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[min(1360px,85vw)] overflow-hidden border-x border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col focus:outline-none"
      >
        <PdfTextEditorHeader
          currentPage={currentPage}
          total={total}
          undoable={canUndo(history)}
          redoable={canRedo(history)}
          onPrevPage={() => goToPage(currentPage - 1)}
          onNextPage={() => goToPage(currentPage + 1)}
          onUndo={() => {
            setSelectedId(null)
            setEditingId(null)
            setHistory(undo)
          }}
          onRedo={() => {
            setSelectedId(null)
            setEditingId(null)
            setHistory(redo)
          }}
          onCancel={() => onClose(null)}
          onDone={() => onClose({ annotations: edited, formFields })}
          onPrint={
            fillMode ? () => onPrint?.({ annotations: edited, formFields }) : undefined
          }
          primaryLabel={fillMode ? 'Guardar' : 'Listo'}
          showHistory={!fillMode}
          title={fillMode ? 'Rellenar planilla' : undefined}
          onPrepareZoomAnchor={fillMode ? prepareZoomAnchor : undefined}
          onZoomIn={fillMode ? stepZoomIn : undefined}
          onZoomOut={fillMode ? stepZoomOut : undefined}
          onZoomChange={fillMode ? changeZoom : undefined}
          zoom={fillMode ? displayZoom : undefined}
          zoomInDisabled={zoomInDisabled}
          zoomOutDisabled={zoomOutDisabled}
        />
        {!fillMode ? (
          <EditorToolbar
            tool={tool}
            onToolChange={setTool}
            onAddText={addText}
            onAddImage={() => stampInputRef.current?.click()}
            onAddFormField={templateToolsEnabled ? addFormField : undefined}
            onInspectForms={templateToolsEnabled ? onInspectForms : undefined}
            activeFont={activeFont}
            activeSize={activeSize}
            activeBold={activeBold}
            activeColor={activeColor}
            activeOpacity={activeOpacity}
            activeRotation={activeRotation}
            onApplyStyle={applyStyle}
            hasDuplicableSelection={
              !selectedAnn?.locked && (!!selected || selectedAnn?.kind === 'image')
            }
            duplicateLabel={
              selectedAnn?.kind === 'image' ? 'Duplicar imagen' : 'Duplicar texto'
            }
            onDuplicate={() => {
              if (selected) duplicate(selected)
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
        {!fillMode ? (
          <input
            ref={stampInputRef}
            type="file"
            accept={STAMP_ACCEPT}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void addImageStamp(file)
            }}
          />
        ) : null}
        <input
          ref={signatureInputRef}
          type="file"
          accept={FORM_ACCEPT}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) setSignatureFile(file)
          }}
        />
        {!fillMode && pendingFormKind && (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-[color:var(--accent-sage)]/20 bg-[color:var(--accent-sage-soft)]/45 px-3 py-1.5 text-caption text-[color:var(--accent-sage)]"
          >
            Haz clic en la página para colocar el casillero especial.
          </div>
        )}

        <div
          data-pdf-editor-scroll
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-auto bg-ink-100/30 px-3 py-4 [overflow-anchor:none]"
        >
          <div className="mx-auto flex min-w-full flex-col items-center gap-4">
            {doc.pages.map((_, i) => (
              <PdfTextEditorPageSurface
                key={doc.pages[i]!.id}
                doc={doc}
                pageIndex={i}
                isActive={i === currentPage}
                mode={mode}
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
                selectedDraftField={selectedDraftFormField}
                selectedDraftId={selectedFormFieldId}
                signatureField={signatureField}
                onActivate={activatePage}
                onActiveLayoutChange={setActivePageLayout}
                onStartDraw={startDraw}
                onStartMarquee={startMarquee}
                onStartFormField={placePendingFormField}
                onStartDrag={startDrag}
                onSelectAnnotation={setSelectedId}
                onToggleAnnotation={toggleSelectedId}
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
                onChooseSignatureImage={chooseSignatureImage}
                onDeleteDraft={deleteDraftFormField}
                onDetectedValueChange={onFormValueChange}
                onDraftPatch={patchDraftFormField}
                onDraftValueChange={updateDraftFormValue}
                onSelectDraft={selectDraftFormField}
                onSetSignatureField={setSignatureField}
                onStartDraftDrag={startDraftDrag}
                onStartDraftResize={startDraftResize}
                onOpenSignature={openSignature}
                onSaveSignature={saveSignatureDataUrl}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
