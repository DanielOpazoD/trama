import { nextId } from './modelIds'
import type {
  Annotation,
  HighlightAnnotation,
  ImageAnnotation,
  PdfDoc,
  PdfPage,
  RedactionAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from './modelTypes'

/** Crea una anotación de TEXTO con id propio (la UI provee el resto). */
export function makeTextAnnotation(
  init: Omit<TextAnnotation, 'id' | 'kind'>,
): TextAnnotation {
  return { ...init, id: nextId('t'), kind: 'text' }
}

/** Crea una anotación de RESALTADO (rectángulo translúcido) con id propio. */
export function makeHighlightAnnotation(
  init: Omit<HighlightAnnotation, 'id' | 'kind'>,
): HighlightAnnotation {
  return { ...init, id: nextId('a'), kind: 'highlight' }
}

/** Crea una REDACCIÓN: intención de borrado seguro, no mero rectángulo visual. */
export function makeRedactionAnnotation(
  init: Omit<RedactionAnnotation, 'id' | 'kind' | 'opacity'>,
): RedactionAnnotation {
  return { ...init, id: nextId('r'), kind: 'redaction', opacity: 1 }
}

/** Crea una FORMA (línea/flecha/rect/óvalo/marca X) con id propio. */
export function makeShapeAnnotation(
  init: Omit<ShapeAnnotation, 'id' | 'kind'>,
): ShapeAnnotation {
  return { ...init, id: nextId('a'), kind: 'shape' }
}

/** Gris claro de una marca `x` DESHABILITADA (clic la apaga/enciende). */
export const X_DISABLED_COLOR = '#bdbdbd'

/** Crea una IMAGEN estampada (firma/sello) con id propio. */
export function makeImageAnnotation(
  init: Omit<ImageAnnotation, 'id' | 'kind'>,
): ImageAnnotation {
  return { ...init, id: nextId('a'), kind: 'image' }
}

/**
 * Clona una anotación con un id NUEVO. Sirve para copiar/pegar/duplicar sin que
 * la copia comparta id con el original.
 */
export function cloneAnnotation(a: Annotation): Annotation {
  return a.kind === 'text' ? { ...a, id: nextId('t') } : { ...a, id: nextId('a') }
}

/** Mueve una anotación `(dx, dy)` en ratios, acotando anclajes a 0..1. */
export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  const c = (n: number) => Math.min(1, Math.max(0, n))
  if (a.kind === 'shape') {
    return {
      ...a,
      x0Ratio: c(a.x0Ratio + dx),
      y0Ratio: c(a.y0Ratio + dy),
      x1Ratio: c(a.x1Ratio + dx),
      y1Ratio: c(a.y1Ratio + dy),
    }
  }
  return { ...a, xRatio: c(a.xRatio + dx), yRatio: c(a.yRatio + dy) }
}

/** Type guard: ¿es una anotación de texto? */
export function isTextAnnotation(a: Annotation): a is TextAnnotation {
  return a.kind === 'text'
}

/** ¿La página tiene anotaciones superpuestas (de cualquier tipo)? */
export function pageHasAnnotations(page: PdfPage): boolean {
  return page.annotations.length > 0
}

/** Reemplaza TODAS las anotaciones de una página. */
export function setPageAnnotations(
  doc: PdfDoc,
  index: number,
  annotations: Annotation[],
): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const pages = [...doc.pages]
  const page = pages[index]
  if (!page) return doc
  pages[index] = { ...page, annotations }
  return { ...doc, pages }
}

/** Aplica de una vez un mapa `índice→anotaciones` sobre el documento. */
export function applyEdits(doc: PdfDoc, edits: Record<number, Annotation[]>): PdfDoc {
  let next = doc
  for (const [idx, anns] of Object.entries(edits)) {
    next = setPageAnnotations(next, Number(idx), anns)
  }
  return next
}
