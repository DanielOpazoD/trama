import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  baselineDropEm,
  isTextAnnotation,
  previewFontFamily,
  TEXT_LINE_HEIGHT,
  type Annotation,
} from '../../../lib/pdfStudio/model'
import { rectFromPoints } from '../../../lib/pdfStudio/editorGeometry'
import { EditableBox } from './EditableBox'
import {
  ACCENT,
  HIGHLIGHT_OPACITY,
  HIT_X,
  HIT_Y,
  hexToRgba,
  type Tool,
} from './editorStyle'

/** Rectángulo en curso del resaltado que se está dibujando (coords nativas). */
export type DrawingRect = { x0: number; y0: number; x1: number; y1: number }

/**
 * Capa de ANOTACIONES que se monta sobre la imagen de la página: cuadros de texto
 * (con edición inline), resaltados translúcidos y el preview en vivo del resaltado
 * que se está dibujando. Presentacional: la geometría de la página (zoom/rotación)
 * y el estado viven en `PdfTextEditor`; acá sólo se pintan las anotaciones y se
 * avisan las interacciones (seleccionar, arrastrar, editar).
 */
export function AnnotationLayer({
  annotations,
  innerH,
  tool,
  selectedId,
  editingId,
  drawing,
  drawColor,
  onStartDrag,
  onSelect,
  onStartEdit,
  onCommitText,
  onCancelEdit,
}: {
  annotations: Annotation[]
  /** Alto en px de la página nativa (para escalar el tamaño de letra). */
  innerH: number
  tool: Tool
  selectedId: string | null
  editingId: string | null
  drawing: DrawingRect | null
  /** Color del resaltado en curso (para el preview punteado). */
  drawColor: string
  onStartDrag: (e: ReactPointerEvent, a: Annotation) => void
  onSelect: (id: string) => void
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
}) {
  return (
    <>
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
          whiteSpace: 'pre',
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
          <div
            key={a.id}
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
                selectedId === a.id ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
              outlineOffset: 0,
              transition: 'outline-color 120ms ease',
            }}
          >
            {a.text || ' '}
          </div>
        )
      })}

      {/* Resaltados (rectángulos translúcidos) */}
      {annotations
        .filter((a) => a.kind === 'highlight')
        .map((a) => (
          <div
            key={a.id}
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
        ))}

      {/* Preview en vivo del resaltado que se está dibujando */}
      {drawing &&
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
