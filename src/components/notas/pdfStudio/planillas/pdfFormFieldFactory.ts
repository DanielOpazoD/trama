import {
  makePdfFormFieldDraft,
  type PdfFormFieldDraft,
  type PdfFormFieldKind,
  type PdfPage,
} from '../../../../lib/pdfStudio/model/model'
import type { TextStyle } from '../editor/editorStyle'
import {
  defaultFormValue,
  fieldNamePrefix,
  initialFieldBox,
} from './pdfTextEditorFormDefaults'
import { formFieldTextStyleFromEditor } from './pdfFormFieldStyle'

function nextFormFieldName(kind: PdfFormFieldKind, fields: PdfFormFieldDraft[]): string {
  const prefix = fieldNamePrefix(kind)
  const used = new Set(fields.map((field) => field.name))
  let i = used.size + 1
  while (used.has(`${prefix}_${i}`)) i += 1
  return `${prefix}_${i}`
}

export function makeDraftFormField({
  box,
  fields,
  kind,
  page,
  style,
}: {
  box?: ReturnType<typeof initialFieldBox>
  fields: PdfFormFieldDraft[]
  kind: PdfFormFieldKind
  page: PdfPage | undefined
  style: TextStyle
}): PdfFormFieldDraft | null {
  if (!page) return null
  return makePdfFormFieldDraft({
    fieldKind: kind,
    pageId: page.id,
    name: nextFormFieldName(kind, fields),
    value: defaultFormValue(kind),
    options: kind === 'radio' ? ['Sí'] : undefined,
    ...(kind === 'text' ? formFieldTextStyleFromEditor(style) : {}),
    ...(box ?? initialFieldBox(kind, style)),
  })
}
