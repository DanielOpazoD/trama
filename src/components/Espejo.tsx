import { useMemo, useEffect } from 'react'
import { useEntitiesQuery, useQuotesQuery, useRelationshipsQuery } from '../state'
import { ENTITY_TYPES } from '../types'
import type { Entity, Quote, Relationship } from '../types'
import { CloseIcon, EndMark } from './Icons'

/**
 * Espejo — la composición de la trama, devuelta como un retrato y no como
 * un panel de métricas.
 *
 * Describe QUÉ hay (tipos, épocas, lo más cruzado, cuánto vino de la IA,
 * cuánto resonó) sin juzgar ni sugerir nada. Es un espejo: refleja, no
 * aconseja. Tono de carta — frases declarativas en Spectral, no bullets de
 * dashboard.
 *
 * Cliente-only: compone sobre las queries ya cacheadas (entidades,
 * relaciones, citas). Sin endpoint ni migración — la nota original pedía
 * facetas (idioma, época, género) que no guardamos; esto reformula sobre
 * lo que la trama sí sabe de sí misma.
 */

export type EspejoComposition = {
  totals: { entities: number; quotes: number; relationships: number }
  topTypes: { label: string; count: number; pct: number }[]
  topEras: { label: string; count: number }[]
  earliestYear: number | null
  latestYear: number | null
  mostConnected: { id: string; name: string; degree: number }[]
  aiEntities: number
  resonance: { marked: number; avg: number | null }
  /** Ola transversal 2026-06 — "estado del archivo": el ritmo de captura.
      Cuándo empezó la trama y en qué franja/día sueles tejerla. */
  ritmo: {
    firstEntryAt: string | null
    daysWeaving: number | null
    band: string | null
    weekday: string | null
  }
}

function typeLabel(type: string): string {
  return ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

function toRoman(n: number): string {
  let out = ''
  let rest = n
  for (const [value, sym] of ROMAN) {
    while (rest >= value) {
      out += sym
      rest -= value
    }
  }
  return out
}

function centuryLabel(year: number): string {
  // Años negativos (a.C.) caen fuera del modelo simple; los etiquetamos
  // aparte para no romper el romano.
  if (year <= 0) return 'la Antigüedad'
  const century = Math.floor((year - 1) / 100) + 1
  return `siglo ${toRoman(century)}`
}

export function composeEspejo(
  entities: Entity[],
  relationships: Relationship[],
  quotes: Quote[],
): EspejoComposition {
  const totalEntities = entities.length

  const byType = new Map<string, number>()
  for (const e of entities) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
  const topTypes = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({
      label: typeLabel(type),
      count,
      pct: totalEntities ? Math.round((count / totalEntities) * 100) : 0,
    }))

  const withYear = entities.filter(
    (e): e is Entity & { year: number } => typeof e.year === 'number',
  )
  const byCentury = new Map<string, number>()
  for (const e of withYear) {
    const label = centuryLabel(e.year)
    byCentury.set(label, (byCentury.get(label) ?? 0) + 1)
  }
  const topEras = [...byCentury.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }))
  const years = withYear.map((e) => e.year).sort((a, b) => a - b)
  const earliestYear = years[0] ?? null
  const latestYear = years[years.length - 1] ?? null

  const degree = new Map<string, number>()
  for (const r of relationships) {
    degree.set(r.fromId, (degree.get(r.fromId) ?? 0) + 1)
    degree.set(r.toId, (degree.get(r.toId) ?? 0) + 1)
  }
  const nameById = new Map(entities.map((e) => [e.id, e.name]))
  const mostConnected = [...degree.entries()]
    .filter(([id]) => nameById.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, deg]) => ({ id, name: nameById.get(id) ?? '?', degree: deg }))

  const aiEntities = entities.filter((e) => e.origin.kind === 'ai').length

  const resonant = quotes.filter(
    (q): q is Quote & { resonance: number } => typeof q.resonance === 'number',
  )
  const marked = resonant.length
  const avg = marked
    ? Math.round((resonant.reduce((s, q) => s + q.resonance, 0) / marked) * 10) / 10
    : null

  // El ritmo se lee de los createdAt de entidades + citas (los gestos de
  // captura del usuario). Franja horaria y día de la semana más frecuentes,
  // y la primera entrada del archivo.
  const stamps = [...entities, ...quotes]
    .map((item) => new Date(item.createdAt))
    .filter((d) => !Number.isNaN(d.getTime()))
  const bandOf = (h: number) =>
    h < 6
      ? 'de madrugada'
      : h < 12
        ? 'por la mañana'
        : h < 19
          ? 'por la tarde'
          : 'de noche'
  const bandCount = new Map<string, number>()
  const dayCount = new Map<number, number>()
  for (const d of stamps) {
    const band = bandOf(d.getHours())
    bandCount.set(band, (bandCount.get(band) ?? 0) + 1)
    dayCount.set(d.getDay(), (dayCount.get(d.getDay()) ?? 0) + 1)
  }
  const WEEKDAYS = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ]
  const topBand = [...bandCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const topDay = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const firstStamp = stamps.length
    ? stamps.reduce((min, d) => (d < min ? d : min), stamps[0]!)
    : null
  const ritmo = {
    firstEntryAt: firstStamp ? firstStamp.toISOString() : null,
    daysWeaving: firstStamp
      ? Math.max(1, Math.floor((Date.now() - firstStamp.getTime()) / 86_400_000) + 1)
      : null,
    band: topBand,
    weekday: topDay ? (WEEKDAYS[topDay[0]] ?? null) : null,
  }

  return {
    totals: {
      entities: totalEntities,
      quotes: quotes.length,
      relationships: relationships.length,
    },
    topTypes,
    topEras,
    earliestYear,
    latestYear,
    mostConnected,
    aiEntities,
    resonance: { marked, avg },
    ritmo,
  }
}

export function Espejo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const { data: quotes = [] } = useQuotesQuery()

  const data = useMemo(
    () => composeEspejo(entities, relationships, quotes),
    [entities, relationships, quotes],
  )

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const empty = data.totals.entities === 0
  const lead = data.mostConnected[0]

  return (
    <div
      role="dialog"
      aria-label="Espejo"
      className="fixed inset-0 z-50 flex flex-col bg-paper-50 animate-fade-up overflow-y-auto"
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed top-5 right-5 p-2 text-ink-300 hover:text-ink-700 transition-colors"
      >
        <CloseIcon />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <p className="text-micro uppercase tracking-shout text-ink-300 mb-10">espejo</p>

        {empty ? (
          <p className="font-serif italic text-lead text-ink-400 max-w-md text-center leading-relaxed">
            Tu trama todavía está en blanco. Cuando empiece a poblarse, este espejo te
            devolverá su forma.
          </p>
        ) : (
          <article className="max-w-xl font-serif text-ink-600 text-lead leading-loose space-y-5">
            <p>
              Hoy tu trama reúne{' '}
              <strong className="font-medium text-ink-800">{data.totals.entities}</strong>{' '}
              entidades,{' '}
              <strong className="font-medium text-ink-800">{data.totals.quotes}</strong>{' '}
              citas y{' '}
              <strong className="font-medium text-ink-800">
                {data.totals.relationships}
              </strong>{' '}
              vínculos entre ellas.
            </p>

            {data.topTypes.length > 0 && (
              <p>
                La componen sobre todo{' '}
                {data.topTypes.map((t, i) => (
                  <span key={t.label}>
                    {i > 0 && (i === data.topTypes.length - 1 ? ' y ' : ', ')}
                    {t.label} <span className="text-ink-400">({t.count})</span>
                  </span>
                ))}
                .
              </p>
            )}

            {data.earliestYear !== null && data.latestYear !== null && (
              <p>
                {data.earliestYear === data.latestYear ? (
                  <>Lo fechado se sitúa en el año {data.earliestYear}.</>
                ) : (
                  <>
                    Lo más antiguo que fechaste es del año {data.earliestYear}; lo más
                    reciente, del {data.latestYear}.
                  </>
                )}
                {data.topEras[0] && (
                  <> La mayor parte se concentra en el {data.topEras[0].label}.</>
                )}
              </p>
            )}

            {lead && lead.degree > 0 && (
              <p>
                Lo más cruzado de toda la trama es{' '}
                <strong className="font-medium text-ink-800">{lead.name}</strong>,
                presente en {lead.degree} {lead.degree === 1 ? 'vínculo' : 'vínculos'}.
              </p>
            )}

            {data.aiEntities > 0 && (
              <p>
                De esas entidades, {data.aiEntities}{' '}
                {data.aiEntities === 1 ? 'la propuso' : 'las propuso'} la IA; el resto las
                pusiste tú.
              </p>
            )}

            {data.resonance.marked > 0 && data.resonance.avg !== null && (
              <p>
                Marcaste {data.resonance.marked}{' '}
                {data.resonance.marked === 1 ? 'cita' : 'citas'} con resonancia; en
                promedio, {data.resonance.avg} sobre 5.
              </p>
            )}

            {data.ritmo.firstEntryAt && data.ritmo.daysWeaving && (
              <p>
                Empezaste a tejer el{' '}
                {new Date(data.ritmo.firstEntryAt).toLocaleDateString('es', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {data.ritmo.daysWeaving > 1 && (
                  <>
                    {' '}
                    — llevas{' '}
                    <strong className="font-medium text-ink-800">
                      {data.ritmo.daysWeaving} días
                    </strong>{' '}
                    con este archivo
                  </>
                )}
                .
                {data.ritmo.band && (
                  <>
                    {' '}
                    Sueles capturar {data.ritmo.band}
                    {data.ritmo.weekday && <>, sobre todo los {data.ritmo.weekday}</>}.
                  </>
                )}
              </p>
            )}

            <div className="pt-4 flex justify-center text-ink-200">
              <EndMark />
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
