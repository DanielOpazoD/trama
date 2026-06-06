import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cloneAnnotation,
  getSource,
  makeTextAnnotation,
  translateAnnotation,
  type Annotation,
  type ImageAnnotation,
  type PdfDoc,
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
import { AnnotationLayer } from './AnnotationLayer'
import { EditorToolbar } from './EditorToolbar'
import { PageCanvas } from './PageCanvas'
import { PdfTextEditorHeader } from './PdfTextEditorHeader'
import { SelectionInspector } from './SelectionInspector'
import type { SnapGuide } from './pdfAnnotationSnap'
import { usePdfTextEditorInteractions } from './usePdfTextEditorInteractions'
import { usePdfTextEditorPageRender } from './usePdfTextEditorPageRender'
import { usePdfTextEditorKeyboard } from './usePdfTextEditorKeyboard'
import { usePdfTextEditorSelection } from './usePdfTextEditorSelection'
import { defaultEditorTextStyle, resolveActiveEditorStyle } from './pdfEditorStyleState'
import { type TextStyle, type Tool } from './editorStyle'
import { createImageStampAnnotation, STAMP_ACCEPT } from './pdfImageStamp'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Editor / visor de páginas del PDF: muestra la página grande con la barra de
 * edición ARRIBA y permite **navegar entre todas las páginas** del documento sin
 * cerrar. Deja agregar/mover/ajustar cajas de texto vectorial (WYSIWYG, posición y
 * tamaño como ratios). Al confirmar entrega las anotaciones EDITADAS por página; el
 * ensamblado las dibuja con `drawText` (texto seleccionable, la página NO se
 * rasteriza). Browser-only.
 */
export function PdfTextEditor({
  doc,
  pageIndex,
  onClose,
}: {
  doc: PdfDoc
  pageIndex: number
  onClose: (edits: Record<number, Annotation[]> | null) => void
}) {
  const total = doc.pages.length
  const [currentPage, setCurrentPage] = useState(pageIndex)
  // Anotaciones EDITADAS por página (las no tocadas siguen las del doc), con
  // HISTORIAL propio → undo/redo DENTRO del modal. `edited` = presente.
  const [history, setHistory] = useState<History<Record<number, Annotation[]>>>(() =>
    initHistory({}),
  )
  const edited = history.present
  const editedRef = useRef(edited)
  editedRef.current = edited

  const page = doc.pages[currentPage]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const annotations = edited[currentPage] ?? page?.annotations ?? []

  // Texto en edición INLINE (sobre el cuadro). null = ninguno.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Herramienta activa y el rectángulo que se está dibujando (resaltador), en px
  // LOCALES de la página interior (para el preview en vivo).
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
  // Default 150%: prioriza ver/editar la página en grande (la barra es compacta).
  const [zoom, setZoom] = useState(1.5)
  const stampInputRef = useRef<HTMLInputElement>(null)
  // Atrapa el foco dentro del modal (Tab no se escapa) y lo restaura al cerrar.
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)
  // Enfoca el CONTENEDOR (tabindex -1) al abrir, no un botón → así no aparece el
  // anillo azul de `:focus-visible` (externo, con offset) sobre un control al abrir.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  // Refs para que los efectos montados una vez vean el estado actual sin re-suscribir.
  const selectedRef = useRef<string | null>(null)
  const editingRef = useRef<string | null>(null)
  editingRef.current = editingId
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage
  // Lista de anotaciones de la página actual (para que el teclado copie/corte la
  // anotación seleccionada) y portapapeles interno (copia entre páginas).
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const annClipboardRef = useRef<Annotation | null>(null)

  const { areaRef, bg, layout, resetBackground } = usePdfTextEditorPageRender({
    page,
    source,
    zoom,
  })

  /** Edición DISCRETA (agregar/borrar/estilo/flechas/…): empuja una entrada de
   *  historial. Estable (lee la página actual del ref → sirve desde efectos viejos). */
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

  /** Edición EN VIVO (durante un arrastre): reemplaza el presente SIN crear una
   *  entrada de historial (el arrastre entero = un solo undo, ver `startDrag`). */
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

  // Estilo "activo" de la barra: edita la anotación seleccionada o, si no hay,
  // define el estilo del PRÓXIMO texto/resaltado (ver `TextStyle` en editorStyle).
  const [style, setStyle] = useState<TextStyle>({
    ...defaultEditorTextStyle(),
  })
  const arrangeGeometry = layout
    ? { pageWidthPx: layout.innerW, pageHeightPx: layout.innerH }
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
      yRatio: 0.42,
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
      layout,
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
      layout,
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
      editLive,
    })

  /** Navega a otra página: deselecciona y muestra "cargando" mientras renderiza. */
  const goToPage = (i: number) => {
    if (i < 0 || i >= total || i === currentPage) return
    setSelectedId(null)
    setEditingId(null)
    resetBackground()
    setCurrentPage(i)
  }

  // Portal a <body>: el modal debe escapar de cualquier ancestro con overflow o
  // transform (el contenedor scrolleable del mundo Notas), que si no lo recorta.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar página ${currentPage + 1}`}
      onClick={() => onClose(null)}
      className="pdf-studio fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-full overflow-hidden border-x border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col focus:outline-none"
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
          onDone={() => onClose(edited)}
        />

        <EditorToolbar
          tool={tool}
          onToolChange={setTool}
          onAddText={addText}
          onAddImage={() => stampInputRef.current?.click()}
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
          zoom={zoom}
          onZoomChange={setZoom}
        />
        {selectedAnn && selectedBounds && (
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
        )}
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

        {/* Página — ocupa el resto; centrada y scrolleable al hacer zoom */}
        <PageCanvas
          areaRef={areaRef}
          layout={layout}
          bg={bg}
          zoom={zoom}
          tool={tool}
          currentPage={currentPage}
          onStartDraw={startDraw}
          onStartMarquee={startMarquee}
        >
          <AnnotationLayer
            annotations={annotations}
            innerW={layout?.innerW ?? 0}
            innerH={layout?.innerH ?? 0}
            tool={tool}
            selectedId={selectedId}
            selectedIds={operationSelectedIds}
            editingId={editingId}
            drawing={drawing}
            selectionMarquee={selectionMarquee}
            selectionLasso={selectionLasso}
            snapGuides={snapGuides}
            drawColor={style.color}
            onStartDrag={startDrag}
            onSelect={setSelectedId}
            onToggleSelect={toggleSelectedId}
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
          />
        </PageCanvas>
      </div>
    </div>,
    document.body,
  )
}
