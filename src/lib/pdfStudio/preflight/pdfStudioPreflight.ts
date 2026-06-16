import type { Annotation, PdfDoc, PdfFormFieldDraft, PdfSource } from '../model/model'

export type PdfStudioPreflightAction = 'import' | 'export' | 'print' | 'save'
export type PdfStudioPreflightSeverity = 'blocker' | 'warning' | 'info'

export type PdfStudioPreflightCode =
  | 'empty-document'
  | 'heavy-images'
  | 'redactions-rasterize-pages'
  | 'required-form-fields-empty'
  | 'fillable-form-fields'
  | 'unsupported-import-files'
  | 'script-fonts'

export type PdfStudioPreflightItem = {
  code: PdfStudioPreflightCode
  severity: PdfStudioPreflightSeverity
  message: string
  detail?: string
}

export type PdfStudioPreflightStats = {
  pages: number
  sources: number
  sourceBytes: number
  imageBytes: number
  imageSources: number
  pdfSources: number
  redactionPages: number
  formFields: number
  requiredEmptyFields: number
  scriptFontAnnotations: number
}

export type PdfStudioPreflightReport = {
  action: PdfStudioPreflightAction
  blockers: PdfStudioPreflightItem[]
  warnings: PdfStudioPreflightItem[]
  info: PdfStudioPreflightItem[]
  canProceed: boolean
  stats: PdfStudioPreflightStats
}

const HEAVY_IMAGE_BYTES = 12 * 1024 * 1024

export function buildPdfStudioPreflight(
  doc: PdfDoc,
  { action }: { action: PdfStudioPreflightAction },
): PdfStudioPreflightReport {
  const stats = collectPdfStudioPreflightStats(doc)
  const blockers: PdfStudioPreflightItem[] = []
  const warnings: PdfStudioPreflightItem[] = []
  const info: PdfStudioPreflightItem[] = []

  if (stats.pages === 0) {
    blockers.push({
      code: 'empty-document',
      severity: 'blocker',
      message: 'No hay páginas para procesar.',
    })
  }

  if (stats.imageSources > 0 && stats.imageBytes >= HEAVY_IMAGE_BYTES) {
    warnings.push({
      code: 'heavy-images',
      severity: 'warning',
      message: 'Hay imágenes pesadas; exportar puede tardar o usar más memoria.',
      detail: formatBytes(stats.imageBytes),
    })
  }

  if (stats.redactionPages > 0) {
    warnings.push({
      code: 'redactions-rasterize-pages',
      severity: 'warning',
      message:
        'Las páginas con redacción real se rasterizan para eliminar contenido subyacente.',
      detail: `${stats.redactionPages} ${stats.redactionPages === 1 ? 'página' : 'páginas'}`,
    })
  }

  if (stats.scriptFontAnnotations > 0) {
    warnings.push({
      code: 'script-fonts',
      severity: 'warning',
      message: 'Hay texto con fuente manuscrita; se incrusta al exportar el PDF.',
      detail: `${stats.scriptFontAnnotations} ${
        stats.scriptFontAnnotations === 1 ? 'texto' : 'textos'
      }`,
    })
  }

  const requiredEmpty = requiredEmptyFormFields(doc.formFields ?? [])
  if (requiredEmpty.length > 0) {
    warnings.push({
      code: 'required-form-fields-empty',
      severity: 'warning',
      message: 'Hay campos requeridos sin completar.',
      detail: requiredEmpty.map((field) => field.name).join(', '),
    })
  }

  if (stats.formFields > 0 && action === 'export') {
    info.push({
      code: 'fillable-form-fields',
      severity: 'info',
      message: 'El PDF conserva campos rellenables salvo que el flujo pida aplanarlos.',
      detail: `${stats.formFields} ${stats.formFields === 1 ? 'campo' : 'campos'}`,
    })
  }

  return {
    action,
    blockers,
    warnings,
    info,
    canProceed: blockers.length === 0,
    stats,
  }
}

export function buildPdfStudioImportPreflight(files: File[]): PdfStudioPreflightReport {
  const supported = files.filter(isSupportedImportFile)
  const unsupported = files.filter((file) => !isSupportedImportFile(file))
  const sourceBytes = supported.reduce((total, file) => total + file.size, 0)
  const imageBytes = supported
    .filter(isImageImportFile)
    .reduce((total, file) => total + file.size, 0)
  const imageSources = supported.filter(isImageImportFile).length
  const pdfSources = supported.filter(isPdfImportFile).length
  const blockers: PdfStudioPreflightItem[] = []
  const warnings: PdfStudioPreflightItem[] = []
  const info: PdfStudioPreflightItem[] = []

  if (supported.length === 0) {
    blockers.push({
      code: 'unsupported-import-files',
      severity: 'blocker',
      message: 'No hay archivos PDF o imagen soportados para importar.',
      detail: unsupported.map((file) => file.name).join(', '),
    })
  } else if (unsupported.length > 0) {
    warnings.push({
      code: 'unsupported-import-files',
      severity: 'warning',
      message: 'Algunos archivos no se importarán porque no son PDF o imagen.',
      detail: unsupported.map((file) => file.name).join(', '),
    })
  }

  if (imageSources > 0 && imageBytes >= HEAVY_IMAGE_BYTES) {
    warnings.push({
      code: 'heavy-images',
      severity: 'warning',
      message: 'Hay imágenes pesadas; importar puede tardar o usar más memoria.',
      detail: formatBytes(imageBytes),
    })
  }

  return {
    action: 'import',
    blockers,
    warnings,
    info,
    canProceed: blockers.length === 0,
    stats: {
      pages: 0,
      sources: supported.length,
      sourceBytes,
      imageBytes,
      imageSources,
      pdfSources,
      redactionPages: 0,
      formFields: 0,
      requiredEmptyFields: 0,
      scriptFontAnnotations: 0,
    },
  }
}

export function summarizePdfStudioPreflight(report: PdfStudioPreflightReport): string {
  const pages = `${report.stats.pages} ${report.stats.pages === 1 ? 'página' : 'páginas'}`
  if (!report.canProceed) {
    return `${pages} · ${report.blockers.length} bloqueo${report.blockers.length === 1 ? '' : 's'}`
  }
  if (report.warnings.length > 0) {
    return `${pages} · ${report.warnings.length} advertencia${report.warnings.length === 1 ? '' : 's'} · listo para ${actionVerb(report.action)}`
  }
  return `${pages} · listo para ${actionVerb(report.action)}`
}

function collectPdfStudioPreflightStats(doc: PdfDoc): PdfStudioPreflightStats {
  const sourceBytes = doc.sources.reduce((total, source) => total + sourceSize(source), 0)
  const imageBytes = doc.sources
    .filter((source) => source.kind === 'image')
    .reduce((total, source) => total + sourceSize(source), 0)
  const redactionPages = doc.pages.filter((page) =>
    page.annotations.some(isRedactionAnnotation),
  ).length
  const scriptFontAnnotations = doc.pages.reduce(
    (total, page) => total + page.annotations.filter(isScriptFontAnnotation).length,
    0,
  )
  const requiredEmptyFields = requiredEmptyFormFields(doc.formFields ?? []).length
  return {
    pages: doc.pages.length,
    sources: doc.sources.length,
    sourceBytes,
    imageBytes,
    imageSources: doc.sources.filter((source) => source.kind === 'image').length,
    pdfSources: doc.sources.filter((source) => source.kind === 'pdf').length,
    redactionPages,
    formFields: doc.formFields?.length ?? 0,
    requiredEmptyFields,
    scriptFontAnnotations,
  }
}

function isRedactionAnnotation(annotation: Annotation): boolean {
  return annotation.kind === 'redaction'
}

function isScriptFontAnnotation(annotation: Annotation): boolean {
  return annotation.kind === 'text' && annotation.font === 'script'
}

function requiredEmptyFormFields(fields: PdfFormFieldDraft[]): PdfFormFieldDraft[] {
  return fields.filter((field) => field.required && isEmptyPdfFormValue(field.value))
}

function isEmptyPdfFormValue(value: PdfFormFieldDraft['value']): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function sourceSize(source: PdfSource): number {
  return source.file instanceof File ? source.file.size : 0
}

function isSupportedImportFile(file: File): boolean {
  return isPdfImportFile(file) || isImageImportFile(file)
}

function isPdfImportFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isImageImportFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function actionVerb(action: PdfStudioPreflightAction): string {
  if (action === 'print') return 'imprimir'
  if (action === 'save') return 'guardar'
  if (action === 'import') return 'importar'
  return 'exportar'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
