import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import { createPdfFontResolver } from '../assemble/assembleFontResolver'
import { dataUrlToBytes, isPngBytes } from '../assemble/assembleImages'
import { FORM_FIELD_EMPTY_HINT } from './formFieldConstants'
import {
  formFieldAppearanceValues,
  type FormFieldAppearanceValues,
  type RgbTuple,
} from './formFieldAppearance'
import type { PdfFormFieldAlign, PdfFormFieldDraft } from '../model/model'
import { loadPdfFontkit, loadPdfLib } from '../pdfRuntime/pdfLibLoader'

const DEFAULT_FORM_FIELD_SIZE_RATIO = 0.04

export type PdfFormFieldType =
  'text' | 'checkbox' | 'radio' | 'dropdown' | 'option-list' | 'button' | 'unknown'

export type PdfFormFieldValue = string | boolean | string[] | null

export type PdfFormWidgetInfo = {
  pageIndex: number | null
  widgetIndex: number
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

export type PdfFormFieldInfo = {
  name: string
  type: PdfFormFieldType
  value: PdfFormFieldValue
  options?: string[]
  readOnly: boolean
  required: boolean
  widgets: PdfFormWidgetInfo[]
}

export type PdfFormInspection = {
  fieldCount: number
  fields: PdfFormFieldInfo[]
}

export type PdfFormFillValues = Record<string, string | boolean | null | undefined>

export type PdfFormFillOptions = {
  flatten?: boolean
}

export type PdfFormFillResult = {
  blob: Blob
}

export type PdfFormOperationOptions = {
  signal?: AbortSignal
}

type PdfForm = ReturnType<PDFDocument['getForm']>
type PdfField = ReturnType<PdfForm['getFields']>[number]
type PdfWidget = ReturnType<PdfField['acroField']['getWidgets']>[number]
type PdfFormsRuntime = Awaited<ReturnType<typeof loadPdfLib>>

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw Object.assign(new Error('Operación cancelada.'), { code: 'CANCELLED' })
}

function pageIndexForWidget(pdf: PDFDocument, form: PdfForm, widget: PdfWidget) {
  try {
    const page = (
      form as unknown as { findWidgetPage?: (w: PdfWidget) => PDFPage }
    ).findWidgetPage?.(widget)
    if (page) return pdf.getPages().findIndex((candidate) => candidate === page)
  } catch {
    // Some malformed PDFs contain widget dictionaries without a resolvable page.
  }

  const pageRef = widget.P()
  if (!pageRef) return null
  const index = pdf.getPages().findIndex((page) => page.ref === pageRef)
  return index >= 0 ? index : null
}

function widgetInfo(
  pdf: PDFDocument,
  form: PdfForm,
  field: PdfField,
): PdfFormWidgetInfo[] {
  return field.acroField.getWidgets().map((widget, widgetIndex) => {
    const rectangle = widget.getRectangle()
    const pageIndex = pageIndexForWidget(pdf, form, widget)
    const page = pageIndex == null ? null : pdf.getPage(pageIndex)
    const pageW = page?.getWidth() ?? 1
    const pageH = page?.getHeight() ?? 1
    return {
      pageIndex,
      widgetIndex,
      xRatio: rectangle.x / pageW,
      yRatio: (pageH - rectangle.y - rectangle.height) / pageH,
      wRatio: rectangle.width / pageW,
      hRatio: rectangle.height / pageH,
    }
  })
}

function fieldInfo(
  pdf: PDFDocument,
  form: PdfForm,
  field: PdfField,
  runtime: PdfFormsRuntime,
) {
  const {
    PDFButton,
    PDFCheckBox,
    PDFDropdown,
    PDFOptionList,
    PDFRadioGroup,
    PDFSignature,
    PDFTextField,
  } = runtime
  const name = field.getName()
  const base = {
    name,
    readOnly: field.isReadOnly(),
    required: field.isRequired(),
    widgets: widgetInfo(pdf, form, field),
  }
  if (field instanceof PDFTextField) {
    return { ...base, type: 'text' as const, value: field.getText() ?? '' }
  }
  if (field instanceof PDFCheckBox) {
    return { ...base, type: 'checkbox' as const, value: field.isChecked() }
  }
  if (field instanceof PDFRadioGroup) {
    return {
      ...base,
      type: 'radio' as const,
      value: field.getSelected() ?? null,
      options: field.getOptions(),
    }
  }
  if (field instanceof PDFDropdown) {
    return {
      ...base,
      type: 'dropdown' as const,
      value: field.getSelected(),
      options: field.getOptions(),
    }
  }
  if (field instanceof PDFOptionList) {
    return {
      ...base,
      type: 'option-list' as const,
      value: field.getSelected(),
      options: field.getOptions(),
    }
  }
  if (field instanceof PDFSignature) {
    return { ...base, type: 'button' as const, value: null }
  }
  if (field instanceof PDFButton) {
    return { ...base, type: 'button' as const, value: null }
  }
  return { ...base, type: 'unknown' as const, value: null }
}

async function loadPdf(
  file: File,
  options: PdfFormOperationOptions = {},
): Promise<{
  pdf: PDFDocument
  runtime: PdfFormsRuntime
}> {
  throwIfAborted(options.signal)
  const runtime = await loadPdfLib()
  throwIfAborted(options.signal)
  const buffer = await file.arrayBuffer()
  throwIfAborted(options.signal)
  const pdf = await runtime.PDFDocument.load(buffer, {
    ignoreEncryption: true,
  })
  throwIfAborted(options.signal)
  return { pdf, runtime }
}

export async function inspectPdfForm(
  file: File,
  options: PdfFormOperationOptions = {},
): Promise<PdfFormInspection> {
  const { pdf, runtime } = await loadPdf(file, options)
  throwIfAborted(options.signal)
  const form = pdf.getForm()
  const fields = pdf
    .getForm()
    .getFields()
    .map((field) => fieldInfo(pdf, form, field, runtime))
    .sort((a, b) => a.name.localeCompare(b.name))
  throwIfAborted(options.signal)
  return {
    fieldCount: fields.length,
    fields,
  }
}

export async function fillPdfForm(
  file: File,
  values: PdfFormFillValues,
  options: PdfFormFillOptions = {},
  operationOptions: PdfFormOperationOptions = {},
): Promise<PdfFormFillResult> {
  const { pdf, runtime } = await loadPdf(file, operationOptions)
  const { PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFTextField } = runtime
  const form = pdf.getForm()

  for (const [name, rawValue] of Object.entries(values)) {
    throwIfAborted(operationOptions.signal)
    if (rawValue == null) continue
    const field = form.getFieldMaybe(name)
    if (!field) continue
    if (field instanceof PDFTextField) {
      field.setText(String(rawValue))
    } else if (field instanceof PDFCheckBox) {
      if (rawValue === true || rawValue === 'true' || rawValue === '1') field.check()
      else field.uncheck()
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
      field.select(String(rawValue))
    }
  }

  if (options.flatten) {
    throwIfAborted(operationOptions.signal)
    form.flatten()
  }

  throwIfAborted(operationOptions.signal)
  const bytes = await pdf.save({ useObjectStreams: true })
  throwIfAborted(operationOptions.signal)
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  }
}

function pdfRectForField(
  field: PdfFormFieldDraft,
  page: PDFPage,
  runtime: PdfFormsRuntime,
) {
  const w = page.getWidth()
  const h = page.getHeight()
  return {
    x: field.xRatio * w,
    y: h - (field.yRatio + field.hRatio) * h,
    width: field.wRatio * w,
    height: field.hRatio * h,
    borderColor: runtime.rgb(0.29, 0.45, 0.33),
    borderWidth: 0.8,
  }
}

/** Traduce la apariencia declarada del casillero a opciones de pdf-lib. Solo lo
 *  fijado por el usuario: lo demás conserva el default de cada tipo de campo. */
function appearanceOptionsFor(
  appearance: FormFieldAppearanceValues,
  runtime: PdfFormsRuntime,
) {
  const color = (tuple: RgbTuple) => runtime.rgb(tuple[0], tuple[1], tuple[2])
  return {
    ...(appearance.textColor ? { textColor: color(appearance.textColor) } : null),
    ...(appearance.backgroundColor
      ? { backgroundColor: color(appearance.backgroundColor) }
      : null),
    ...(appearance.borderColor
      ? {
          borderColor: color(appearance.borderColor),
          borderWidth: appearance.borderWidth,
        }
      : null),
  }
}

function textAlignmentFor(align: PdfFormFieldAlign, runtime: PdfFormsRuntime) {
  if (align === 'center') return runtime.TextAlignment.Center
  if (align === 'right') return runtime.TextAlignment.Right
  return runtime.TextAlignment.Left
}

type FieldWithWidgets = {
  acroField: {
    getWidgets(): {
      MK(): { delete(key: unknown): boolean } | undefined
      getOrCreateBorderStyle(): { setWidth(width: number): void }
    }[]
  }
}

function clearWidgetChrome(
  field: FieldWithWidgets,
  runtime: PdfFormsRuntime,
  options: { background?: boolean; border?: boolean } = {},
) {
  const { background = true, border = false } = options
  for (const widget of field.acroField.getWidgets()) {
    const appearance = widget.MK()
    if (background) appearance?.delete(runtime.PDFName.of('BG'))
    if (border) {
      appearance?.delete(runtime.PDFName.of('BC'))
      widget.getOrCreateBorderStyle().setWidth(0)
    }
  }
}

function fontSizeForField(field: PdfFormFieldDraft, page: PDFPage) {
  return Math.max(
    6,
    (field.sizeRatio ?? DEFAULT_FORM_FIELD_SIZE_RATIO) * page.getHeight(),
  )
}

function stringValue(value: PdfFormFieldDraft['value']) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

function formTextValue(value: PdfFormFieldDraft['value']) {
  const text = stringValue(value)
  return text === FORM_FIELD_EMPTY_HINT ? '' : text
}

function applyFlags(
  field: {
    enableReadOnly: () => void
    enableRequired: () => void
  },
  draft: PdfFormFieldDraft,
) {
  if (draft.readOnly) field.enableReadOnly()
  if (draft.required) field.enableRequired()
}

async function embedSignatureImage(
  pdf: PDFDocument,
  value: PdfFormFieldDraft['value'],
  options: PdfFormOperationOptions = {},
): Promise<PDFImage | null> {
  throwIfAborted(options.signal)
  const src = stringValue(value).trim()
  if (!src) return null

  let bytes: Uint8Array | null = null
  try {
    bytes = dataUrlToBytes(src)
  } catch {
    bytes = null
  }
  if (!bytes) {
    throw Object.assign(new Error('La firma no es una imagen base64 válida'), {
      code: 'PDF_FORM_SIGNATURE_IMAGE_INVALID',
    })
  }

  let image: PDFImage
  try {
    image = isPngBytes(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch (cause) {
    throw Object.assign(new Error('No se pudo embeber la imagen de firma'), {
      code: 'PDF_FORM_SIGNATURE_IMAGE_INVALID',
      cause,
    })
  }
  throwIfAborted(options.signal)
  return image
}

export async function writePdfFormFields(
  file: File,
  fields: PdfFormFieldDraft[],
  pageIds: string[],
  options: PdfFormFillOptions = {},
  operationOptions: PdfFormOperationOptions = {},
): Promise<PdfFormFillResult> {
  const { pdf, runtime } = await loadPdf(file, operationOptions)
  const form = pdf.getForm()
  // Las fuentes del casillero exportan de verdad (Inter/Spectral/Caveat
  // embebidas con fallback estándar), igual que las anotaciones de texto.
  pdf.registerFontkit(await loadPdfFontkit())
  const resolveFont = createPdfFontResolver(pdf)
  const font = await pdf.embedFont(runtime.StandardFonts.Helvetica)
  throwIfAborted(operationOptions.signal)
  const existingNames = new Set(form.getFields().map((field) => field.getName()))
  const writtenNames = new Set<string>()

  for (const draft of fields) {
    throwIfAborted(operationOptions.signal)
    if (existingNames.has(draft.name) || writtenNames.has(draft.name)) {
      throw Object.assign(new Error(`Campo duplicado: ${draft.name}`), {
        code: 'PDF_FORM_DUPLICATE_FIELD',
      })
    }
    const pageIndex = pageIds.indexOf(draft.pageId)
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      throw Object.assign(new Error(`Página no encontrada para ${draft.name}`), {
        code: 'PDF_FORM_PAGE_NOT_FOUND',
      })
    }
    const page = pdf.getPage(pageIndex)
    const appearance = formFieldAppearanceValues(draft)
    const rect = {
      ...pdfRectForField(draft, page, runtime),
      ...appearanceOptionsFor(appearance, runtime),
    }
    const keepBackground = { background: !appearance.backgroundColor }

    if (draft.fieldKind === 'checkbox') {
      const field = form.createCheckBox(draft.name)
      applyFlags(field, draft)
      if (draft.value === true) field.check()
      field.addToPage(page, rect)
      clearWidgetChrome(field, runtime, keepBackground)
    } else if (draft.fieldKind === 'radio') {
      const field = form.createRadioGroup(draft.name)
      applyFlags(field, draft)
      const option = draft.options?.[0] ?? 'Sí'
      field.addOptionToPage(option, page, rect)
      if (draft.value === option) field.select(option)
      clearWidgetChrome(field, runtime, keepBackground)
    } else if (draft.fieldKind === 'signature') {
      const field = form.createButton(draft.name)
      applyFlags(field, draft)
      field.addToPage('', page, { ...rect, font })
      const image = await embedSignatureImage(pdf, draft.value, operationOptions)
      if (image) field.setImage(image)
      clearWidgetChrome(field, runtime, keepBackground)
    } else {
      const field = form.createTextField(draft.name)
      applyFlags(field, draft)
      field.setText(formTextValue(draft.value))
      if (appearance.align)
        field.setAlignment(textAlignmentFor(appearance.align, runtime))
      const fieldFont = await resolveFont(draft.font ?? 'sans', draft.bold ?? false)
      field.addToPage(page, { ...rect, font: fieldFont })
      field.setFontSize(fontSizeForField(draft, page))
      clearWidgetChrome(field, runtime, {
        ...keepBackground,
        border: !appearance.borderColor,
      })
      // Con el chrome ya definitivo, regenera la apariencia con la fuente del
      // casillero y marca el campo limpio: sin esto, save() la reharía con la
      // Helvetica default del formulario.
      field.updateAppearances(fieldFont)
    }
    writtenNames.add(draft.name)
  }

  if (options.flatten) {
    throwIfAborted(operationOptions.signal)
    form.flatten()
  }

  throwIfAborted(operationOptions.signal)
  const bytes = await pdf.save({ useObjectStreams: true })
  throwIfAborted(operationOptions.signal)
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  }
}
