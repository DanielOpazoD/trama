import { useEffect, useRef } from 'react'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { orderFormFieldsForFill } from '../pdfFormFieldFillOrder'
import { isTemplateFieldFilled } from './pdfTemplateFillProgress'

/**
 * Llenado guiado en modo relleno: Enter (⇧Enter retrocede) salta al siguiente
 * campo en orden visual — la página sigue al foco vía `jumpToFormField` — y
 * `startGuidedFill` arranca en el primer campo pendiente. Los `<select>`
 * quedan fuera del intercept (Enter ahí confirma la opción abierta).
 */
export function usePdfTemplateGuidedFill({
  enabled,
  fields,
  pageIndexById,
  jumpToFormField,
}: {
  enabled: boolean
  fields: PdfFormFieldDraft[]
  pageIndexById: Record<string, number>
  jumpToFormField: (field: PdfFormFieldDraft) => void
}) {
  const ctxRef = useRef({ fields, pageIndexById, jumpToFormField })
  ctxRef.current = { fields, pageIndexById, jumpToFormField }

  function orderedFillable(): PdfFormFieldDraft[] {
    const { fields: current, pageIndexById: pages } = ctxRef.current
    return orderFormFieldsForFill(current, pages).filter((field) => !field.readOnly)
  }

  /** Enfoca el primer campo pendiente (o el primero si ya está todo lleno). */
  function startGuidedFill() {
    const list = orderedFillable()
    const target = list.find((field) => !isTemplateFieldFilled(field)) ?? list[0]
    if (target) ctxRef.current.jumpToFormField(target)
  }

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'SELECT') return
      const control = target?.closest?.('[data-form-field-control]')
      const id = control?.getAttribute('data-form-field-control')
      if (!id) return
      const list = orderedFillable()
      const index = list.findIndex((field) => field.id === id)
      if (index < 0) return
      const next = list[index + (event.shiftKey ? -1 : 1)]
      if (!next) return
      event.preventDefault()
      event.stopPropagation()
      ctxRef.current.jumpToFormField(next)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])

  return { startGuidedFill }
}
