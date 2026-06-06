import {
  PDFCheckBox,
  PDFDropdown,
  PDFDocument,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib'

export type PdfFormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'option-list'
  | 'button'
  | 'unknown'

export type PdfFormFieldValue = string | boolean | string[] | null

export type PdfFormFieldInfo = {
  name: string
  type: PdfFormFieldType
  value: PdfFormFieldValue
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

function fieldInfo(
  field: ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>[number],
) {
  const name = field.getName()
  if (field instanceof PDFTextField) {
    return { name, type: 'text' as const, value: field.getText() ?? '' }
  }
  if (field instanceof PDFCheckBox) {
    return { name, type: 'checkbox' as const, value: field.isChecked() }
  }
  if (field instanceof PDFRadioGroup) {
    return { name, type: 'radio' as const, value: field.getSelected() ?? null }
  }
  if (field instanceof PDFDropdown) {
    return { name, type: 'dropdown' as const, value: field.getSelected() }
  }
  if (field instanceof PDFOptionList) {
    return { name, type: 'option-list' as const, value: field.getSelected() }
  }
  return { name, type: 'unknown' as const, value: null }
}

async function loadPdf(file: File): Promise<PDFDocument> {
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
}

export async function inspectPdfForm(file: File): Promise<PdfFormInspection> {
  const pdf = await loadPdf(file)
  const fields = pdf
    .getForm()
    .getFields()
    .map(fieldInfo)
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    fieldCount: fields.length,
    fields,
  }
}

export async function fillPdfForm(
  file: File,
  values: PdfFormFillValues,
  options: PdfFormFillOptions = {},
): Promise<PdfFormFillResult> {
  const pdf = await loadPdf(file)
  const form = pdf.getForm()

  for (const [name, rawValue] of Object.entries(values)) {
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
    form.flatten()
  }

  const bytes = await pdf.save({ useObjectStreams: true })
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  }
}
