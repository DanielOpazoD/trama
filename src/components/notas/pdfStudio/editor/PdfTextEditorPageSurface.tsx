import { useEffect, type PointerEvent as ReactPointerEvent } from 'react'
import {
  getSource,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type PdfDoc,
  type PdfFormFieldDraft,
  type RedactionAnnotation,
  type ShapeAnnotation,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import type {
  PageLayout,
  ResizeHandle,
} from '../../../../lib/pdfStudio/model/editorGeometry'
import { AnnotationLayer, type DrawingRect } from './AnnotationLayer'
import { PageCanvas } from '../pages/PageCanvas'
import type { SnapGuide } from './pdfAnnotationSnap'
import { type DetectedPdfFormForCanvas } from '../planillas/pdfFormVisualMapping'
import { usePdfTextEditorPageRender } from './usePdfTextEditorPageRender'
import type { Tool } from './editorStyle'
import { PdfTextEditorPageFormLayer } from './PdfTextEditorPageFormLayer'
import { pdfTextEditorPageSurfacePermissions } from './PdfTextEditorPageSurfaceModel'
type ResizableAnnotation =
  | TextAnnotation
  | HighlightAnnotation
  | RedactionAnnotation
  | ImageAnnotation
  | ShapeAnnotation
export function PdfTextEditorPageSurface({
  doc,
  pageIndex,
  isActive,
  mode = 'edit',
  edited,
  zoom,
  tool,
  selectedId,
  selectedIds,
  editingId,
  drawing,
  selectionMarquee,
  selectionLasso,
  snapGuides,
  formSnapGuides = [],
  drawColor,
  detectedForms,
  draftFields,
  pendingFormKind,
  placementPreviewBox = null,
  activeDraftId,
  showFillGuides,
  selectedDraftId,
  selectedDraftIds,
  onActivate,
  onActiveLayoutChange,
  onStartDraw,
  onStartMarquee,
  onStartFormField,
  onStartDrag,
  onStartResize,
  onSelectAnnotation,
  onToggleAnnotation,
  onToggleAnnotationDisabled,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onDetectedValueChange,
  onDraftValueChange,
  onDraftFocus,
  onOpenSignature,
  onSelectDraft,
  onStartDraftDrag,
  onStartDraftResize,
}: {
  doc: PdfDoc
  pageIndex: number
  isActive: boolean
  mode?: 'edit' | 'design' | 'fill'
  edited: Record<number, Annotation[]>
  zoom: number
  tool: Tool
  selectedId: string | null
  selectedIds: string[]
  editingId: string | null
  drawing: DrawingRect | null
  selectionMarquee: DrawingRect | null
  selectionLasso: { x: number; y: number }[] | null
  snapGuides: SnapGuide[]
  formSnapGuides?: SnapGuide[]
  drawColor: string
  detectedForms: DetectedPdfFormForCanvas[]
  draftFields: PdfFormFieldDraft[]
  pendingFormKind: boolean
  /** Caja del casillero pendiente: activa el fantasma de colocación. */
  placementPreviewBox?: { wRatio: number; hRatio: number } | null
  activeDraftId?: string | null
  showFillGuides?: boolean
  selectedDraftId: string | null
  selectedDraftIds: string[]
  onActivate: (pageIndex: number) => void
  onActiveLayoutChange: (layout: PageLayout | null) => void
  onStartDraw: (event: ReactPointerEvent) => void
  onStartMarquee: (event: ReactPointerEvent) => void
  onStartFormField: (
    event: ReactPointerEvent,
    page: NonNullable<PdfDoc['pages'][number]>,
    layout: PageLayout | null,
  ) => void
  onStartDrag: (event: ReactPointerEvent, annotation: Annotation) => void
  onStartResize: (
    event: ReactPointerEvent,
    annotation: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
  onSelectAnnotation: (id: string) => void
  onToggleAnnotation: (id: string) => void
  onToggleAnnotationDisabled: (pageIndex: number, id: string) => void
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onDraftFocus?: (field: PdfFormFieldDraft) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
  onSelectDraft: (id: string, additive?: boolean) => void
  onStartDraftDrag: (event: ReactPointerEvent, field: PdfFormFieldDraft) => void
  onStartDraftResize: (
    event: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) => void
}) {
  const page = doc.pages[pageIndex]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const { areaRef, bg, layout } = usePdfTextEditorPageRender({ page, source, zoom })
  const annotations = edited[pageIndex] ?? page?.annotations ?? []
  const { canEditAnnotations, canToggleXMarks, fillMode } =
    pdfTextEditorPageSurfacePermissions(mode)
  useEffect(() => {
    if (isActive) onActiveLayoutChange(layout)
  }, [isActive, layout, onActiveLayoutChange])
  if (!page) return null
  const syncActiveLayout = () => onActiveLayoutChange(layout)
  const withActiveLayout =
    <Args extends unknown[]>(fn: (...args: Args) => void) =>
    (...args: Args) => {
      syncActiveLayout()
      fn(...args)
    }
  const activatePointer = (event: ReactPointerEvent) => {
    event.stopPropagation()
    onActivate(pageIndex)
  }
  const activateAndStartFormField = (event: ReactPointerEvent) => {
    onActivate(pageIndex)
    syncActiveLayout()
    onStartFormField(event, page, layout)
  }
  const startDraw = withActiveLayout(onStartDraw)
  const startFormField = (event: ReactPointerEvent) => {
    syncActiveLayout()
    onStartFormField(event, page, layout)
  }
  const startMarquee = withActiveLayout(onStartMarquee)
  const startDrag = withActiveLayout(onStartDrag)
  const startResize = withActiveLayout(onStartResize)
  const startDraftDrag = withActiveLayout(onStartDraftDrag)
  const startDraftResize = withActiveLayout(onStartDraftResize)
  const activateAndSelect = (id: string) => {
    onActivate(pageIndex)
    onSelectAnnotation(id)
  }
  const activateAndToggle = (id: string) => {
    onActivate(pageIndex)
    onToggleAnnotation(id)
  }
  const activateAndEdit = (id: string) => {
    onActivate(pageIndex)
    onStartEdit(id)
  }
  return (
    <section data-pdf-editor-page={pageIndex} className="w-full">
      <PageCanvas
        areaRef={areaRef}
        layout={layout}
        bg={bg}
        zoom={zoom}
        tool={isActive ? tool : 'select'}
        currentPage={pageIndex}
        scrollContainer={false}
        placingFormField={!fillMode && pendingFormKind}
        onStartFormField={
          !fillMode && pendingFormKind
            ? isActive
              ? startFormField
              : activateAndStartFormField
            : activatePointer
        }
        onStartDraw={canEditAnnotations && isActive ? startDraw : activatePointer}
        onStartMarquee={canEditAnnotations && isActive ? startMarquee : activatePointer}
      >
        <AnnotationLayer
          annotations={annotations}
          innerW={layout?.innerW ?? 0}
          innerH={layout?.innerH ?? 0}
          tool={isActive ? tool : 'select'}
          readOnly={!canEditAnnotations}
          selectedId={canEditAnnotations && isActive ? selectedId : null}
          selectedIds={canEditAnnotations && isActive ? selectedIds : []}
          editingId={canEditAnnotations && isActive ? editingId : null}
          zoom={zoom}
          drawing={canEditAnnotations && isActive ? drawing : null}
          selectionMarquee={canEditAnnotations && isActive ? selectionMarquee : null}
          selectionLasso={canEditAnnotations && isActive ? selectionLasso : null}
          snapGuides={canEditAnnotations && isActive ? snapGuides : []}
          drawColor={drawColor}
          onStartDrag={canEditAnnotations && isActive ? startDrag : activatePointer}
          onSelect={activateAndSelect}
          onToggleSelect={activateAndToggle}
          xToggleEnabled={canToggleXMarks}
          onToggleDisabled={
            canToggleXMarks
              ? (id) => {
                  onActivate(pageIndex)
                  onToggleAnnotationDisabled(pageIndex, id)
                }
              : undefined
          }
          onStartEdit={activateAndEdit}
          onCommitText={onCommitText}
          onCancelEdit={onCancelEdit}
          onStartResize={canEditAnnotations && isActive ? startResize : activatePointer}
        />
        <PdfTextEditorPageFormLayer
          activeDraftId={activeDraftId}
          detectedForms={detectedForms}
          draftFields={draftFields}
          formSnapGuides={formSnapGuides}
          isActive={isActive}
          layout={layout}
          mode={mode}
          onActivate={onActivate}
          onDetectedValueChange={onDetectedValueChange}
          onDraftFocus={onDraftFocus}
          onDraftValueChange={onDraftValueChange}
          onOpenSignature={onOpenSignature}
          onSelectDraft={onSelectDraft}
          onStartDraftDrag={startDraftDrag}
          onStartDraftResize={startDraftResize}
          page={page}
          pageIndex={pageIndex}
          placementPreviewBox={pendingFormKind ? placementPreviewBox : null}
          selectedDraftId={selectedDraftId}
          selectedDraftIds={selectedDraftIds}
          showFillGuides={showFillGuides}
          zoom={zoom}
        />
      </PageCanvas>
    </section>
  )
}
