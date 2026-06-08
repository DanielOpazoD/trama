import { useRef } from 'react'
import type { PdfFormFieldDraft, PdfFormValue } from '../../../lib/pdfStudio/model'
import { orderFormFieldsForFill } from './pdfFormFieldFillOrder'
import { FORM_FIELD_EMPTY_HINT } from './pdfFormFieldStyle'

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

function valueAsFillText(value: PdfFormValue): string {
  const text = valueAsText(value)
  return text === FORM_FIELD_EMPTY_HINT ? '' : text
}

function isFilled(field: PdfFormFieldDraft): boolean {
  if (field.fieldKind === 'checkbox' || field.fieldKind === 'radio') {
    return field.value === true || valueAsFillText(field.value).trim().length > 0
  }
  return valueAsFillText(field.value).trim().length > 0
}

export function PdfTemplateFillVariablesPanel({
  activeFieldId = null,
  fields,
  pageIndexById,
  onChange,
  onFocusField,
  onJump,
}: {
  activeFieldId?: string | null
  fields: PdfFormFieldDraft[]
  pageIndexById: Record<string, number>
  onChange: (id: string, value: string | boolean) => void
  onFocusField?: (field: PdfFormFieldDraft) => void
  onJump: (field: PdfFormFieldDraft) => void
}) {
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const orderedFields = orderFormFieldsForFill(fields, pageIndexById)
  const pending = orderedFields.filter((field) => !isFilled(field)).length
  const completed = orderedFields.length - pending
  const nextPending = orderedFields.find((field) => !isFilled(field)) ?? null
  const focusNextField = (index: number) => {
    const next = orderedFields.slice(index + 1).find((field) => !field.readOnly)
    if (!next) return
    onJump(next)
    fieldInputRefs.current[next.id]?.focus()
  }
  const statusText =
    orderedFields.length === 0
      ? 'Sin casilleros'
      : pending === 0
        ? 'Todo listo para imprimir'
        : `${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`
  return (
    <aside
      aria-label="Variables de planilla"
      className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-ink-100 bg-paper-50/95 px-2.5 py-2.5 md:w-64 md:border-b-0 md:border-r"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-caption font-semibold text-ink-800">Completar datos</h2>
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
        Siguiente pendiente
      </button>
      {orderedFields.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-ink-200 bg-paper-50 px-3 py-4 text-caption text-ink-500">
          Esta planilla no tiene casilleros para rellenar.
        </div>
      ) : null}
      <div
        data-testid="template-fill-fields-scroll"
        className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
      >
        {orderedFields.map((field, index) => {
          const filled = isFilled(field)
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
                    if (valueAsText(field.value) === FORM_FIELD_EMPTY_HINT) {
                      onChange(field.id, '')
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    focusNextField(index)
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
