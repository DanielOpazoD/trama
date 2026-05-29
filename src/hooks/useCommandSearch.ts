import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../state'
import { api } from '../api'
import type { SearchResponse } from '../api'
import type { ViewMode } from '../types/view'

/**
 * Lógica de búsqueda del command palette (Cmd+K), extraída de
 * `CommandPalette.tsx` para que el componente quede como render + interacción
 * (foco, teclado, selección) y la búsqueda viva acá.
 *
 * Dos fuentes que se complementan:
 *   - Local (instantáneo, cada tecla): vistas + acciones + entidades
 *     (nombre/descripción/tipo) + citas (texto). Substring filter, sin
 *     red — mantiene el palette snappy para el caso común.
 *   - Servidor (debounced, q≥2, modo lexical = gratis): api.search trae lo
 *     que el filtro local no ve — momentos, crónicas, chat, y matches en el
 *     `essay`/contexto de entidades y citas. Se mergea sin pisar lo local
 *     (dedup por id), así no hay flicker ni regresión de velocidad.
 */

export type CommandAction =
  | 'open-settings'
  | 'open-shortcuts'
  | 'open-sortes'
  | 'open-espejo'
  | 'new-entity'
  | 'new-quote'
  | 'new-momento'

export type Item =
  | { kind: 'view'; view: ViewMode; label: string; hint?: string }
  | { kind: 'action'; action: CommandAction; label: string; hint?: string }
  | { kind: 'entity'; id: string; name: string; type: string }
  | { kind: 'quote'; id: string; entityId: string; text: string; entityName: string }
  | { kind: 'momento'; id: string; momentoKind: string; text: string }
  | { kind: 'cronica'; id: string; year: number; month: number; text: string }
  | {
      kind: 'chat'
      id: string
      threadId: string
      threadTitle: string | null
      text: string
    }

const VIEWS: Array<{ view: ViewMode; label: string; hint: string }> = [
  { view: 'inicio', label: 'Inicio', hint: 'la página principal' },
  { view: 'grafo', label: 'Grafo', hint: 'el mapa visual' },
  { view: 'entidades', label: 'Entidades', hint: 'personas, libros, vínculos' },
  { view: 'citas', label: 'Citas', hint: 'fragmentos guardados' },
  { view: 'momentos', label: 'Momentos', hint: 'la dimensión temporal de la trama' },
  { view: 'escuchas', label: 'Escuchas', hint: 'tu música reciente' },
  { view: 'cronologia', label: 'Cronología', hint: 'hojear el tiempo, por estaciones' },
  { view: 'atlas', label: 'Atlas', hint: 'constelaciones semánticas de tu trama' },
  { view: 'chat', label: 'Chat', hint: 'conversación con la IA' },
  { view: 'sugerencias', label: 'Sugerencias', hint: 'la IA revisa la trama' },
  { view: 'gabinete', label: 'Gabinete', hint: 'sortes, espejo, voz, hojas, postales' },
]

// Acciones rápidas — el palette no las navega, las despacha como callbacks
// al padre. Los hints son keywords que el filtro substring matchea.
const ACTIONS: Array<{ action: CommandAction; label: string; hint: string }> = [
  {
    action: 'new-entity',
    label: 'Nueva entidad',
    hint: 'crear persona, libro, canción, concepto',
  },
  { action: 'new-quote', label: 'Nueva cita', hint: 'guardar un fragmento' },
  { action: 'new-momento', label: 'Nuevo momento', hint: 'nota, recorte o foto del día' },
  {
    action: 'open-sortes',
    label: 'Sortes',
    hint: 'una cita al azar para releer · suerte del día',
  },
  {
    action: 'open-espejo',
    label: 'Espejo',
    hint: 'la composición de tu trama · tipos, épocas, lo más cruzado',
  },
  {
    action: 'open-settings',
    label: 'Configuración',
    hint: 'preferencias, tema, IA, datos',
  },
  { action: 'open-shortcuts', label: 'Atajos de teclado', hint: 'lista de shortcuts' },
]

export function useCommandSearch({
  open,
  actionsEnabled,
}: {
  open: boolean
  /** Incluir las acciones rápidas en los resultados (true si el padre pasó
   *  un `onAction`). */
  actionsEnabled: boolean
}): {
  query: string
  setQuery: (q: string) => void
  items: Item[]
  searching: boolean
} {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const [query, setQuery] = useState('')
  // N5: useDeferredValue mantiene el input snappy mientras la lista
  // filtrada se re-computa con un tick de retraso. Crítico con tramas
  // grandes (300+ entidades + 300+ citas): tipear rápido sin esto
  // siente "pegajoso" porque cada keystroke recomputaría el filter
  // sincrónicamente y bloquearía el render del input.
  const deferredQuery = useDeferredValue(query)
  // Resultados del servidor (momentos/crónicas/chat + matches extra en
  // essay/contexto). Null mientras no haya query ≥2 o la respuesta no llegó.
  const [serverResults, setServerResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)

  // Reset del estado de búsqueda al abrir el palette. El foco del input y
  // el índice resaltado los maneja el componente (son UI), acá solo limpiamos
  // la query y los resultados de servidor para no arrastrar la sesión previa.
  useEffect(() => {
    if (open) {
      setQuery('')
      setServerResults(null)
      setSearching(false)
    }
  }, [open])

  // Búsqueda en servidor: debounced, modo lexical (sin costo de embedding),
  // solo con query ≥2. Race-guarded — una respuesta vieja nunca pisa una
  // nueva. Si falla (offline, sin red en tests) degradamos a solo-local.
  useEffect(() => {
    const q = deferredQuery.trim()
    if (!open || q.length < 2) {
      setServerResults(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      api
        .search(q, { limit: 8, mode: 'lexical' })
        .then((res) => {
          if (!cancelled) setServerResults(res)
        })
        .catch(() => {
          if (!cancelled) setServerResults(null)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [deferredQuery, open])

  const items: Item[] = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const matchesView = VIEWS.filter(
      (v) => !q || v.label.toLowerCase().includes(q) || v.hint.toLowerCase().includes(q),
    ).map<Item>((v) => ({ kind: 'view', view: v.view, label: v.label, hint: v.hint }))

    const matchesAction = actionsEnabled
      ? ACTIONS.filter(
          (a) =>
            !q || a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
        ).map<Item>((a) => ({
          kind: 'action',
          action: a.action,
          label: a.label,
          hint: a.hint,
        }))
      : []

    // Local: filtro substring sobre lo ya cargado en memoria (instantáneo).
    const localEntities = entities
      .filter((e) => {
        if (!q) return true
        return (
          e.name.toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
        )
      })
      .slice(0, 20)
    const localQuotes = q
      ? quotes.filter((qt) => qt.text.toLowerCase().includes(q)).slice(0, 12)
      : []

    const entityItems = localEntities.map<Item>((e) => ({
      kind: 'entity',
      id: e.id,
      name: e.name,
      type: e.type,
    }))
    const quoteItems = localQuotes.map<Item>((qt) => ({
      kind: 'quote',
      id: qt.id,
      entityId: qt.entityId,
      text: qt.text,
      entityName: entities.find((e) => e.id === qt.entityId)?.name ?? '?',
    }))

    // Servidor: agrega lo que el filtro local no alcanza. Entidades/citas se
    // dedupean contra lo local; momentos/crónicas/chat son exclusivos del
    // servidor (el cliente no los tiene cargados).
    const sr = serverResults
    const localEntityIds = new Set(localEntities.map((e) => e.id))
    const localQuoteIds = new Set(localQuotes.map((qt) => qt.id))

    const serverEntityItems: Item[] = sr
      ? sr.entities
          .filter((e) => !localEntityIds.has(e.id))
          .map((e) => ({ kind: 'entity', id: e.id, name: e.name, type: e.type }))
      : []
    const serverQuoteItems: Item[] = sr
      ? sr.quotes
          .filter((qt) => !localQuoteIds.has(qt.id))
          .map((qt) => ({
            kind: 'quote',
            id: qt.id,
            entityId: qt.entityId,
            text: qt.text,
            entityName: qt.entityName,
          }))
      : []
    const momentoItems: Item[] = sr
      ? sr.momentos.map((m) => ({
          kind: 'momento',
          id: m.id,
          momentoKind: m.kind,
          text: m.text,
        }))
      : []
    const cronicaItems: Item[] = sr
      ? sr.cronicas.map((c) => ({
          kind: 'cronica',
          id: c.id,
          year: c.year,
          month: c.month,
          text: c.text,
        }))
      : []
    const chatItems: Item[] = sr
      ? sr.chat.map((c) => ({
          kind: 'chat',
          id: c.id,
          threadId: c.threadId,
          threadTitle: c.threadTitle,
          text: c.text,
        }))
      : []

    return [
      ...matchesView,
      ...matchesAction,
      ...entityItems,
      ...serverEntityItems,
      ...quoteItems,
      ...serverQuoteItems,
      ...momentoItems,
      ...cronicaItems,
      ...chatItems,
    ]
  }, [deferredQuery, entities, quotes, actionsEnabled, serverResults])

  return { query, setQuery, items, searching }
}
