import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { DetectedPdfFormForCanvas } from '../planillas/pdfFormVisualMapping'
import type { TemplateFillImportValues } from '../planillas/fill/pdfTemplateFillImport'
import type { PdfStudioAutosaveState } from '../workspace/pdfStudioAutosaveState'
import type { PdfTextEditorResult } from './pdfTextEditorResult'

type PdfFormValueHandler = (
  sourceId: string,
  fieldName: string,
  value: string | boolean,
) => void

export type PdfTextEditorProps = {
  doc: PdfDoc
  pageIndex: number
  detectedForms?: DetectedPdfFormForCanvas[]
  mode?: 'edit' | 'fill'
  templateToolsEnabled?: boolean
  onFormValueChange?: PdfFormValueHandler
  onInspectForms?: () => void
  /** Protección local en vivo (solo modo diseño): recibe las ediciones con debounce. */
  onAutosave?: (edits: PdfTextEditorResult) => void
  /** Estado del autosave local, para el indicador discreto dentro del editor. */
  autosaveState?: PdfStudioAutosaveState
  onClose: (edits: PdfTextEditorResult | null) => void
  onDisplayZoomChange?: (zoom: number) => void
  /** Lote: N filas -> N copias rellenadas en un solo PDF (vista previa). */
  onMailMerge?: (edits: PdfTextEditorResult, rows: TemplateFillImportValues[]) => void
  onPrint?: (edits: PdfTextEditorResult) => void
  onSaveCopy?: (edits: PdfTextEditorResult) => void
  sessionZoom?: number
  stampAssetUserKey?: string
}
