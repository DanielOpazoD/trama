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

export type ShapeKind = 'rect' | 'oval' | 'line' | 'arrow'

export type ShapeAnnotation = AnnotationBase & {
  kind: 'shape'
  shape: ShapeKind
  x0Ratio: number
  y0Ratio: number
  x1Ratio: number
  y1Ratio: number
  color: string
  strokeRatio: number
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
}

export type PdfDoc = {
  sources: PdfSource[]
  pages: PdfPage[]
  settings?: DocSettings
}

export type ImageAsset = { id: string; file: File }
