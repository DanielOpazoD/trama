import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { SnapGuide } from '../editor/pdfAnnotationSnap'
import type { FieldSnapContext } from './pdfFormFieldPointer'

/** Estado de las guías magnéticas de casilleros y fábrica del contexto de
 *  snap por gesto: los objetivos son los casilleros de la página activa que
 *  no se están moviendo. */
export function usePdfFormFieldSnapGuides({
  fields,
  pageId,
}: {
  fields: PdfFormFieldDraft[]
  pageId: string | null
}) {
  const [formSnapGuides, setFormSnapGuides] = useState<SnapGuide[]>([])

  function fieldSnapContext(excludeIds: string[]): FieldSnapContext {
    return {
      targets: fields.filter(
        (field) => field.pageId === pageId && !excludeIds.includes(field.id),
      ),
      onGuides: setFormSnapGuides,
    }
  }

  return {
    formSnapGuides,
    snapForDrag: (field: PdfFormFieldDraft, selectedIds: string[]) =>
      fieldSnapContext(selectedIds.includes(field.id) ? selectedIds : [field.id]),
    snapForResize: (field: PdfFormFieldDraft) => fieldSnapContext([field.id]),
  }
}
