import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useCountsQuery, useEntitiesQuery, useQuotesQuery } from '../state'
import { useSavedQueries } from '../state/useSavedQueries'
import { api } from '../api'
import type { SearchResponse } from '../api'
import type { QueryInput } from '../api/query'
import type { ViewMode } from '../types/view'
import type { NotasSection } from '../types/notas'
import { useSectionVisibility } from './useSectionVisibility'
import { useSectionPin } from './useSectionPin'
import { useSectionAlias } from './useSectionAlias'
import { useModuleVisibility } from './useModuleVisibility'
import { isPinEnabled } from '../components/AppPinGate'
import { SECTIONS } from '../components/notas/NotasWorldChrome'
import { MODULE_ALIASES } from '../components/notas/moduleAliases'
import { NAV_GROUPS } from '../lib/navigation'

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
  | 'open-careo'
  | 'new-entity'
  | 'new-quote'
  | 'new-momento'

export type Item =
  | { kind: 'view'; view: ViewMode; label: string; hint?: string }
  | { kind: 'action'; action: CommandAction; label: string; hint?: string }
  | { kind: 'reveal'; moduleId: NotasSection; label: string; hint?: string }
  | { kind: 'ask'; q: string }
  | { kind: 'savedQuery'; id: string; name: string; query: QueryInput }
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

const VIEW_HINTS: Record<ViewMode, string> = {
  inicio: 'entrada a la trama',
  entidades: 'personas, obras y conceptos',
  citas: 'fragmentos guardados',
  momentos: 'notas y escenas del tiempo',
  escuchas: 'música reciente',
  twitter: 'bookmarks de X/Twitter',
  grafo: 'mapa de relaciones',
  cronologia: 'lectura temporal',
  atlas: 'constelaciones temáticas',
  chat: 'conversación con tu archivo',
  sugerencias: 'ronda proactiva de IA',
}

const VIEWS: Array<{ view: ViewMode; label: string; hint: string }> = NAV_GROUPS.flatMap(
  (group) =>
    group.items.map((item) => ({
      view: item.value,
      label: item.label,
      hint: group.label
        ? `${group.label} · ${VIEW_HINTS[item.value]}`
        : VIEW_HINTS[item.value],
    })),
)

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
    label: 'Atril',
    hint: 'releer el archivo · cita del día · sortes · al azar',
  },
  {
    action: 'open-espejo',
    label: 'Espejo',
    hint: 'la composición de tu trama · tipos, épocas, lo más cruzado',
  },
  {
    action: 'open-careo',
    label: 'Careo',
    hint: 'dos voces frente a frente · citas en doble página',
  },
  {
    action: 'open-settings',
    label: 'Configuración',
    hint: 'preferencias, tema, IA, datos',
  },
  { action: 'open-shortcuts', label: 'Atajos de teclado', hint: 'lista de shortcuts' },
]

const LOCAL_SEARCH_MAX_ITEMS = 1000

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
  entitiesForPeek:
    | {
        id: string
        name: string
        type: string
        year?: number | null
        description?: string | null
      }[]
    | undefined
} {
  const { data: counts } = useCountsQuery()
  const localSearchEnabled =
    open && !!counts && counts.entities + counts.quotes <= LOCAL_SEARCH_MAX_ITEMS
  const { data: entities = [] } = useEntitiesQuery({ enabled: localSearchEnabled })
  const { data: quotes = [] } = useQuotesQuery({ enabled: localSearchEnabled })
  const { data: savedQueriesData } = useSavedQueries()
  const sectionVis = useSectionVisibility()
  const moduleVis = useModuleVisibility()
  const { isPinRequired } = useSectionPin()
  const { sectionAliases } = useSectionAlias()
  const pinActive = isPinEnabled()
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
    const matchesView = VIEWS.filter((v) => {
      if (!q) return true
      if (v.label.toLowerCase().includes(q) || v.hint.toLowerCase().includes(q))
        return true

      const customAlias = (sectionAliases[v.view] ?? '').trim().toLowerCase()
      if (customAlias) {
        const cleanQ = q.startsWith('#') ? q.slice(1) : q
        const cleanAlias = customAlias.startsWith('#')
          ? customAlias.slice(1)
          : customAlias
        if (cleanAlias === cleanQ || cleanAlias.includes(cleanQ)) return true
      }
      return false
    }).map<Item>((v) => {
      // Annotate hidden/protected Trama sections for discoverability.
      const hidden = !sectionVis.isVisible(v.view)
      const pinned = pinActive && isPinRequired(v.view)
      const suffix =
        hidden && pinned
          ? ' (oculta · protegida 🔒)'
          : hidden
            ? ' (oculta)'
            : pinned
              ? ' (protegida 🔒)'
              : ''
      return { kind: 'view', view: v.view, label: v.label, hint: v.hint + suffix }
    })

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
    // Se desactiva cuando counts supera el umbral: ahí el palette usa
    // /api/search para no descargar entidades/citas completas solo por abrir ⌘K.
    const localEntities = localSearchEnabled
      ? entities
          .filter((e) => {
            if (!q) return true
            return (
              e.name.toLowerCase().includes(q) ||
              (e.description ?? '').toLowerCase().includes(q) ||
              e.type.toLowerCase().includes(q)
            )
          })
          .slice(0, 20)
      : []
    const localQuotes =
      q && localSearchEnabled
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

    // Comando o alias para revelar/abrir un módulo del mundo Notas,
    // cruzando de mundo. Se busca por label, alias por defecto, o alias personalizado.
    const revealItems: Item[] = SECTIONS.filter((s) => {
      if (!q) return false

      // Match label
      if (s.label.toLowerCase().includes(q)) return true

      // Match default alias (token or with prefix)
      const hasDefaultAlias = MODULE_ALIASES.some(
        (a) =>
          a.moduleId === s.id && (a.token.includes(q) || ('#' + a.token).includes(q)),
      )
      if (hasDefaultAlias) return true

      // Match custom alias
      const customAlias = (sectionAliases[`notas:${s.id}`] ?? '').trim().toLowerCase()
      if (customAlias) {
        const cleanQ = q.startsWith('#') ? q.slice(1) : q
        const cleanAlias = customAlias.startsWith('#')
          ? customAlias.slice(1)
          : customAlias
        if (cleanAlias === cleanQ || cleanAlias.includes(cleanQ)) return true
      }
      return false
    }).map<Item>((s) => {
      // Annotate hidden/protected Notas sections for discoverability.
      const hidden = !moduleVis.isVisible(s.id)
      const pinned = pinActive && isPinRequired(`notas:${s.id}`)
      const suffix =
        hidden && pinned
          ? ' (oculta · protegida 🔒)'
          : hidden
            ? ' (oculta)'
            : pinned
              ? ' (protegida 🔒)'
              : ''
      return {
        kind: 'reveal',
        moduleId: s.id,
        label: s.label,
        hint: suffix || undefined,
      }
    })

    // Consultas guardadas: con query vacía actúan como acceso rápido (top 6);
    // con texto, filtran por substring del nombre. Se ubican cerca del tope
    // (tras reveal/view/action) para que sean fáciles de alcanzar, antes de
    // los resultados de entidad/cita.
    const savedQueries = savedQueriesData?.items ?? []
    const savedQueryItems: Item[] = (
      q
        ? savedQueries.filter((sq) => sq.name.toLowerCase().includes(q))
        : savedQueries.slice(0, 6)
    ).map<Item>((sq) => ({
      kind: 'savedQuery',
      id: sq.id,
      name: sq.name,
      query: sq.query,
    }))

    // "Preguntar a tu trama": un único item al final que interpreta lenguaje
    // natural. Solo cuando hay al menos 3 caracteres tipeados.
    const rawQ = deferredQuery.trim()
    const askItems: Item[] = rawQ.length >= 3 ? [{ kind: 'ask', q: rawQ }] : []

    return [
      ...revealItems,
      ...matchesView,
      ...matchesAction,
      ...savedQueryItems,
      ...entityItems,
      ...serverEntityItems,
      ...quoteItems,
      ...serverQuoteItems,
      ...momentoItems,
      ...cronicaItems,
      ...chatItems,
      ...askItems,
    ]
  }, [
    deferredQuery,
    entities,
    localSearchEnabled,
    quotes,
    actionsEnabled,
    serverResults,
    savedQueriesData,
    sectionVis,
    moduleVis,
    isPinRequired,
    sectionAliases,
    pinActive,
  ])

  return { query, setQuery, items, searching, entitiesForPeek: entities }
}
