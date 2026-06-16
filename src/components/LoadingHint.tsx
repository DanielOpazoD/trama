import { Spinner } from './Spinner'

/**
 * Pista de loading editorial. Reemplaza los call sites dispersos de
 * "Cargando…", "cargando momentos…", "Subiendo…", "leyendo…" — cada
 * uno con su propia capitalización y estilo.
 *
 * Convención canónica:
 *   - Siempre lowercase (la voz editorial de Trama es discreta).
 *   - Siempre italic.
 *   - Siempre ink-400 (no ink-300 que ya se usa para muted normal).
 *   - Trailing "…" automático — no escribir uno extra.
 *
 * Variantes de tamaño:
 *   - 'caption' (default) — text-caption, para timeline rows, hints.
 *   - 'sm'                — text-sm, para bloques de contenido.
 */
export function LoadingHint({
  text,
  size = 'caption',
}: {
  /** Verbo+contexto en lowercase, sin "…" final (lo agrega el componente). */
  text: string
  size?: 'caption' | 'sm'
}) {
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-caption'
  const spinnerSize = size === 'sm' ? 14 : 12
  return (
    <p
      className={`${sizeClass} inline-flex items-center gap-1.5 italic text-ink-400`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={spinnerSize} decorative />
      {text.toLowerCase()}…
    </p>
  )
}
