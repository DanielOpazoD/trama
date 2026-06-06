import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  baselineDropEm,
  isTextAnnotation,
  previewFontFamily,
  TEXT_LINE_HEIGHT,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type ShapeAnnotation,
  type ShapeKind,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import { rectFromPoints, type ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { EditableBox } from './EditableBox'
import { SelectionMarqueePreview } from './SelectionMarqueePreview'
import { ShapeStroke } from './AnnotationShapeStroke'
import {
  ACCENT,
  HIGHLIGHT_OPACITY,
  HIT_X,
  HIT_Y,
  hexToRgba,
  isShapeTool,
  type Tool,
} from './editorStyle'
import type { SnapGuide } from './pdfAnnotationSnap'

export type DrawingRect = { x0: number; y0: number; x1: number; y1: number }

export function AnnotationLayer({
  annotations,
  innerW,
  innerH,
  tool,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  editingId,
  drawing,
  selectionMarquee,
  snapGuides = [],
  drawColor,
  onStartDrag,
  onSelect,
  onToggleSelect,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onStartResize,
}: {
  annotations: Annotation[]
  /** Ancho/alto en px de la página nativa (para el viewBox del SVG de formas y el
   *  tamaño de letra). */
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selectedIds?: string[]
  editingId: string | null
  drawing: DrawingRect | null
  selectionMarquee?: DrawingRect | null
  snapGuides?: SnapGuide[]
  /** Color del resaltado en curso (para el preview punteado). */
  drawColor: string
  onStartDrag: (e: ReactPointerEvent, a: Annotation) => void
  onSelect: (id: string) => void
  onToggleSelect?: (id: string) => void
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
  onStartResize: (
    e: ReactPointerEvent,
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const selectedSet = new Set(selectedIds)
  const isSelected = (id: string) => selectedSet.has(id) || selectedId === id
  const selectFromClick = (e: ReactMouseEvent, id: string) => {
    e.stopPropagation()
    if ((e.metaKey || e.ctrlKey || e.shiftKey) && onToggleSelect) {
      onToggleSelect(id)
      return
    }
    onSelect(id)
  }
  const startDragFromPointer = (e: ReactPointerEvent, annotation: Annotation) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.stopPropagation()
      return
    }
    onStartDrag(e, annotation)
  }

  return (
    <>
      {snapGuides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.ratio}`}
          aria-hidden="true"
          data-pdf-snap-guide={guide.axis}
          className="pointer-events-none absolute z-20 bg-[color:var(--accent-sage)]/70"
          style={
            guide.axis === 'x'
              ? {
                  left: `${guide.ratio * 100}%`,
                  top: 0,
                  width: 1,
                  height: '100%',
                  transform: 'translateX(-50%)',
                }
              : {
                  left: 0,
                  top: `${guide.ratio * 100}%`,
                  width: '100%',
                  height: 1,
                  transform: 'translateY(-50%)',
                }
          }
        />
      ))}

      {annotations.filter(isTextAnnotation).map((a) => {
        const sz = a.sizeRatio * innerH
        // Estilo compartido por el cuadro display y el editable. El padding
        // transparente (compensado por el margen negativo) agranda el blanco
        // clickeable SIN mover el texto; el pivote de rotación queda en la
        // baseline-izquierda real del texto.
        const boxStyle: CSSProperties = {
          position: 'absolute',
          left: `${a.xRatio * 100}%`,
          top: `${a.yRatio * 100}%`,
          ...(typeof a.wRatio === 'number' ? { width: `${a.wRatio * 100}%` } : null),
          ...(typeof a.hRatio === 'number' ? { height: `${a.hRatio * 100}%` } : null),
          margin: `-${HIT_Y}px -${HIT_X}px`,
          padding: `${HIT_Y}px ${HIT_X}px`,
          fontFamily: previewFontFamily(a.font),
          fontWeight: a.bold ? 700 : 400,
          fontSize: `${sz}px`,
          lineHeight: TEXT_LINE_HEIGHT,
          color: a.color,
          opacity: a.opacity ?? 1,
          transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
          transformOrigin: `${HIT_X}px ${HIT_Y + sz * baselineDropEm(a.font)}px`,
          whiteSpace:
            typeof a.wRatio === 'number' && typeof a.hRatio === 'number'
              ? 'pre-wrap'
              : 'pre',
          overflow:
            typeof a.wRatio === 'number' && typeof a.hRatio === 'number'
              ? 'hidden'
              : undefined,
          overflowWrap: 'break-word',
          borderRadius: 3,
        }
        if (editingId === a.id) {
          return (
            <EditableBox
              key={a.id}
              initial={a.text}
              style={boxStyle}
              onCommit={(text) => onCommitText(a.id, text)}
              onCancel={onCancelEdit}
            />
          )
        }
        return (
          <div key={a.id}>
            <div
              onPointerDown={(e) => startDragFromPointer(e, a)}
              // Click selecciona ESTE (no llega al fondo, que deselecciona).
              onClick={(e) => {
                selectFromClick(e, a.id)
              }}
              // Doble clic edita el texto INLINE, sobre el cuadro.
              onDoubleClick={(e) => {
                e.stopPropagation()
                onStartEdit(a.id)
              }}
              title="Doble clic para editar · arrastra para mover"
              style={{
                ...boxStyle,
                cursor: a.locked ? 'default' : 'move',
                userSelect: 'none',
                touchAction: 'none',
                // Fuera de "seleccionar" no captura (deja dibujar encima).
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline: isSelected(a.id)
                  ? `1.5px solid ${ACCENT}`
                  : '1.5px solid transparent',
                outlineOffset: 0,
                transition: 'outline-color 120ms ease',
              }}
            >
              {a.text || ' '}
            </div>
            <AnnotationResizeHandles
              annotation={a}
              innerW={innerW}
              innerH={innerH}
              selectedId={selectedId}
              tool={tool}
              onStartResize={onStartResize}
            />
          </div>
        )
      })}

      {/* Resaltados (rectángulos translúcidos) */}
      {annotations
        .filter((a) => a.kind === 'highlight')
        .map((a) => (
          <div key={a.id}>
            <div
              onPointerDown={
                tool === 'select' ? (e) => startDragFromPointer(e, a) : undefined
              }
              onClick={
                tool === 'select'
                  ? (e) => {
                      selectFromClick(e, a.id)
                    }
                  : undefined
              }
              title="Arrastra para mover"
              style={{
                position: 'absolute',
                left: `${a.xRatio * 100}%`,
                top: `${a.yRatio * 100}%`,
                width: `${a.wRatio * 100}%`,
                height: `${a.hRatio * 100}%`,
                backgroundColor: hexToRgba(a.color, a.opacity ?? HIGHLIGHT_OPACITY),
                borderRadius: 2,
                cursor: a.locked ? 'default' : 'move',
                touchAction: 'none',
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline: isSelected(a.id) ? `1.5px solid ${ACCENT}` : 'none',
                outlineOffset: 1,
              }}
            />
            <AnnotationResizeHandles
              annotation={a}
              innerW={innerW}
              innerH={innerH}
              selectedId={selectedId}
              tool={tool}
              onStartResize={onStartResize}
            />
          </div>
        ))}

      {/* Imágenes estampadas (firma/sello/logo) */}
      {annotations
        .filter((a) => a.kind === 'image')
        .map((a) => (
          <div key={a.id}>
            <img
              src={a.src}
              alt="Imagen estampada"
              onPointerDown={
                tool === 'select' ? (e) => startDragFromPointer(e, a) : undefined
              }
              onClick={
                tool === 'select'
                  ? (e) => {
                      selectFromClick(e, a.id)
                    }
                  : undefined
              }
              title="Imagen estampada · arrastra para mover"
              style={{
                position: 'absolute',
                left: `${a.xRatio * 100}%`,
                top: `${a.yRatio * 100}%`,
                width: `${a.wRatio * 100}%`,
                height: `${a.hRatio * 100}%`,
                opacity: a.opacity ?? 1,
                objectFit: 'contain',
                cursor: a.locked ? 'default' : 'move',
                touchAction: 'none',
                userSelect: 'none',
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline: isSelected(a.id) ? `1.5px solid ${ACCENT}` : 'none',
                outlineOffset: 2,
              }}
            />
            <AnnotationResizeHandles
              annotation={a}
              innerW={innerW}
              innerH={innerH}
              selectedId={selectedId}
              tool={tool}
              onStartResize={onStartResize}
            />
          </div>
        ))}

      {/* Formas vectoriales sobre la página, en coords nativas vía viewBox. */}
      {(annotations.some((a) => a.kind === 'shape') ||
        (drawing && isShapeTool(tool))) && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${Math.max(1, innerW)} ${Math.max(1, innerH)}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          {annotations
            .filter((a): a is ShapeAnnotation => a.kind === 'shape')
            .map((a) => {
              const p0 = { x: a.x0Ratio * innerW, y: a.y0Ratio * innerH }
              const p1 = { x: a.x1Ratio * innerW, y: a.y1Ratio * innerH }
              const sw = Math.max(0.5, a.strokeRatio * innerH)
              const x = Math.min(p0.x, p1.x)
              const y = Math.min(p0.y, p1.y)
              const w = Math.abs(p1.x - p0.x)
              const hh = Math.abs(p1.y - p0.y)
              const sel = isSelected(a.id)
              const interactive = tool === 'select'
              const pe: CSSProperties['pointerEvents'] =
                a.shape === 'rect' || a.shape === 'oval' ? 'all' : 'stroke'
              const hit = {
                onPointerDown: (e: ReactPointerEvent) => startDragFromPointer(e, a),
                onClick: (e: ReactMouseEvent) => {
                  selectFromClick(e, a.id)
                },
                style: {
                  cursor: a.locked ? 'default' : 'move',
                  pointerEvents: pe,
                } as CSSProperties,
              }
              return (
                <g key={a.id}>
                  <ShapeStroke
                    shape={a.shape}
                    p0={p0}
                    p1={p1}
                    color={a.color}
                    sw={sw}
                    opacity={a.opacity ?? 1}
                  />
                  {interactive &&
                    (a.shape === 'rect' ? (
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={hh}
                        fill="transparent"
                        stroke="transparent"
                        strokeWidth={Math.max(sw, 10)}
                        {...hit}
                      />
                    ) : a.shape === 'oval' ? (
                      <ellipse
                        cx={x + w / 2}
                        cy={y + hh / 2}
                        rx={w / 2}
                        ry={hh / 2}
                        fill="transparent"
                        stroke="transparent"
                        strokeWidth={Math.max(sw, 10)}
                        {...hit}
                      />
                    ) : (
                      <line
                        x1={p0.x}
                        y1={p0.y}
                        x2={p1.x}
                        y2={p1.y}
                        stroke="transparent"
                        strokeWidth={Math.max(sw, 14)}
                        {...hit}
                      />
                    ))}
                  {sel && (
                    <rect
                      x={x - 3}
                      y={y - 3}
                      width={w + 6}
                      height={hh + 6}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      style={{ stroke: ACCENT, pointerEvents: 'none' }}
                    />
                  )}
                </g>
              )
            })}
          {drawing && isShapeTool(tool) && (
            <ShapeStroke
              shape={tool as ShapeKind}
              p0={{ x: drawing.x0, y: drawing.y0 }}
              p1={{ x: drawing.x1, y: drawing.y1 }}
              color={drawColor}
              sw={Math.max(0.5, 0.004 * innerH)}
              opacity={0.9}
            />
          )}
        </svg>
      )}

      {annotations
        .filter((a): a is ShapeAnnotation => a.kind === 'shape')
        .map((a) => (
          <div key={`${a.id}-shape-handles`}>
            <AnnotationResizeHandles
              annotation={a}
              innerW={innerW}
              innerH={innerH}
              selectedId={selectedId}
              tool={tool}
              onStartResize={onStartResize}
            />
          </div>
        ))}

      {drawing &&
        tool === 'highlight' &&
        (() => {
          const r = rectFromPoints(drawing.x0, drawing.y0, drawing.x1, drawing.y1)
          return (
            <div
              style={{
                position: 'absolute',
                left: r.x,
                top: r.y,
                width: r.w,
                height: r.h,
                backgroundColor: hexToRgba(drawColor, HIGHLIGHT_OPACITY),
                border: `1px dashed ${ACCENT}`,
                borderRadius: 2,
                pointerEvents: 'none',
              }}
            />
          )
        })()}

      {selectionMarquee && tool === 'select' && (
        <SelectionMarqueePreview rect={selectionMarquee} />
      )}
    </>
  )
}
