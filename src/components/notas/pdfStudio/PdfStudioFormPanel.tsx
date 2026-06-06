import type { PdfStudioDetectedForm } from './usePdfStudioForms'

function valueAsText(value: string | boolean | null | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function PdfStudioFormPanel({
  forms,
  onApply,
  onChange,
}: {
  forms: PdfStudioDetectedForm[]
  onApply: (flatten: boolean) => void
  onChange: (sourceId: string, fieldName: string, value: string | boolean) => void
}) {
  if (forms.length === 0) return null

  return (
    <section
      aria-label="Formularios detectados"
      className="rounded-md border border-ink-100 bg-paper-50/80 px-3 py-3 text-caption text-ink-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-caption font-semibold text-ink-800">Formularios</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onApply(false)}
            className="rounded-md px-2 py-1 text-caption font-medium text-ink-700 hover:bg-ink-100/60"
          >
            Aplicar editable
          </button>
          <button
            type="button"
            onClick={() => onApply(true)}
            className="rounded-md px-2 py-1 text-caption font-medium text-ink-700 hover:bg-ink-100/60"
          >
            Aplanar formulario
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {forms.map((form) => (
          <div key={form.sourceId} className="space-y-2">
            <div className="truncate text-micro uppercase text-ink-400">
              {form.fileName}
            </div>
            {form.fields.map((field) => {
              const value = form.values[field.name]
              if (field.type === 'checkbox') {
                return (
                  <label key={field.name} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) =>
                        onChange(form.sourceId, field.name, event.currentTarget.checked)
                      }
                    />
                    <span>{field.name}</span>
                  </label>
                )
              }
              return (
                <label key={field.name} className="grid gap-1">
                  <span className="text-micro text-ink-500">{field.name}</span>
                  <input
                    type="text"
                    aria-label={field.name}
                    value={valueAsText(value)}
                    onChange={(event) =>
                      onChange(form.sourceId, field.name, event.currentTarget.value)
                    }
                    className="h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-sm text-ink-800 outline-none focus:border-[color:var(--accent-sage)]"
                  />
                </label>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
