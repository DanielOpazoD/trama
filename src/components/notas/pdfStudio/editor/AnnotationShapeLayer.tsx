import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  type ShapeAnnotation,
  type ShapeKind,
  X_DISABLED_COLOR,
} from '../../../../lib/pdfStudio/model/model'
import type { ResizeHandle } from '../../../../lib/pdfStudio/model/editorGeometry'
import type { ResizableAnnotation } from './pdfAnnotationResize'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { ShapeStroke } from './AnnotationShapeStroke'
import { ACCENT, isShapeTool, type Tool } from './editorStyle'

type DrawingRect = { x0: number; y0: number; x1: number; y1: number }

/** Capa vectorial: todas las FORMAS (rect/óvalo/línea/flecha) y las marcas X en un
 *  único SVG, más el preview de la forma en curso y los handles de redimensionado.
 *  La X togglea su estado (gris ↔ color) y no se redimensiona individualmente. */
export function AnnotationShapeLayer({
  shapes,
  innerW,
  innerH,
  tool,
  selectedId,
  isSelected,
  zoom = 1,
  readOnly = false,
  drawing,
  drawColor,
  xToggleEnabled = false,
  onStartDrag,
  onSelect,
  onToggleDisabled,
  onStartResize,
}: {
  shapes: ShapeAnnotation[]
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  isSelected: (id: string) => boolean
  zoom?: number
  readOnly?: boolean
  drawing: DrawingRect | null
  drawColor: string
  xToggleEnabled?: boolean
  onStartDrag: (e: ReactPointerEvent, a: ShapeAnnotation) => void
  onSelect: (e: ReactMouseEvent, id: string) => void
  onToggleDisabled?: (id: string) => void
  onStartResize: (
    e: ReactPointerEvent,
    a: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const selectionStroke = 1.5 / Math.max(0.25, zoom)
  const showSvg = shapes.length > 0 || (drawing && isShapeTool(tool))

  return (
    <>
      {showSvg && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${Math.max(1, innerW)} ${Math.max(1, innerH)}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          {shapes.map((a) => {
            const p0 = { x: a.x0Ratio * innerW, y: a.y0Ratio * innerH }
            const p1 = { x: a.x1Ratio * innerW, y: a.y1Ratio * innerH }
            const sw = Math.max(0.5, a.strokeRatio * innerH)
            const x = Math.min(p0.x, p1.x)
            const y = Math.min(p0.y, p1.y)
            const w = Math.abs(p1.x - p0.x)
            const hh = Math.abs(p1.y - p0.y)
            const sel = isSelected(a.id)
            const interactive = !readOnly && tool === 'select'
            const isX = a.shape === 'x'
            // La X se activa/desactiva incluso en solo-lectura (modo LLENADO):
            // clic = toggle, pero sin mover/redimensionar.
            const xClickable = isX && !!xToggleEnabled && !!onToggleDisabled
            const strokeColor = isX && a.disabled ? X_DISABLED_COLOR : a.color
            const pe: CSSProperties['pointerEvents'] =
              a.shape === 'rect' || a.shape === 'oval' || isX ? 'all' : 'stroke'
            const hit = {
              onPointerDown: interactive
                ? (e: ReactPointerEvent) => onStartDrag(e, a)
                : undefined,
              onClick: (e: ReactMouseEvent) => {
                if (xClickable) {
                  e.stopPropagation()
                  onToggleDisabled!(a.id)
                  return
                }
                onSelect(e, a.id)
              },
              style: {
                cursor: a.locked ? 'default' : isX ? 'pointer' : 'move',
                pointerEvents: pe,
              } as CSSProperties,
            }
            return (
              <g key={a.id}>
                <ShapeStroke
                  shape={a.shape}
                  p0={p0}
                  p1={p1}
                  color={strokeColor}
                  sw={sw}
                  opacity={a.opacity ?? 1}
                  dashed={isX && !!a.disabled}
                />
                {(interactive || xClickable) &&
                  (a.shape === 'rect' || isX ? (
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
                {!readOnly && sel && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={w + 6}
                    height={hh + 6}
                    fill="none"
                    strokeWidth={selectionStroke}
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

      {shapes
        // Las marcas X no se redimensionan una a una: su tamaño es GLOBAL.
        .filter((a) => a.shape !== 'x')
        .map((a) => (
          <div key={`${a.id}-shape-handles`}>
            <AnnotationResizeHandles
              annotation={a}
              innerW={innerW}
              innerH={innerH}
              selectedId={readOnly ? null : selectedId}
              tool={readOnly ? 'highlight' : tool}
              onStartResize={onStartResize}
              zoom={zoom}
            />
          </div>
        ))}
    </>
  )
}
