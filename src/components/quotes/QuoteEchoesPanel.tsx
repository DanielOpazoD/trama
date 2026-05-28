import { useQuoteEchoes } from '../../state'

/**
 * U-2: Eco. Marginalia post-creación de una cita: el sistema sugiere
 * 1-3 citas afines via embedding, presentadas como "esto te recordó a…".
 *
 * Diseño:
 *   - Eyebrow editorial discreto en serif italic + small-caps
 *   - Cada eco es una mini-card sin chrome: solo texto serif italic
 *     (es texto literario, no UI) + atribución en `caption ink-400`
 *   - Sin "ver más" / "abrir" — la idea es contemplar, no navegar.
 *     Si querés ir a la cita, hacés click en la atribución que linkea
 *     a la entidad (deferido — por ahora pasivo).
 *   - Si no hay ecos (cita base sin embedding o no hay otras citas
 *     similares), no se renderiza nada.
 *   - Mientras carga, render null — no skeleton porque es una
 *     sugerencia opcional, no contenido principal.
 *
 * Props:
 *   - quoteId  ID de la cita base. Si null, no se hace fetch.
 *   - onDismiss callback opcional para cerrar el panel.
 */
export function QuoteEchoesPanel({
  quoteId,
  onDismiss,
}: {
  quoteId: string | null
  onDismiss?: () => void
}) {
  const { data: echoes, isLoading } = useQuoteEchoes(quoteId)

  // Render nada mientras carga o si no hay ecos. La marginalia debe
  // ser una sorpresa amable, no un placeholder ansioso.
  if (!quoteId || isLoading) return null
  if (!echoes || echoes.length === 0) return null

  return (
    <aside
      className="my-6 animate-fade-up"
      aria-label="Ecos: citas similares en tu trama"
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
          esto te recordó a
        </p>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-500 transition-colors"
          >
            cerrar
          </button>
        )}
      </div>
      <ul className="stack-3">
        {echoes.map((echo) => (
          <li key={echo.id} className="font-serif">
            <blockquote className="quote-block italic text-ink-600 text-lead leading-relaxed border-l-2 border-ink-100 pl-4">
              {truncate(echo.text, 240)}
            </blockquote>
            <p className="mt-1 pl-4 text-caption text-ink-400">
              — {echo.entityName}
              {echo.source && <span className="text-ink-300"> · {echo.source}</span>}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Trunca preservando palabras y agregando elipsis editorial. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + '…'
}
