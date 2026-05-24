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
 * en rhythm vertical. δ2 lo definió; lo movemos acá para que cada
 * panel lo importe sin redefinir.
 */
export function PanelHeader({ title, hint }: { title: string; hint: string }) {
  return (
    // pad-block-3 abajo = 16px (--space-3), stack-2 = 11px (--space-2)
    // entre título y hint. El border-b sutil ancla el header al panel.
    <header className="pad-block-3 border-b border-ink-100/40 mb-6 stack-2">
      <h3 className="font-serif text-xl text-ink-800 leading-tight">{title}</h3>
      <p className="text-sm text-ink-400 leading-relaxed">{hint}</p>
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
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
