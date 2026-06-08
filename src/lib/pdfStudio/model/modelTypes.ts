export type PdfSourceKind = 'pdf' | 'image'

export type PdfSource = {
  id: string
  kind: PdfSourceKind
  file: File
  pageCount: number
}

export type PdfFontKind = 'sans' | 'serif' | 'mono'

type AnnotationBase = {
  id: string
  opacity?: number
  locked?: boolean
  groupId?: string
}

export type TextAnnotation = AnnotationBase & {
  kind: 'text'
  text: string
  xRatio: number
  yRatio: number
  wRatio?: number
  hRatio?: number
  sizeRatio: number
  color: string
  font: PdfFontKind
  bold: boolean
  rotation?: number
}

export type HighlightAnnotation = AnnotationBase & {
  kind: 'highlight'
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
  color: string
}

export type RedactionAnnotation = AnnotationBase & {
  kind: 'redaction'
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
  color: string
}

export type ShapeKind = 'rect' | 'oval' | 'line' | 'arrow' | 'x'

export type ShapeAnnotation = AnnotationBase & {
  kind: 'shape'
  shape: ShapeKind
  x0Ratio: number
  y0Ratio: number
  x1Ratio: number
  y1Ratio: number
  color: string
  strokeRatio: number
  /** Sólo para la marca `x` (casilleros): si está deshabilitada se pinta en gris
   *  claro (clic la activa/desactiva). El resto de formas la ignoran. */
  disabled?: boolean
}

export type ImageAnnotation = AnnotationBase & {
  kind: 'image'
  src: string
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

export type Annotation =
  | TextAnnotation
  | HighlightAnnotation
  | RedactionAnnotation
  | ShapeAnnotation
  | ImageAnnotation

export type PdfFormFieldKind =
  | 'text'
  | 'date'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'option-list'
  | 'signature'

export type PdfFormValue = string | boolean | string[] | null

export type PdfFormFieldDraft = {
  id: string
  fieldKind: PdfFormFieldKind
  pageId: string
  name: string
  value: PdfFormValue
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
  options?: string[]
  required?: boolean
  readOnly?: boolean
  font?: PdfFontKind
  sizeRatio?: number
  bold?: boolean
}

export type PdfPage = {
  id: string
  annotations: Annotation[]
  rotationQuarters: number
} & (
  | { kind: 'pdf'; sourceId: string; pageIndex: number }
  | { kind: 'image'; sourceId: string }
)

export type DocSettings = {
  pageNumbers?: { position: 'left' | 'center' | 'right' }
  watermark?: { text: string }
  /** Tamaño GLOBAL de las marcas X (lado como fracción del alto de página). Una
   *  sola medida para todo el documento: cambiarla redimensiona todas las X. */
  xMarkSize?: number
  /** Grosor GLOBAL del trazo de las marcas X (fracción del alto de página).
   *  Cambiarlo reaplica a todas las X del documento. */
  xMarkStroke?: number
}

export type PdfDoc = {
  sources: PdfSource[]
  pages: PdfPage[]
  formFields?: PdfFormFieldDraft[]
  settings?: DocSettings
}

export type ImageAsset = { id: string; file: File }
