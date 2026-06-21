/** Pestañas de la Biblioteca — filtran por familia de archivo. */
export type BibliotecaTab = 'todo' | 'imagenes' | 'archivos'

const TABS: ReadonlyArray<{ value: BibliotecaTab; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'imagenes', label: 'Imágenes' },
  { value: 'archivos', label: 'Archivos' },
]

/**
 * Tira de pestañas Todo / Imágenes / Archivos. La activa es una píldora
 * rellena (no depende solo del color: el relleno + el peso comunican el
 * estado). Botones reales, accesibles por teclado, con `aria-pressed`.
 */
export function BibliotecaTabs({
  value,
  onChange,
}: {
  value: BibliotecaTab
  onChange: (tab: BibliotecaTab) => void
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Filtrar por tipo">
      {TABS.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={
              active
                ? 'rounded-full bg-ink-50 border border-ink-100 text-ink-700 px-3 py-1 text-sm'
                : 'px-3 py-1 text-sm text-ink-400 hover:text-ink-700 transition-colors'
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
