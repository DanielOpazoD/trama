/**
 * ε3: Utilities compartidas entre los paneles de Settings.
 *
 * El criterio de qué entra acá: solo cosas usadas por 2+ paneles.
 * Lógica única a un panel vive en su propio archivo. El nombre con
 * underscore (_shared) lo aleja alfabéticamente del resto y deja claro
 * que no es un panel.
 */

/**
 * Header estándar de cada panel — título serif + hint sans con respiro
 * en rhythm vertical. δ2 lo definió; θ2 lo refina con un eyebrow chico
 * arriba (estilo "secciones de revista") y una accent-rule debajo.
 */
export function PanelHeader({
  title,
  hint,
  /** Eyebrow opcional arriba del título, en small caps serif. Si se
      omite, el header arranca directo con el título. */
  eyebrow,
}: {
  title: string
  hint: string
  eyebrow?: string
}) {
  return (
    // pad-block-4 abajo (~22px) para más aire que antes; stack-2 entre
    // los elementos. La accent-rule del bottom da identidad editorial:
    // el header se siente como el título de un capítulo subrayado.
    <header className="pad-block-4 mb-6 stack-2">
      {eyebrow && (
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
          {eyebrow}
        </p>
      )}
      <h3 className="font-serif text-2xl text-ink-800 leading-tight tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-ink-400 leading-relaxed max-w-prose">{hint}</p>
      {/* Accent-rule sutil debajo — el header termina como una entrada
          de índice subrayada en un libro. */}
      <div className="accent-rule mt-3" />
    </header>
  )
}

/**
 * Formatea un timestamp ISO en formato relativo legible en español:
 *   "hace instantes" → "hace N min" → "hace N h" → "hace N d" → fecha.
 *
 * Usado en SpotifyPanel (last sync) y HealthPanel (algunas marcas
 * temporales). Centralizamos para que ambos hablen el mismo idioma.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'hace instantes'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
