import { useCallback, useEffect, useRef, useState } from 'react'
import { useEntitiesQuery } from '../state'
import { EntitySigil } from './EntitySigil'
import { ENTITY_TYPES } from '../types'
import type { ViewMode } from './Sidebar'
import {
  useCommandSearch,
  type CommandAction,
  type Item,
} from '../hooks/useCommandSearch'
import type { NotasSection } from '../types/notas'
import {
  ChatIcon,
  AtlasIcon,
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

// `CommandAction` se define en useCommandSearch; lo re-exportamos acá para no
// romper imports existentes que lo toman desde este módulo.
export type { CommandAction }

// σ-followup: símbolo del modificador. Antes vivía en TopBar — al
// mover el atajo visual al palette, este módulo lo necesita propio.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

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
 * Cmd+K palette. Search-as-you-type across views + entities + quotes.
 * Arrows navigate, Enter selects, Escape closes.
 *
 * La búsqueda (query, filtro local + servidor, items) vive en
 * `useCommandSearch`. Este componente se queda con la presentación y la
 * interacción: foco del input, navegación por teclado y despacho de la
 * selección a los callbacks del padre.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectEntity,
  onAction,
  onOpenThread,
  onRevealNotasModule,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
  /** Acciones rápidas (Nueva entidad, Configuración, etc.). Si no se
      pasa, el palette las oculta. */
  onAction?: (action: CommandAction) => void
  /** Abrir un hilo de chat por id (para resultados de tipo chat). Si no se
      pasa, los resultados de chat navegan a la vista Chat sin hilo. */
  onOpenThread?: (threadId: string) => void
  /** Revelar/abrir un módulo del mundo Notas (cruza de mundo). Para el comando
      "#pass" → Claves desde el ⌘K del mundo principal. */
  onRevealNotasModule?: (moduleId: NotasSection) => void
}) {
  const { query, setQuery, items, searching } = useCommandSearch({
    open,
    actionsEnabled: Boolean(onAction),
  })
  // Para el peek de entidades: lee la query YA cacheada (no dispara red extra
  // — el palette solo se monta abierto y las entidades viven en caché).
  const entities = useEntitiesQuery().data
  const [focusIdx, setFocusIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Foco del input + reset del índice resaltado al abrir. La query y los
  // resultados de servidor los resetea useCommandSearch.
  useEffect(() => {
    if (open) {
      setFocusIdx(0)
      // Focus the input on the next tick so it lands after the dialog mounts.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    setFocusIdx(0)
  }, [query])

  const selectItem = useCallback(
    (item: Item) => {
      switch (item.kind) {
        case 'view':
          onNavigate(item.view)
          break
        case 'action':
          onAction?.(item.action)
          break
        case 'entity':
          onSelectEntity(item.id)
          break
        case 'quote':
          // Cita → abrir el panel de su entidad.
          onSelectEntity(item.entityId)
          break
        case 'momento':
          // No hay deep-link a un momento puntual (lista infinita); llevamos
          // a la vista Momentos.
          onNavigate('momentos')
          break
        case 'cronica':
          // Las crónicas viven en Inicio.
          onNavigate('inicio')
          break
        case 'chat':
          if (onOpenThread) onOpenThread(item.threadId)
          else onNavigate('chat')
          break
        case 'reveal':
          onRevealNotasModule?.(item.moduleId)
          break
      }
      onClose()
    },
    [onAction, onClose, onNavigate, onOpenThread, onRevealNotasModule, onSelectEntity],
  )

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[focusIdx]
        if (item) selectItem(item)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, items, focusIdx, onClose, selectItem])

  if (!open) return null

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      {/* ω: contenedor full-screen que centra el diálogo con flexbox. El
          centrado va acá y NO en un transform del propio diálogo: la animación
          animate-fade-up del card también usa transform y pisaba el translate
          de centrado (-translate-x/y-1/2), corriendo el modal hacia abajo y a
          la derecha y cortándole el borde inferior. pointer-events-none deja
          pasar el clic al backdrop; el card lo recaptura con
          pointer-events-auto. */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-label="Buscar"
          className="w-full max-w-xl md:max-w-3xl pointer-events-auto animate-fade-up"
        >
          <div className="bg-paper-50 border border-ink-100/80 rounded-xl shadow-lg shadow-ink-900/15 overflow-hidden">
            {/* σ-followup: kbd visible del atajo arriba derecha del input —
              se movió desde el sidebar trigger. Da sentido ver "⌘ K"
              cuando el modal está abierto: refuerza el atajo en el
              contexto donde aporta. */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full px-5 py-4 pr-16 bg-transparent text-ink-700 placeholder:text-ink-300 font-serif text-lg leading-none border-b border-ink-100/60"
                autoComplete="off"
              />
              <kbd
                aria-hidden
                className="absolute right-4 top-1/2 -translate-y-1/2 text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-400 leading-none font-mono"
              >
                {SHORTCUT_KEY} K
              </kbd>
            </div>
            <div className="flex">
              <ul className="max-h-[50vh] overflow-y-auto flex-1 min-w-0">
                {items.length === 0 && (
                  <li className="px-5 py-6 text-ink-400 italic text-sm text-center">
                    {searching ? 'buscando…' : 'nada coincide'}
                  </li>
                )}
                {items.map((item, idx) => (
                  <li key={`${item.kind}-${itemKey(item)}`}>
                    <button
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setFocusIdx(idx)}
                      className={`w-full text-left px-5 py-2.5 flex items-baseline gap-3 transition-colors ${
                        idx === focusIdx ? 'bg-paper-100/70' : 'hover:bg-paper-100/40'
                      }`}
                    >
                      <ItemRow item={item} query={query} />
                    </button>
                  </li>
                ))}
              </ul>
              {/* Peek: ficha del resultado resaltado (solo desktop). Navegar
                  con ↑↓ hojea las fichas sin abrir nada. */}
              {items[focusIdx] && (
                <aside
                  aria-label="Vista previa del resultado"
                  className="hidden md:block w-72 shrink-0 border-l border-ink-100/60 bg-paper-100/30 max-h-[50vh] overflow-y-auto"
                >
                  <PeekPanel item={items[focusIdx]} entities={entities} />
                </aside>
              )}
            </div>
            <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between">
              <span>↑↓ navegar · enter abrir · esc cerrar</span>
              <span>{items.length} resultados</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function itemKey(item: Item): string {
  if (item.kind === 'view') return item.view
  if (item.kind === 'action') return item.action
  if (item.kind === 'reveal') return `reveal-${item.moduleId}`
  if (item.kind === 'entity') return item.id
  return item.id
}

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

function ItemRow({ item, query }: { item: Item; query: string }) {
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
    // Glyph genérico para acciones — el "+" comunica "crear/abrir algo"
    // sin requerir ícono dedicado por acción. Color accent-primary
    // refuerza que es una acción IA-aware, no navegación.
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
  // chat
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
function PeekPanel({
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
  // view / action / reveal — descripción sobria del destino.
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
