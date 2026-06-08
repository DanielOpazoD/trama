import { useEffect, useRef } from 'react'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import type { TemplateFillImportFeedback } from './usePdfTemplateFillImport'
import { orderFormFieldsForFill } from '../pdfFormFieldFillOrder'
import { FORM_FIELD_EMPTY_HINT } from '../pdfFormFieldStyle'
import {
  fillProgressForTemplateFields,
  isTemplateFieldFilled,
  rawValueAsText,
  valueAsFillText,
} from './pdfTemplateFillProgress'

export function PdfTemplateFillVariablesPanel({
  activeFieldId = null,
  autoFocusFirstPending = false,
  fields,
  importFeedback = null,
  pageIndexById,
  showFieldGuides = false,
  showPendingOnly = false,
  onChange,
  onClearValues,
  onFocusField,
  onImportValues,
  onShowFieldGuidesChange = () => undefined,
  onShowPendingOnlyChange = () => undefined,
  onJump,
}: {
  activeFieldId?: string | null
  autoFocusFirstPending?: boolean
  fields: PdfFormFieldDraft[]
  importFeedback?: TemplateFillImportFeedback | null
  pageIndexById: Record<string, number>
  showFieldGuides?: boolean
  showPendingOnly?: boolean
  onChange: (id: string, value: string | boolean) => void
  onClearValues?: () => void
  onFocusField?: (field: PdfFormFieldDraft) => void
  onImportValues?: (file: File) => void | Promise<TemplateFillImportValues | void>
  onShowFieldGuidesChange?: (show: boolean) => void
  onShowPendingOnlyChange?: (show: boolean) => void
  onJump: (field: PdfFormFieldDraft) => void
}) {
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const orderedFields = orderFormFieldsForFill(fields, pageIndexById)
  const visibleFields = showPendingOnly
    ? orderedFields.filter((field) => !isTemplateFieldFilled(field))
    : orderedFields
  const { completed, pending } = fillProgressForTemplateFields(orderedFields)
  const nextPending = orderedFields.find((field) => !isTemplateFieldFilled(field)) ?? null
  const autoFocusedRef = useRef(false)
  const focusAdjacentField = (index: number, direction: 1 | -1): boolean => {
    const candidates =
      direction > 0
        ? visibleFields.slice(index + 1)
        : visibleFields.slice(0, index).reverse()
    const next = candidates.find((field) => !field.readOnly)
    if (!next) return false
    onJump(next)
    fieldInputRefs.current[next.id]?.focus()
    return true
  }
  const statusText =
    orderedFields.length === 0
      ? 'Sin campos'
      : pending === 0
        ? 'Todo listo para imprimir'
        : `${pending} ${pending === 1 ? 'campo pendiente' : 'campos pendientes'}`

  useEffect(() => {
    if (!autoFocusFirstPending || autoFocusedRef.current || activeFieldId) return
    const target = orderedFields.find(
      (field) => !field.readOnly && !isTemplateFieldFilled(field),
    )
    if (!target) return
    autoFocusedRef.current = true
    onFocusField?.(target)
    fieldInputRefs.current[target.id]?.focus()
  }, [activeFieldId, autoFocusFirstPending, onFocusField, orderedFields])

  return (
    <aside
      aria-label="Variables de planilla"
      className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-ink-100 bg-paper-50/95 px-2.5 py-2.5 md:w-64 md:border-b-0 md:border-r"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-caption font-semibold text-ink-800">Datos de esta copia</h2>
          <p className="mt-0.5 text-micro text-ink-400">
            {completed}/{orderedFields.length}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-micro font-medium ${
            pending > 0
              ? 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'
              : 'bg-ink-100 text-ink-500'
          }`}
        >
          {statusText}
        </span>
      </div>
      <button
        type="button"
        disabled={!nextPending}
        onClick={() => nextPending && onJump(nextPending)}
        className="mt-2 w-full rounded-md border border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/55 px-2 py-1.5 text-caption font-semibold text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)] disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-300"
      >
        {nextPending ? 'Ir al siguiente campo' : 'Lista para imprimir'}
      </button>
      <p className="mt-2 rounded-md bg-ink-50 px-2 py-1.5 text-micro leading-snug text-ink-500">
        Modo relleno: escribe e imprime. La plantilla original no cambia salvo que guardes
        una copia con datos.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={!onImportValues}
          className="rounded-md border border-ink-200 bg-paper-50 px-2 py-1.5 text-caption font-medium text-ink-700 transition-colors hover:border-[color:var(--accent-sage)]/40 hover:text-[color:var(--accent-sage)] disabled:cursor-not-allowed disabled:text-ink-300"
        >
          Importar datos
        </button>
        <button
          type="button"
          onClick={onClearValues}
          disabled={!onClearValues || orderedFields.length === 0}
          className="rounded-md border border-ink-200 bg-paper-50 px-2 py-1.5 text-caption font-medium text-ink-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:text-ink-300"
        >
          Borrar datos
        </button>
      </div>
      <input
        ref={importInputRef}
        aria-label="Archivo de datos"
        type="file"
        accept=".json,.csv,application/json,text/csv,text/plain"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void onImportValues?.(file)
          event.currentTarget.value = ''
        }}
      />
      {importFeedback ? (
        <p
          role="status"
          className={`mt-2 rounded-md px-2 py-1.5 text-micro leading-snug ${
            importFeedback.tone === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'
          }`}
        >
          {importFeedback.message}
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <label className="flex items-center justify-between gap-2 rounded-md bg-ink-50 px-2 py-1.5 text-caption text-ink-600">
          <span>Ver campos</span>
          <input
            type="checkbox"
            checked={showFieldGuides}
            onChange={(event) => onShowFieldGuidesChange(event.currentTarget.checked)}
            className="h-4 w-4 accent-[color:var(--accent-sage)]"
          />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-md bg-ink-50 px-2 py-1.5 text-caption text-ink-600">
          <span>Solo pendientes</span>
          <input
            type="checkbox"
            checked={showPendingOnly}
            onChange={(event) => onShowPendingOnlyChange(event.currentTarget.checked)}
            className="h-4 w-4 accent-[color:var(--accent-sage)]"
          />
        </label>
      </div>
      {orderedFields.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-ink-200 bg-paper-50 px-3 py-4 text-caption text-ink-500">
          Esta planilla no tiene casilleros para rellenar.
        </div>
      ) : null}
      <div
        data-testid="template-fill-fields-scroll"
        className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
      >
        {visibleFields.map((field, index) => {
          const filled = isTemplateFieldFilled(field)
          const label = `Variable ${field.name}`
          const active = activeFieldId === field.id
          return (
            <div
              key={field.id}
              aria-label={active ? `Campo activo: ${field.name}` : undefined}
              className={`rounded-md border bg-paper-50 p-1.5 shadow-sm shadow-ink-900/5 ${
                active
                  ? 'border-[color:var(--accent-sage)] ring-2 ring-[color:var(--accent-sage)]/15'
                  : 'border-ink-100'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onJump(field)}
                  aria-label={`Ir al campo ${field.name}`}
                  className="min-w-0 flex-1 truncate text-left text-caption font-medium text-ink-800 transition-colors hover:text-[color:var(--accent-sage)]"
                >
                  [{field.name}]
                </button>
                <span
                  className={`h-2 w-2 rounded-full ${
                    filled ? 'bg-[color:var(--accent-sage)]' : 'bg-ink-200'
                  }`}
                  aria-label={filled ? 'completa' : 'pendiente'}
                />
                {active ? (
                  <span className="rounded bg-[color:var(--accent-sage-soft)] px-1.5 py-0.5 text-micro font-medium text-[color:var(--accent-sage)]">
                    Activo
                  </span>
                ) : null}
              </div>
              {field.fieldKind === 'checkbox' ? (
                <label className="flex items-center gap-2 text-caption text-ink-600">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={field.value === true}
                    disabled={field.readOnly}
                    onChange={(event) => onChange(field.id, event.currentTarget.checked)}
                    className="h-4 w-4 accent-[color:var(--accent-sage)]"
                  />
                  Marcado
                </label>
              ) : (
                <input
                  ref={(node) => {
                    fieldInputRefs.current[field.id] = node
                  }}
                  type={field.fieldKind === 'date' ? 'date' : 'text'}
                  aria-label={label}
                  value={valueAsFillText(field.value)}
                  readOnly={field.readOnly}
                  onChange={(event) => onChange(field.id, event.currentTarget.value)}
                  onFocus={() => {
                    onFocusField?.(field)
                    if (rawValueAsText(field.value) === FORM_FIELD_EMPTY_HINT) {
                      onChange(field.id, '')
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== 'Tab') return
                    const moved = focusAdjacentField(
                      index,
                      event.key === 'Tab' && event.shiftKey ? -1 : 1,
                    )
                    if (event.key === 'Enter' || moved) event.preventDefault()
                  }}
                  placeholder={`[${field.name}]`}
                  className="input-paper w-full rounded-md border border-ink-200 px-2 py-1 text-caption text-ink-800 placeholder:text-ink-300"
                />
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
