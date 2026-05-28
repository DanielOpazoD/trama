/**
 * Estaciones para la Cronología (Bloque #4).
 *
 * El timeline agrupa el tiempo por estación, no por mes: es una superficie
 * de *lectura* (hojear el tiempo), y las estaciones dan ese ritmo editorial
 * más amplio que un encabezado por mes.
 *
 * HEMISFERIO SUR. La app es personal y de un usuario rioplatense (el voseo
 * de CLAUDE.md — "agregalo", "creá", "splitea" — y el español del proyecto
 * lo sitúan en Argentina). Si algún día se usa en el hemisferio norte, todo
 * el ajuste vive en este único helper: invertir el mapeo de meses → estación.
 *
 *   Verano     dic · ene · feb
 *   Otoño      mar · abr · may
 *   Invierno   jun · jul · ago
 *   Primavera  sep · oct · nov
 *
 * El verano cruza el cambio de año: diciembre se cuenta como el verano del
 * año SIGUIENTE, para que "Verano 2026" agrupe dic-2025 + ene/feb-2026 en
 * una sola estación contigua en vez de partirla en dos.
 */

export type Season = 'verano' | 'otoño' | 'invierno' | 'primavera'

export type SeasonKey = {
  season: Season
  /** Año "narrativo" de la estación (para verano, el del ene/feb que cierra). */
  year: number
}

/** Mapea una fecha a su estación del hemisferio sur. Usa hora local. */
export function seasonOf(date: Date): SeasonKey {
  const m = date.getMonth() // 0 = enero
  const y = date.getFullYear()
  if (m === 11) return { season: 'verano', year: y + 1 } // diciembre
  if (m <= 1) return { season: 'verano', year: y } // ene, feb
  if (m <= 4) return { season: 'otoño', year: y } // mar, abr, may
  if (m <= 7) return { season: 'invierno', year: y } // jun, jul, ago
  return { season: 'primavera', year: y } // sep, oct, nov
}

/** Clave estable para agrupar y para `key` de React: "verano-2026". */
export function seasonKeyString(key: SeasonKey): string {
  return `${key.season}-${key.year}`
}

const SEASON_LABEL: Record<Season, string> = {
  verano: 'Verano',
  otoño: 'Otoño',
  invierno: 'Invierno',
  primavera: 'Primavera',
}

/** Etiqueta de encabezado: "Verano 2026". */
export function formatSeason(key: SeasonKey): string {
  return `${SEASON_LABEL[key.season]} ${key.year}`
}
