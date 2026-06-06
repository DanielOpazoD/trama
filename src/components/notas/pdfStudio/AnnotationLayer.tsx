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
import { EditableBox } from './EditableBox'
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

/** Rectángulo en curso del resaltado que se está dibujando (coords nativas). */
export type DrawingRect = { x0: number; y0: number; x1: number; y1: number }

/** Punta de flecha: dos trazos cortos desde `p1` hacia atrás de la dirección. */
function arrowHeadPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  sw: number,
): string {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const back = { x: -dx / len, y: -dy / len }
  const headLen = Math.min(len * 0.3, Math.max(8, sw * 5))
  const a = Math.PI / 7
  const rot = (v: { x: number; y: number }, t: number) => ({
    x: v.x * Math.cos(t) - v.y * Math.sin(t),
    y: v.x * Math.sin(t) + v.y * Math.cos(t),
  })
  const h1 = rot(back, a)
  const h2 = rot(back, -a)
  return (
    `M ${p1.x} ${p1.y} L ${p1.x + h1.x * headLen} ${p1.y + h1.y * headLen} ` +
    `M ${p1.x} ${p1.y} L ${p1.x + h2.x * headLen} ${p1.y + h2.y * headLen}`
  )
}

/** Dibuja una forma (líneas/contornos, sin relleno) en coords de SVG (y desde arriba). */
function ShapeStroke({
  shape,
  p0,
  p1,
  color,
  sw,
  opacity,
}: {
  shape: ShapeKind
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  color: string
  sw: number
  opacity: number
}) {
  const x = Math.min(p0.x, p1.x)
  const y = Math.min(p0.y, p1.y)
  const w = Math.abs(p1.x - p0.x)
  const h = Math.abs(p1.y - p0.y)
  const common = {
    stroke: color,
    strokeWidth: sw,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity,
    style: { pointerEvents: 'none' as const },
  }
  if (shape === 'rect') return <rect x={x} y={y} width={w} height={h} {...common} />
  if (shape === 'oval')
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  return (
    <>
      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} {...common} />
      {shape === 'arrow' && <path d={arrowHeadPath(p0, p1, sw)} {...common} />}
    </>
  )
}

/**
 * Capa de ANOTACIONES que se monta sobre la imagen de la página: cuadros de texto
 * (con edición inline), resaltados translúcidos y el preview en vivo del resaltado
 * que se está dibujando. Presentacional: la geometría de la página (zoom/rotación)
 * y el estado viven en `PdfTextEditor`; acá sólo se pintan las anotaciones y se
 * avisan las interacciones (seleccionar, arrastrar, editar).
 */
export function AnnotationLayer({
  annotations,
  innerW,
  innerH,
  tool,
  selectedId,
  editingId,
  drawing,
  snapGuides = [],
  drawColor,
  onStartDrag,
  onSelect,
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
  editingId: string | null
  drawing: DrawingRect | null
  snapGuides?: SnapGuide[]
  /** Color del resaltado en curso (para el preview punteado). */
  drawColor: string
  onStartDrag: (e: ReactPointerEvent, a: Annotation) => void
  onSelect: (id: string) => void
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
  onStartResize: (
    e: ReactPointerEvent,
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const resizeHandle = (
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    handle: ResizeHandle,
    left: string,
    top: string,
    label: string,
  ) => (
    <button
      key={`${a.id}-${handle}`}
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => onStartResize(e, a, handle)}
      className="absolute z-10 h-3.5 w-3.5 rounded-sm border border-paper-50 bg-[color:var(--accent-sage)] shadow-sm shadow-ink-900/25"
      style={{
        left,
        top,
        transform: 'translate(-50%, -50%)',
        cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
        touchAction: 'none',
        pointerEvents: tool === 'select' ? undefined : 'none',
      }}
    />
  )

  const boxResizeHandles = (
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    box: { xRatio: number; yRatio: number; wRatio: number; hRatio: number },
    labelPrefix = 'Redimensionar desde',
  ) =>
    tool === 'select' && selectedId === a.id
      ? [
          resizeHandle(
            a,
            'nw',
            `${box.xRatio * 100}%`,
            `${box.yRatio * 100}%`,
            `${labelPrefix} esquina superior izquierda`,
          ),
          resizeHandle(
            a,
            'ne',
            `${(box.xRatio + box.wRatio) * 100}%`,
            `${box.yRatio * 100}%`,
            `${labelPrefix} esquina superior derecha`,
          ),
          resizeHandle(
            a,
            'sw',
            `${box.xRatio * 100}%`,
            `${(box.yRatio + box.hRatio) * 100}%`,
            `${labelPrefix} esquina inferior izquierda`,
          ),
          resizeHandle(
            a,
            'se',
            `${(box.xRatio + box.wRatio) * 100}%`,
            `${(box.yRatio + box.hRatio) * 100}%`,
            `${labelPrefix} esquina inferior derecha`,
          ),
        ]
      : null

  const rectResizeHandles = (a: HighlightAnnotation | ImageAnnotation) =>
    boxResizeHandles(
      a,
      a,
      a.kind === 'image' ? 'Redimensionar imagen desde' : 'Redimensionar resaltado desde',
    )

  const shapeResizeHandles = (a: ShapeAnnotation) =>
    boxResizeHandles(
      a,
      {
        xRatio: Math.min(a.x0Ratio, a.x1Ratio),
        yRatio: Math.min(a.y0Ratio, a.y1Ratio),
        wRatio: Math.abs(a.x1Ratio - a.x0Ratio),
        hRatio: Math.abs(a.y1Ratio - a.y0Ratio),
      },
      'Redimensionar forma desde',
    )

  const textResizeHandles = (a: TextAnnotation, sz: number) => {
    const widthPx =
      typeof a.wRatio === 'number'
        ? a.wRatio * innerW
        : Math.max(sz * 1.6, (a.text || ' ').length * sz * 0.55)
    const heightPx =
      typeof a.hRatio === 'number' ? a.hRatio * innerH : sz * TEXT_LINE_HEIGHT
    return boxResizeHandles(
      a,
      {
        xRatio: a.xRatio,
        yRatio: a.yRatio,
        wRatio: widthPx / Math.max(1, innerW),
        hRatio: heightPx / Math.max(1, innerH),
      },
      'Redimensionar texto desde',
    )
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
              onPointerDown={(e) => onStartDrag(e, a)}
              // Click selecciona ESTE (no llega al fondo, que deselecciona).
              onClick={(e) => {
                e.stopPropagation()
                onSelect(a.id)
              }}
              // Doble clic edita el texto INLINE, sobre el cuadro.
              onDoubleClick={(e) => {
                e.stopPropagation()
                onStartEdit(a.id)
              }}
              title="Doble clic para editar · arrastra para mover"
              style={{
                ...boxStyle,
                cursor: 'move',
                userSelect: 'none',
                touchAction: 'none',
                // Fuera de "seleccionar" no captura (deja dibujar encima).
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline:
                  selectedId === a.id
                    ? `1.5px solid ${ACCENT}`
                    : '1.5px solid transparent',
                outlineOffset: 0,
                transition: 'outline-color 120ms ease',
              }}
            >
              {a.text || ' '}
            </div>
            {textResizeHandles(a, sz)}
          </div>
        )
      })}

      {/* Resaltados (rectángulos translúcidos) */}
      {annotations
        .filter((a) => a.kind === 'highlight')
        .map((a) => (
          <div key={a.id}>
            <div
              onPointerDown={tool === 'select' ? (e) => onStartDrag(e, a) : undefined}
              onClick={
                tool === 'select'
                  ? (e) => {
                      e.stopPropagation()
                      onSelect(a.id)
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
                cursor: 'move',
                touchAction: 'none',
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline: selectedId === a.id ? `1.5px solid ${ACCENT}` : 'none',
                outlineOffset: 1,
              }}
            />
            {rectResizeHandles(a)}
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
              onPointerDown={tool === 'select' ? (e) => onStartDrag(e, a) : undefined}
              onClick={
                tool === 'select'
                  ? (e) => {
                      e.stopPropagation()
                      onSelect(a.id)
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
                cursor: 'move',
                touchAction: 'none',
                userSelect: 'none',
                pointerEvents: tool === 'select' ? undefined : 'none',
                outline: selectedId === a.id ? `1.5px solid ${ACCENT}` : 'none',
                outlineOffset: 2,
              }}
            />
            {rectResizeHandles(a)}
          </div>
        ))}

      {/* Formas vectoriales: SVG sobre la página, coords nativas vía viewBox (escala
          uniforme con el zoom porque el aspecto coincide). */}
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
              const sel = selectedId === a.id
              const interactive = tool === 'select'
              const pe: CSSProperties['pointerEvents'] =
                a.shape === 'rect' || a.shape === 'oval' ? 'all' : 'stroke'
              const hit = {
                onPointerDown: (e: ReactPointerEvent) => onStartDrag(e, a),
                onClick: (e: ReactMouseEvent) => {
                  e.stopPropagation()
                  onSelect(a.id)
                },
                style: { cursor: 'move', pointerEvents: pe } as CSSProperties,
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
          <div key={`${a.id}-shape-handles`}>{shapeResizeHandles(a)}</div>
        ))}

      {/* Preview en vivo del resaltado que se está dibujando */}
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
    </>
  )
}
