import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { AnnotationDistributionAxis } from '../editor/pdfAnnotationArrange'

/** Alineación de casilleros: horizontal (izq/centro/der) o vertical (arriba/medio/abajo). */
export type FormFieldAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export type FormFieldSizeDimension = 'width' | 'height'

type FieldBox = Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function unionBox(boxes: FieldBox[]): FieldBox | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.xRatio))
  const top = Math.min(...boxes.map((box) => box.yRatio))
  const right = Math.max(...boxes.map((box) => box.xRatio + box.wRatio))
  const bottom = Math.max(...boxes.map((box) => box.yRatio + box.hRatio))
  return {
    xRatio: left,
    yRatio: top,
    wRatio: right - left,
    hRatio: bottom - top,
  }
}

function moveField(field: PdfFormFieldDraft, nextLeft: number, nextTop: number) {
  const xRatio = clamp(nextLeft, 0, Math.max(0, 1 - field.wRatio))
  const yRatio = clamp(nextTop, 0, Math.max(0, 1 - field.hRatio))
  if (Math.abs(xRatio - field.xRatio) < 1e-9 && Math.abs(yRatio - field.yRatio) < 1e-9)
    return field
  return { ...field, xRatio, yRatio }
}

function selectedFields(fields: PdfFormFieldDraft[], ids: string[]) {
  const selectedIds = new Set(ids)
  return {
    selectedIds,
    selected: fields.filter((field) => selectedIds.has(field.id)),
  }
}

export function alignFormFields(
  fields: PdfFormFieldDraft[],
  ids: string[],
  alignment: FormFieldAlignment,
): PdfFormFieldDraft[] {
  const { selectedIds, selected } = selectedFields(fields, ids)
  if (selected.length === 0) return fields
  // Con un solo casillero se alinea contra la página completa.
  const target =
    selected.length === 1
      ? { xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }
      : unionBox(selected)
  if (!target) return fields
  const horizontal =
    alignment === 'left' || alignment === 'center' || alignment === 'right'

  let changed = false
  const next = fields.map((field) => {
    if (!selectedIds.has(field.id)) return field
    const left =
      alignment === 'left'
        ? target.xRatio
        : alignment === 'right'
          ? target.xRatio + target.wRatio - field.wRatio
          : target.xRatio + (target.wRatio - field.wRatio) / 2
    const top =
      alignment === 'top'
        ? target.yRatio
        : alignment === 'bottom'
          ? target.yRatio + target.hRatio - field.hRatio
          : target.yRatio + (target.hRatio - field.hRatio) / 2
    const moved = horizontal
      ? moveField(field, left, field.yRatio)
      : moveField(field, field.xRatio, top)
    if (moved !== field) changed = true
    return moved
  })
  return changed ? next : fields
}

/** Iguala ancho o alto de la selección al casillero de referencia (el activo:
 *  último seleccionado). El tamaño se acota para no salirse de la página. */
export function matchFormFieldsSize(
  fields: PdfFormFieldDraft[],
  ids: string[],
  dimension: FormFieldSizeDimension,
  referenceId?: string,
): PdfFormFieldDraft[] {
  const { selectedIds, selected } = selectedFields(fields, ids)
  if (selected.length < 2) return fields
  const reference =
    selected.find((field) => field.id === referenceId) ?? selected[selected.length - 1]!

  let changed = false
  const next = fields.map((field) => {
    if (!selectedIds.has(field.id) || field.id === reference.id) return field
    const resized =
      dimension === 'width'
        ? { ...field, wRatio: clamp(reference.wRatio, 0.018, 1 - field.xRatio) }
        : { ...field, hRatio: clamp(reference.hRatio, 0.018, 1 - field.yRatio) }
    const delta =
      dimension === 'width'
        ? Math.abs(resized.wRatio - field.wRatio)
        : Math.abs(resized.hRatio - field.hRatio)
    if (delta < 1e-9) return field
    changed = true
    return resized
  })
  return changed ? next : fields
}

/** Ids de los casilleros de la página que tocan el marco de selección. Un marco
 *  sin área (clic) no captura nada. */
export function formFieldIdsInBox(
  fields: PdfFormFieldDraft[],
  pageId: string | null,
  box: FieldBox,
): string[] {
  if (!pageId || box.wRatio <= 0 || box.hRatio <= 0) return []
  return fields
    .filter(
      (field) =>
        field.pageId === pageId &&
        field.xRatio < box.xRatio + box.wRatio &&
        field.xRatio + field.wRatio > box.xRatio &&
        field.yRatio < box.yRatio + box.hRatio &&
        field.yRatio + field.hRatio > box.yRatio,
    )
    .map((field) => field.id)
}

export function distributeFormFields(
  fields: PdfFormFieldDraft[],
  ids: string[],
  axis: AnnotationDistributionAxis,
): PdfFormFieldDraft[] {
  const { selectedIds, selected } = selectedFields(fields, ids)
  if (selected.length < 3) return fields

  const ordered = selected
    .map((field) => {
      const center =
        axis === 'x' ? field.xRatio + field.wRatio / 2 : field.yRatio + field.hRatio / 2
      return { field, center }
    })
    .sort((a, b) => a.center - b.center)

  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const step = (last.center - first.center) / (ordered.length - 1)
  const centerById = new Map(
    ordered.map((entry, index) => [entry.field.id, first.center + step * index]),
  )

  let changed = false
  const next = fields.map((field) => {
    if (!selectedIds.has(field.id)) return field
    const targetCenter = centerById.get(field.id)
    if (targetCenter == null) return field
    const moved =
      axis === 'x'
        ? moveField(field, targetCenter - field.wRatio / 2, field.yRatio)
        : moveField(field, field.xRatio, targetCenter - field.hRatio / 2)
    if (moved !== field) changed = true
    return moved
  })
  return changed ? next : fields
}
