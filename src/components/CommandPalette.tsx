import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../state'
import { ENTITY_TYPES } from '../types'
import type { ViewMode } from './Sidebar'
import {
  ChatIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  SparkleIcon,
} from './Icons'

// σ-followup: símbolo del modificador. Antes vivía en TopBar — al
// mover el atajo visual al palette, este módulo lo necesita propio.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

export type CommandAction =
  | 'open-settings'
  | 'open-shortcuts'
  | 'new-entity'
  | 'new-quote'
  | 'new-momento'

type Item =
  | { kind: 'view'; view: ViewMode; label: string; hint?: string }
  | { kind: 'action'; action: CommandAction; label: string; hint?: string }
  | { kind: 'entity'; id: string; name: string; type: string }
  | { kind: 'quote'; id: string; text: string; entityName: string }

const VIEWS: Array<{ view: ViewMode; label: string; hint: string }> = [
  { view: 'inicio', label: 'Inicio', hint: 'la página principal' },
  { view: 'grafo', label: 'Grafo', hint: 'el mapa visual' },
  { view: 'entidades', label: 'Entidades', hint: 'personas, libros, vínculos' },
  { view: 'citas', label: 'Citas', hint: 'fragmentos guardados' },
  { view: 'momentos', label: 'Momentos', hint: 'la dimensión temporal de la trama' },
  { view: 'escuchas', label: 'Escuchas', hint: 'tu música reciente' },
  { view: 'chat', label: 'Chat', hint: 'conversación con la IA' },
  { view: 'sugerencias', label: 'Sugerencias', hint: 'la IA revisa la trama' },
]

// Acciones rápidas — el palette no las navega, las despacha como callbacks
// al padre. Los hints son keywords que el filtro substring matchea.
const ACTIONS: Array<{ action: CommandAction; label: string; hint: string }> = [
  { action: 'new-entity', label: 'Nueva entidad', hint: 'crear persona, libro, canción, concepto' },
  { action: 'new-quote', label: 'Nueva cita', hint: 'guardar un fragmento' },
  { action: 'new-momento', label: 'Nuevo momento', hint: 'nota, recorte o foto del día' },
  { action: 'open-settings', label: 'Configuración', hint: 'preferencias, tema, IA, datos' },
  { action: 'open-shortcuts', label: 'Atajos de teclado', hint: 'lista de shortcuts' },
]

/**
 * Cmd+K palette. Search-as-you-type across views + entities + quotes.
 * Arrows navigate, Enter selects, Escape closes.
 *
 * Kept simple: no fuzzy matching beyond a substring filter on lowercased
 * normalized strings; results are capped at 20 of each kind. For 500
 * entities this is fast.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectEntity,
  onAction,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
  /** Acciones rápidas (Nueva entidad, Configuración, etc.). Si no se
      pasa, el palette las oculta. */
  onAction?: (action: CommandAction) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setFocusIdx(0)
      // Focus the input on the next tick so it lands after the dialog mounts.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matchesView = VIEWS.filter(
      (v) => !q || v.label.toLowerCase().includes(q) || v.hint.toLowerCase().includes(q),
    ).map<Item>((v) => ({ kind: 'view', view: v.view, label: v.label, hint: v.hint }))

    const matchesAction = onAction
      ? ACTIONS.filter(
          (a) => !q || a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
        ).map<Item>((a) => ({ kind: 'action', action: a.action, label: a.label, hint: a.hint }))
      : []

    const matchesEntity = entities
      .filter((e) => {
        if (!q) return true
        return (
          e.name.toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
        )
      })
      .slice(0, 20)
      .map<Item>((e) => ({ kind: 'entity', id: e.id, name: e.name, type: e.type }))

    const matchesQuote = q
      ? quotes
          .filter((qt) => qt.text.toLowerCase().includes(q))
          .slice(0, 12)
          .map<Item>((qt) => ({
            kind: 'quote',
            id: qt.id,
            text: qt.text,
            entityName: entities.find((e) => e.id === qt.entityId)?.name ?? '?',
          }))
      : []

    return [...matchesView, ...matchesAction, ...matchesEntity, ...matchesQuote]
  }, [query, entities, quotes, onAction])

  useEffect(() => {
    setFocusIdx(0)
  }, [query])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, focusIdx])

  function selectItem(item: Item) {
    if (item.kind === 'view') {
      onNavigate(item.view)
    } else if (item.kind === 'action') {
      onAction?.(item.action)
    } else if (item.kind === 'entity') {
      onSelectEntity(item.id)
    } else {
      // Quote → jump to its entity panel.
      const ent = entities.find((e) => e.id === quotes.find((q) => q.id === item.id)?.entityId)
      if (ent) onSelectEntity(ent.id)
    }
    onClose()
  }

  if (!open) return null

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Buscar"
        // σ-followup: centrado vertical real (top-1/2 + -translate-y-1/2)
        // en vez de top-[15vh]. Antes el modal vivía pegado al tercio
        // superior; ahora cae justo en el centro óptico de la pantalla.
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-xl z-40 animate-fade-up"
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
              className="w-full px-5 py-4 pr-16 bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none font-serif text-lg leading-none border-b border-ink-100/60"
              autoComplete="off"
            />
            <kbd
              aria-hidden
              className="absolute right-4 top-1/2 -translate-y-1/2 text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-400 leading-none font-mono"
            >
              {SHORTCUT_KEY} K
            </kbd>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto">
            {items.length === 0 && (
              <li className="px-5 py-6 text-ink-400 italic text-sm text-center">
                nada coincide
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
          <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between">
            <span>↑↓ navegar · enter abrir · esc cerrar</span>
            <span>{items.length} resultados</span>
          </div>
        </div>
      </div>
    </>
  )
}

function itemKey(item: Item): string {
  if (item.kind === 'view') return item.view
  if (item.kind === 'action') return item.action
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
      <strong className="text-ink-800 font-semibold">{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  )
}

/** Icono por view — el palette se escanea más rápido con glyph que con label. */
function ViewIcon({ view }: { view: ViewMode }) {
  const props = { size: 14, className: 'text-ink-400 shrink-0' }
  switch (view) {
    case 'inicio': return <HomeIcon {...props} />
    case 'grafo': return <GraphIcon {...props} />
    case 'entidades': return <EntitiesIcon {...props} />
    case 'citas': return <QuoteIcon {...props} />
    case 'momentos': return <MomentosIcon {...props} />
    case 'escuchas': return <MusicIcon {...props} />
    case 'chat': return <ChatIcon {...props} />
    case 'sugerencias': return <SparkleIcon {...props} />
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
          className="size-[14px] inline-flex items-center justify-center rounded text-[14px] leading-none font-medium shrink-0"
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
  return (
    <>
      <QuoteIcon size={14} className="text-ink-400 shrink-0" />
      <span className="text-ink-600 italic font-serif truncate flex-1">
        «<HighlightedText text={item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '')} query={query} />»
      </span>
      <span className="text-ink-300 text-xs ml-2 shrink-0">— {item.entityName}</span>
    </>
  )
}
