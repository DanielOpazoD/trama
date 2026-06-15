/**
 * Popover de autocompletar de etiquetas `#` para el composer/edición de Notas.
 *
 * Presentacional: recibe las sugerencias ya calculadas (`matchTags` vive en
 * `lib/tagMatch`, testeada aparte) y el índice activo; la lógica de teclado
 * (↑/↓/Enter/Esc) la maneja el `MarkdownField` que lo hospeda, porque comparte
 * el `keydown` del textarea. Acá solo pintamos la lista y avisamos los clicks.
 *
 * Minimalista, tokens del sistema: card-paper-soft + acento salvia para el ítem
 * activo (la voz del mundo Notas). Entra con `animate-fade-up`.
 */
const ACCENT = 'var(--accent-sage)'

export function TagAutocomplete({
  suggestions,
  activeIndex,
  onPick,
  onHover,
}: {
  suggestions: string[]
  activeIndex: number
  onPick: (tag: string) => void
  onHover: (index: number) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div
      role="listbox"
      aria-label="Etiquetas sugeridas"
      className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] max-w-[16rem]
                 animate-fade-up overflow-hidden rounded-lg border border-ink-100/70
                 bg-paper-50/95 p-1 shadow-sm backdrop-blur-sm"
    >
      {suggestions.map((tag, i) => {
        const on = i === activeIndex
        return (
          <button
            key={tag}
            type="button"
            role="option"
            aria-selected={on}
            // onMouseDown.preventDefault: no robar el foco del textarea antes de
            // aplicar (igual que la barra de formato de MarkdownField).
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(tag)
            }}
            onMouseEnter={() => onHover(i)}
            className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left
                        text-caption transition-colors ${
                          on ? '' : 'text-ink-600 hover:bg-ink-100/60'
                        }`}
            style={
              on
                ? { color: ACCENT, background: 'var(--accent-sage-soft, transparent)' }
                : undefined
            }
          >
            <span className="opacity-50">#</span>
            {tag}
          </button>
        )
      })}
    </div>
  )
}
