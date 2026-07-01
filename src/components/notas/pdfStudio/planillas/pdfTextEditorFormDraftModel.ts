import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'

export function latestSelectedFormFieldId(selectedIds: string[]): string | null {
  return selectedIds[selectedIds.length - 1] ?? null
}

export function nextSelectedFormFieldIds(
  selectedIds: string[],
  id: string,
  additive = false,
): string[] {
  if (!additive) return [id]
  return selectedIds.includes(id)
    ? selectedIds.filter((fieldId) => fieldId !== id)
    : [...selectedIds, id]
}

export function removeSelectedFormFieldId(selectedIds: string[], id: string): string[] {
  return selectedIds.filter((fieldId) => fieldId !== id)
}

export function patchDraftFormFields(
  fields: PdfFormFieldDraft[],
  id: string,
  patch: Partial<PdfFormFieldDraft>,
): PdfFormFieldDraft[] {
  return fields.map((field) =>
    field.id === id
      ? {
          ...field,
          ...patch,
          name:
            patch.name == null
              ? field.name
              : patch.name.trim().replace(/\s+/g, '_') || field.name,
        }
      : field,
  )
}
