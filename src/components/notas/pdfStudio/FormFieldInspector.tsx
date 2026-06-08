import type { PdfFormFieldDraft, PdfFormValue } from '../../../lib/pdfStudio/model/model'
import { focusRing } from './editor/EditorToolbarPrimitives'

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

export function FormFieldInspector({
  field,
  onDelete,
  onPatch,
  onValueChange,
}: {
  field: PdfFormFieldDraft
  onDelete: () => void
  onPatch: (patch: Partial<PdfFormFieldDraft>) => void
  onValueChange: (value: string | boolean) => void
}) {
  const canEditValue =
    field.fieldKind === 'text' ||
    field.fieldKind === 'date' ||
    field.fieldKind === 'signature'

  return (
    <aside
      aria-label="Inspector de casillero"
      className="absolute right-3 top-28 z-30 w-[17rem] rounded-lg border border-[color:var(--accent-sage)]/30 bg-paper-50/95 p-2 shadow-lg shadow-ink-900/10 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-caption font-medium text-ink-700">Casillero</p>
          <p className="text-micro text-ink-400">{field.fieldKind}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className={`rounded-md px-2 py-1 text-caption font-medium text-[color:var(--accent-clay)] hover:bg-ink-100/60 ${focusRing}`}
        >
          Eliminar
          <span className="sr-only"> casillero</span>
        </button>
      </div>

      <label className="mt-2 grid gap-1 text-micro text-ink-500">
        <span>Variable</span>
        <input
          type="text"
          aria-label="Nombre del casillero"
          value={field.name}
          onChange={(event) => onPatch({ name: event.currentTarget.value })}
          className={`h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption text-ink-800 outline-none ${focusRing}`}
        />
      </label>

      {canEditValue && (
        <label className="mt-2 grid gap-1 text-micro text-ink-500">
          <span>Valor inicial</span>
          <input
            type={field.fieldKind === 'date' ? 'date' : 'text'}
            aria-label="Valor inicial del casillero"
            value={valueAsText(field.value)}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            className={`h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption text-ink-800 outline-none ${focusRing}`}
          />
        </label>
      )}

      <div className="mt-2 grid gap-1.5 text-caption text-ink-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(event) => onPatch({ required: event.currentTarget.checked })}
            className="accent-[color:var(--accent-sage)]"
          />
          Requerido
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.readOnly ?? false}
            onChange={(event) => onPatch({ readOnly: event.currentTarget.checked })}
            className="accent-[color:var(--accent-sage)]"
          />
          Solo lectura
        </label>
      </div>
    </aside>
  )
}
