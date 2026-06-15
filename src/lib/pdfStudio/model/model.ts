/**
 * Fachada pública del modelo puro de PDF Studio.
 *
 * Mantiene compatibilidad para imports existentes, pero las operaciones viven en
 * módulos enfocados: documento/sources, páginas, anotaciones, formularios,
 * texto, historial y comandos.
 */

export type {
  Annotation,
  DocSettings,
  HighlightAnnotation,
  ImageAnnotation,
  ImageAsset,
  PdfDoc,
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfFormValue,
  PdfFontKind,
  PdfPage,
  PdfSource,
  PdfSourceKind,
  RedactionAnnotation,
  ShapeAnnotation,
  ShapeKind,
  TextAnnotation,
} from './modelTypes'
export {
  applyEdits,
  cloneAnnotation,
  isTextAnnotation,
  makeHighlightAnnotation,
  makeImageAnnotation,
  makeRedactionAnnotation,
  makeShapeAnnotation,
  makeTextAnnotation,
  pageHasAnnotations,
  setPageAnnotations,
  translateAnnotation,
  X_DISABLED_COLOR,
} from './modelAnnotations'
export {
  addImageSource,
  addPdfSource,
  canExport,
  emptyDoc,
  getSource,
  insertPages,
  normalizeDoc,
  pageThumbKey,
  replacePageWithImage,
  replacePdfSourceFile,
  reseedIds,
  setDocSettings,
  setDocTitle,
  subsetDoc,
} from './modelDocument'
export {
  deletePage,
  deletePages,
  duplicatePages,
  movePage,
  movePageByDelta,
  movePages,
  repeatDocPages,
  rotatePage,
  rotatePages,
} from './modelPages'
export {
  addPdfFormField,
  clearPdfFormFieldValues,
  clonePdfFormField,
  deletePdfFormField,
  emptyPdfFormValue,
  isPdfTemplate,
  makePdfFormFieldDraft,
  renamePdfFormField,
  resizePdfFormField,
  setPdfFormFieldValue,
  translatePdfFormField,
} from './modelForms'
export {
  baselineDropEm,
  isEmbeddableFont,
  previewFontFamily,
  standardFontName,
  TEXT_LINE_HEIGHT,
  textBoxLayout,
} from './modelText'
