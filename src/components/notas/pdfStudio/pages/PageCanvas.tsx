import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { LoadingHint } from '../../../LoadingHint'
import { type PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { type Tool } from '../editorStyle'

const SHEET_EDGE_GUTTER = 24

/**
 * Lienzo de la página: el área scrolleable que centra la página en su orientación
 * FINAL (rotada `layout.rot`) y escalada por `zoom`, con el render de fondo y el
 * estado de carga. Las anotaciones se pasan como `children` (las dibuja
 * `AnnotationLayer`) → el estado y la geometría de interacción siguen en
 * `PdfTextEditor`. El padre mide el área (ResizeObserver sobre `areaRef`).
 */
export function PageCanvas({
  areaRef,
  layout,
  bg,
  zoom,
  tool,
  currentPage,
  placingFormField = false,
  scrollContainer = true,
  onStartDraw,
  onStartFormField,
  onStartMarquee,
  children,
}: {
  areaRef: RefObject<HTMLDivElement>
  layout: PageLayout | null
  bg: { url: string; w: number; h: number } | null
  zoom: number
  tool: Tool
  /** Índice 0-based de la página visible (para el alt de la imagen). */
  currentPage: number
  placingFormField?: boolean
  /** Si es false, el padre controla el scroll vertical de varias páginas seguidas. */
  scrollContainer?: boolean
  /** Inicia el dibujo por arrastre (modo resaltar o una forma). */
  onStartDraw: (e: ReactPointerEvent) => void
  /** Coloca un campo especial en la posición clicada sobre la página. */
  onStartFormField?: (e: ReactPointerEvent) => void
  /** Inicia selección por marco sobre el fondo de la página. */
  onStartMarquee: (e: ReactPointerEvent) => void
  children: ReactNode
}) {
  // Caja exterior (scroll) = bounding box FINAL (rotado) escalado por zoom.
  const zw = layout ? layout.outerW * zoom : 0
  const zh = layout ? layout.outerH * zoom : 0
  const stageW = layout ? zw + SHEET_EDGE_GUTTER * 2 : 0
  const stageH = layout ? zh + SHEET_EDGE_GUTTER * 2 : 0
  const sheetCenterX = layout ? SHEET_EDGE_GUTTER + zw / 2 : 0
  const sheetCenterY = layout ? SHEET_EDGE_GUTTER + zh / 2 : 0
  return (
    <div
      ref={areaRef}
      className={
        scrollContainer
          ? 'flex-1 min-h-0 overflow-auto grid place-items-center bg-ink-100/30 p-3'
          : 'min-h-[72vh] w-full p-3'
      }
    >
      {layout && bg ? (
        <div className="relative mx-auto" style={{ width: stageW, height: stageH }}>
          <div
            data-pdf-editor-sheet={currentPage}
            onPointerDown={
              placingFormField && onStartFormField
                ? onStartFormField
                : tool === 'select'
                  ? onStartMarquee
                  : onStartDraw
            }
            className="absolute rounded-sm ring-1 ring-ink-800/15 shadow-xl shadow-ink-800/15"
            style={{
              left: sheetCenterX,
              top: sheetCenterY,
              width: layout.innerW,
              height: layout.innerH,
              transform: `translate(-50%, -50%) rotate(${layout.rot * 90}deg) scale(${zoom})`,
              cursor: placingFormField || tool !== 'select' ? 'crosshair' : undefined,
              touchAction: placingFormField || tool !== 'select' ? 'none' : undefined,
            }}
          >
            <img
              src={bg.url}
              alt={`Página ${currentPage + 1}`}
              className="absolute inset-0 w-full h-full object-contain select-none"
              draggable={false}
            />
            {children}
          </div>
        </div>
      ) : (
        <LoadingHint text="cargando página" size="sm" />
      )}
    </div>
  )
}
