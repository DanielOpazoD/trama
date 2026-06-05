import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { LoadingHint } from '../../LoadingHint'
import { type PageLayout } from '../../../lib/pdfStudio/editorGeometry'
import { type Tool } from './editorStyle'

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
  onStartHighlight,
  onBackgroundClick,
  children,
}: {
  areaRef: RefObject<HTMLDivElement>
  layout: PageLayout | null
  bg: { url: string; w: number; h: number } | null
  zoom: number
  tool: Tool
  /** Índice 0-based de la página visible (para el alt de la imagen). */
  currentPage: number
  /** Inicia el arrastre del resaltado (sólo en modo resaltar). */
  onStartHighlight: (e: ReactPointerEvent) => void
  /** Clic en el fondo de la página (deselecciona, sólo en modo seleccionar). */
  onBackgroundClick: () => void
  children: ReactNode
}) {
  // Caja exterior (scroll) = bounding box FINAL (rotado) escalado por zoom.
  const zw = layout ? layout.outerW * zoom : 0
  const zh = layout ? layout.outerH * zoom : 0
  return (
    <div
      ref={areaRef}
      className="flex-1 min-h-0 overflow-auto grid place-items-center bg-ink-100/30 p-3"
    >
      {layout && bg ? (
        <div className="relative" style={{ width: zw, height: zh }}>
          <div
            onPointerDown={tool === 'highlight' ? onStartHighlight : undefined}
            onClick={tool === 'select' ? onBackgroundClick : undefined}
            className="absolute left-1/2 top-1/2 bg-white rounded-sm ring-1 ring-ink-900/10 shadow-xl shadow-ink-900/15"
            style={{
              width: layout.innerW,
              height: layout.innerH,
              transform: `translate(-50%, -50%) rotate(${layout.rot * 90}deg) scale(${zoom})`,
              cursor: tool === 'highlight' ? 'crosshair' : undefined,
              touchAction: tool === 'highlight' ? 'none' : undefined,
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
