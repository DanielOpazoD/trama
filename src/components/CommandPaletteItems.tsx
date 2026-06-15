import { EntitySigil } from './EntitySigil'
import { ENTITY_TYPES } from '../types'
import type { ViewMode } from '../types/view'
import type { Item } from '../hooks/useCommandSearch'
import {
  ChatIcon,
  AtlasIcon,
  ConsultasIcon,
  CronologiaIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  KeyIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  SparkleIcon,
} from './Icons'

// Mínimo para construir el sublabel de una crónica ("crónica · marzo 2026").
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * θ5: highlight del match — partimos el texto en (pre, match, post) y
 * renderizamos la coincidencia en bold. Si query está vacío o no
 * matchea, devolvemos el texto plano.
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <strong className="text-ink-800 font-semibold">
        {text.slice(idx, idx + q.length)}
      </strong>
      {text.slice(idx + q.length)}
    </>
  )
}

/** Icono por view — el palette se escanea más rápido con glyph que con label. */
function ViewIcon({ view }: { view: ViewMode }) {
  const props = { size: 14, className: 'text-ink-400 shrink-0' }
  switch (view) {
    case 'inicio':
      return <HomeIcon {...props} />
    case 'grafo':
      return <GraphIcon {...props} />
    case 'entidades':
      return <EntitiesIcon {...props} />
    case 'citas':
      return <QuoteIcon {...props} />
    case 'momentos':
      return <MomentosIcon {...props} />
    case 'escuchas':
      return <MusicIcon {...props} />
    case 'cronologia':
      return <CronologiaIcon {...props} />
    case 'atlas':
      return <AtlasIcon {...props} />
    case 'chat':
      return <ChatIcon {...props} />
    case 'sugerencias':
      return <SparkleIcon {...props} />
  }
}

export function ItemRow({ item, query }: { item: Item; query: string }) {
  if (item.kind === 'view') {
    return (
      <>
        <ViewIcon view={item.view} />
        <span className="text-ink-700">
          <HighlightedText text={item.label} query={query} />
        </span>
        {item.hint && (
          <span className="text-ink-300 text-xs ml-2 truncate">— {item.hint}</span>
        )}
      </>
    )
  }
  if (item.kind === 'action') {
    return (
      <>
        <span
          className="size-3.5 inline-flex items-center justify-center rounded text-body leading-none font-medium shrink-0"
          style={{ color: 'var(--accent-primary)' }}
          aria-hidden
        >
          +
        </span>
        <span className="text-ink-700">
          <HighlightedText text={item.label} query={query} />
        </span>
        {item.hint && (
          <span className="text-ink-300 text-xs ml-2 truncate">— {item.hint}</span>
        )}
      </>
    )
  }
  if (item.kind === 'reveal') {
    return (
      <>
        <span className="shrink-0" style={{ color: 'var(--accent-sage)' }} aria-hidden>
          <KeyIcon size={14} />
        </span>
        <span className="text-ink-700">
          Abrir <HighlightedText text={item.label} query={query} />
        </span>
        <span className="text-ink-300 text-xs ml-2 truncate">
          — mundo Notas{item.hint ? ` ${item.hint}` : ''}
        </span>
      </>
    )
  }
  if (item.kind === 'savedQuery') {
    return (
      <>
        <ConsultasIcon size={14} className="text-ink-400 shrink-0" />
        <span className="text-ink-700">
          <HighlightedText text={item.name} query={query} />
        </span>
        <span className="text-micro uppercase tracking-eyebrow text-ink-300 ml-2 shrink-0">
          consulta guardada
        </span>
      </>
    )
  }
  if (item.kind === 'ask') {
    return (
      <>
        <span className="shrink-0" style={{ color: 'var(--accent-primary)' }} aria-hidden>
          <ConsultasIcon size={14} />
        </span>
        <span className="text-ink-700 truncate flex-1">
          Preguntar a tu trama: «{item.q}»
        </span>
        <span className="text-ink-300 text-xs ml-2 shrink-0 truncate max-w-[45%]">
          — interpreta lenguaje natural y filtros
        </span>
      </>
    )
  }
  if (item.kind === 'entity') {
    const label = ENTITY_TYPES.find((t) => t.value === item.type)?.label ?? item.type
    return (
      <>
        <EntitiesIcon size={14} className="text-ink-400 shrink-0" />
        <span className="text-ink-700">
          <HighlightedText text={item.name} query={query} />
        </span>
        <span className="text-micro uppercase tracking-eyebrow text-ink-300 ml-2">
          {label}
        </span>
      </>
    )
  }
  if (item.kind === 'quote') {
    return (
      <>
        <QuoteIcon size={14} className="text-ink-400 shrink-0" />
        <span className="text-ink-600 italic font-serif truncate flex-1">
          «
          <HighlightedText
            text={item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '')}
            query={query}
          />
          »
        </span>
        <span className="text-ink-300 text-xs ml-2 shrink-0">— {item.entityName}</span>
      </>
    )
  }
  if (item.kind === 'momento') {
    return (
      <>
        <MomentosIcon size={14} className="text-ink-400 shrink-0" />
        <span className="text-ink-600 truncate flex-1">
          <HighlightedText
            text={item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '')}
            query={query}
          />
        </span>
        <span className="text-micro uppercase tracking-eyebrow text-ink-300 ml-2 shrink-0">
          {item.momentoKind}
        </span>
      </>
    )
  }
  if (item.kind === 'cronica') {
    return (
      <>
        <SparkleIcon size={14} className="text-ink-400 shrink-0" />
        <span className="text-ink-600 italic font-serif truncate flex-1">
          <HighlightedText
            text={item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '')}
            query={query}
          />
        </span>
        <span className="text-micro uppercase tracking-eyebrow text-ink-300 ml-2 shrink-0">
          crónica · {MONTH_NAMES[item.month - 1]} {item.year}
        </span>
      </>
    )
  }
  return (
    <>
      <ChatIcon size={14} className="text-ink-400 shrink-0" />
      <span className="text-ink-600 truncate flex-1">
        <HighlightedText
          text={item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '')}
          query={query}
        />
      </span>
      <span className="text-ink-300 text-xs ml-2 shrink-0 truncate max-w-[40%]">
        — {item.threadTitle ?? 'chat'}
      </span>
    </>
  )
}

/**
 * Ola transversal 2026-06: la ficha del resultado resaltado. Convierte el
 * palette en un visor — ↑↓ hojea entidades, citas o momentos sin abrirlos.
 * Cada kind compone con su registro: la entidad como ficha de catálogo (sigil
 * + small caps), la cita como quote serif, lo demás sobrio.
 */
export function PeekPanel({
  item,
  entities,
}: {
  item: Item
  entities:
    | {
        id: string
        name: string
        type: string
        year?: number | null
        description?: string | null
      }[]
    | undefined
}) {
  if (item.kind === 'entity') {
    const full = entities?.find((e) => e.id === item.id)
    const typeLabel = ENTITY_TYPES.find((t) => t.value === item.type)?.label ?? item.type
    return (
      <div className="p-4 stack-2">
        <EntitySigil name={item.name} type={item.type} size="lg" />
        <p className="font-serif text-h2 text-ink-800 leading-tight">{item.name}</p>
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          {typeLabel}
          {full?.year ? ` · ${full.year}` : ''}
        </p>
        {full?.description && (
          <p className="text-caption text-ink-500 leading-relaxed line-clamp-6">
            {full.description}
          </p>
        )}
        <p className="text-micro text-ink-300 pt-1">enter abre su ficha completa</p>
      </div>
    )
  }
  if (item.kind === 'quote') {
    return (
      <div className="p-4 stack-2">
        <p className="quote-block font-serif italic text-body text-ink-700 leading-relaxed">
          «{item.text}»
        </p>
        <p className="text-caption text-ink-400">— {item.entityName}</p>
        <p className="text-micro text-ink-300 pt-1">enter abre la entidad de la cita</p>
      </div>
    )
  }
  if (item.kind === 'momento') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          momento · {item.momentoKind}
        </p>
        <p className="text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'cronica') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          crónica · {MONTH_NAMES[item.month - 1]} {item.year}
        </p>
        <p className="font-serif italic text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'chat') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          {item.threadTitle ?? 'conversación'}
        </p>
        <p className="text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'savedQuery') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          consulta guardada
        </p>
        <p className="font-serif text-h2 text-ink-800 leading-tight">{item.name}</p>
        <p className="text-micro text-ink-300 pt-1">enter ejecuta la consulta</p>
      </div>
    )
  }
  if (item.kind === 'ask') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          preguntar a tu trama
        </p>
        <p className="font-serif italic text-body text-ink-700 leading-relaxed">
          «{item.q}»
        </p>
        <p className="text-caption text-ink-500 leading-relaxed">
          La IA interpreta tu pregunta como una consulta (tipos, fechas, etiquetas) y
          responde con resultados de toda tu trama.
        </p>
        <p className="text-micro text-ink-300 pt-1">enter interpreta y busca</p>
      </div>
    )
  }
  return (
    <div className="p-4 stack-2">
      <p className="font-serif text-lead text-ink-700">{item.label}</p>
      {item.hint && (
        <p className="text-caption text-ink-400 leading-relaxed">{item.hint}</p>
      )}
      <p className="text-micro text-ink-300 pt-1">
        {item.kind === 'action' ? 'enter ejecuta la acción' : 'enter te lleva ahí'}
      </p>
    </div>
  )
}
