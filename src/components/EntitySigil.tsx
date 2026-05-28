import { typeAccent } from './graph/GraphNode'

/**
 * μ2: EntitySigil — monograma de 2 letras determinístico que reemplaza
 * el espacio vacío donde una entidad no tiene imagen. Pensado como el
 * "ex libris" mínimo: un sello tipográfico que indica TIPO sin recurrir
 * a ilustración.
 *
 * Algoritmo:
 *   - Si el nombre tiene 2+ palabras: primera letra de las dos primeras
 *     palabras (e.g. "Jorge Luis Borges" → "JL", "El Aleph" → "EA").
 *   - Si es UNA palabra: primera + segunda letra (e.g. "Borges" → "Bo",
 *     "Cervantes" → "Ce").
 *   - Palabras de relleno frecuentes ("el", "la", "los", "las", "de",
 *     "del", "y") se saltan al elegir las dos primeras palabras
 *     significativas. "La náusea" → "LN" sería pobre; preferimos "Na".
 *
 * Visual:
 *   - Rectángulo de papel-100 con border-l-[3px] del typeAccent del tipo.
 *   - Letras en Spectral 500, mayúsculas, tracking ligeramente apretado.
 *   - Border sutil del ink-100 alrededor.
 *
 * Tamaños:
 *   - sm  (28×28, 11px text) — listas densas, search results
 *   - md  (40×40, 14px text) — EntityRow default
 *   - lg  (64×64, 22px text) — NodeDetailPanel header, hero
 *
 * NO mostrar si la entidad tiene una imagen real (futuro) — el sigilo es
 * fallback. Hoy nadie tiene imagen, así que siempre se renderiza.
 */

const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'di',
  'da',
  'y',
  'e',
  'o',
  'u',
  'a',
  'al',
  'un',
  'una',
  'unos',
  'unas',
  'the',
  'of',
  'and',
])

/**
 * Computa el monograma de un nombre. Pura para test fácil.
 */
export function monogramOf(name: string): string {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // Palabras significativas (filtra stop-words). Si todas son stop-words
  // (edge case raro), caemos a las palabras originales sin filtro.
  const allWords = trimmed.split(/\s+/).filter(Boolean)
  const significant = allWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
  const words = significant.length > 0 ? significant : allWords
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase()
  }
  // Una sola palabra: primera + segunda letra. Si solo hay UNA letra,
  // devolvemos esa letra duplicada.
  const w = words[0]
  if (!w) return '?'
  if (w.length === 1) return w.toUpperCase()
  return (w[0]! + w[1]!).toUpperCase()
}

type Size = 'sm' | 'md' | 'lg'

const SIZE_TOKENS: Record<Size, { box: string; text: string; border: string }> = {
  sm: { box: 'w-7 h-7', text: 'text-[11px]', border: 'border-l-2' },
  md: { box: 'w-10 h-10', text: 'text-sm', border: 'border-l-[3px]' },
  lg: { box: 'w-16 h-16', text: 'text-[22px]', border: 'border-l-[4px]' },
}

export function EntitySigil({
  name,
  type,
  size = 'md',
  className = '',
}: {
  name: string
  type: string
  size?: Size
  className?: string
}) {
  const monogram = monogramOf(name)
  const accent = typeAccent(type)
  const tokens = SIZE_TOKENS[size]

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center rounded-md bg-paper-100/70 border border-ink-100/60 ${tokens.box} ${tokens.border} ${className}`}
      style={{
        borderLeftColor: accent,
        color: accent,
      }}
      aria-hidden="true"
      title={name}
    >
      <span
        className={`font-serif font-medium tabular-nums ${tokens.text}`}
        style={{ letterSpacing: '-0.01em' }}
      >
        {monogram}
      </span>
    </div>
  )
}
