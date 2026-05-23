import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../state'
import { ENTITY_TYPES } from '../types'
import type { ViewMode } from './Sidebar'

type Item =
  | { kind: 'view'; view: ViewMode; label: string; hint?: string }
  | { kind: 'entity'; id: string; name: string; type: string }
  | { kind: 'quote'; id: string; text: string; entityName: string }

const VIEWS: Array<{ view: ViewMode; label: string; hint: string }> = [
  { view: 'inicio', label: 'Inicio', hint: 'la página principal' },
  { view: 'grafo', label: 'Grafo', hint: 'el mapa visual' },
  { view: 'entidades', label: 'Entidades', hint: 'lista de personas, libros, etc.' },
  { view: 'citas', label: 'Citas', hint: 'fragmentos guardados' },
  { view: 'relaciones', label: 'Relaciones', hint: 'vínculos entre entidades' },
  { view: 'escuchas', label: 'Escuchas', hint: 'tu música reciente' },
  { view: 'chat', label: 'Chat', hint: 'conversación con la IA' },
  { view: 'sugerencias', label: 'Sugerencias', hint: 'la IA revisa la trama' },
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
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
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

    return [...matchesView, ...matchesEntity, ...matchesQuote]
  }, [query, entities, quotes])

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
        className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-[90vw] max-w-xl z-40 animate-fade-up"
      >
        <div className="bg-paper-50 border border-ink-100/80 rounded-2xl shadow-2xl shadow-ink-900/30 overflow-hidden">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="w-full px-5 py-4 bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none font-serif text-lg leading-none border-b border-ink-100/60"
            autoComplete="off"
          />
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
                  <ItemRow item={item} />
                </button>
              </li>
            ))}
          </ul>
          <div className="px-5 py-2 border-t border-ink-100/60 text-[10px] uppercase tracking-[0.18em] text-ink-300 flex justify-between">
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
  if (item.kind === 'entity') return item.id
  return item.id
}

function ItemRow({ item }: { item: Item }) {
  if (item.kind === 'view') {
    return (
      <>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300 w-20 shrink-0">
          ir a
        </span>
        <span className="text-ink-700">{item.label}</span>
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
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300 w-20 shrink-0">
          entidad
        </span>
        <span className="text-ink-700">{item.name}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300 ml-2">
          {label}
        </span>
      </>
    )
  }
  return (
    <>
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300 w-20 shrink-0">
        cita
      </span>
      <span className="text-ink-600 italic font-serif truncate flex-1">
        «{item.text.slice(0, 80)}{item.text.length > 80 ? '…' : ''}»
      </span>
      <span className="text-ink-300 text-xs ml-2 shrink-0">— {item.entityName}</span>
    </>
  )
}
