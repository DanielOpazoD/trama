import { useState, type Dispatch, type SetStateAction } from 'react'
import { pushHistory, type History } from '../../../../lib/pdfStudio/model/history'
import type { Annotation, PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import {
  clamp,
  X_DEFAULT_SIDE,
  X_SIZE_MAX,
  X_SIZE_MIN,
  X_STROKE,
  X_STROKE_MAX,
  X_STROKE_MIN,
} from './editorStyle'

type Edits = Record<number, Annotation[]>

/**
 * Estado y operaciones de las marcas X del editor PDF, fuera de `PdfTextEditor`
 * para que ese archivo no crezca. El tamaño y el grosor son GLOBALES al documento
 * (una sola medida para todas las X): persisten en `DocSettings` y cambiarlos
 * reaplica a TODAS las X. El toggle apaga/enciende una X (gris ↔ color) y es
 * undoable. Apunta a las páginas por índice (no a la "activa").
 */
export function usePdfTextEditorXMarks({
  doc,
  setHistory,
  activeLayout,
  activeLayoutRef,
}: {
  doc: PdfDoc
  setHistory: Dispatch<SetStateAction<History<Edits>>>
  activeLayout: PageLayout | null
  activeLayoutRef: { current: PageLayout | null }
}) {
  const [xMarkSize, setXMarkSize] = useState(
    () => doc.settings?.xMarkSize ?? X_DEFAULT_SIDE,
  )
  const [xMarkStroke, setXMarkStroke] = useState(
    () => doc.settings?.xMarkStroke ?? X_STROKE,
  )

  /** Reaplica una transformación a TODAS las marcas X del documento (en un solo
   *  commit de historial). Sólo toca páginas que tienen alguna X. */
  const mapAllXMarks = (transform: (a: Annotation) => Annotation) => {
    setHistory((h) => {
      const present: Edits = { ...h.present }
      doc.pages.forEach((p, i) => {
        const list = present[i] ?? p.annotations
        if (list.some((a) => a.kind === 'shape' && a.shape === 'x')) {
          present[i] = list.map(transform)
        }
      })
      return pushHistory(h, present)
    })
  }

  // Activa/desactiva una marca X (gris claro ↔ color) en la página indicada.
  const toggleAnnotationDisabled = (pageIndex: number, id: string) =>
    setHistory((h) =>
      pushHistory(h, {
        ...h.present,
        [pageIndex]: (
          h.present[pageIndex] ??
          doc.pages[pageIndex]?.annotations ??
          []
        ).map((a) =>
          a.id === id && a.kind === 'shape' && a.shape === 'x'
            ? { ...a, disabled: !a.disabled }
            : a,
        ),
      }),
    )

  // Cambia el tamaño GLOBAL y redimensiona TODAS las X alrededor de su centro
  // (cuadradas en px según la página activa).
  const resizeAllXMarks = (next: number) => {
    const size = clamp(next, X_SIZE_MIN, X_SIZE_MAX)
    setXMarkSize(size)
    const L = activeLayoutRef.current ?? activeLayout
    if (!L || L.innerW <= 0 || L.innerH <= 0) return
    const wRatio = (size * L.innerH) / L.innerW
    const hRatio = size
    mapAllXMarks((a) => {
      if (a.kind !== 'shape' || a.shape !== 'x') return a
      const cx = (a.x0Ratio + a.x1Ratio) / 2
      const cy = (a.y0Ratio + a.y1Ratio) / 2
      return {
        ...a,
        x0Ratio: cx - wRatio / 2,
        y0Ratio: cy - hRatio / 2,
        x1Ratio: cx + wRatio / 2,
        y1Ratio: cy + hRatio / 2,
      }
    })
  }

  // Cambia el grosor GLOBAL y lo reaplica a TODAS las X.
  const setAllXMarkStroke = (next: number) => {
    const stroke = clamp(next, X_STROKE_MIN, X_STROKE_MAX)
    setXMarkStroke(stroke)
    mapAllXMarks((a) =>
      a.kind === 'shape' && a.shape === 'x' ? { ...a, strokeRatio: stroke } : a,
    )
  }

  return {
    xMarkSize,
    xMarkStroke,
    toggleAnnotationDisabled,
    resizeAllXMarks,
    setAllXMarkStroke,
  }
}
