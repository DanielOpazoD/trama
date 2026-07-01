import type { SearchResponse } from '../api'
import type { QueryInput } from '../api/query'
import type { NotasSection } from '../types/notas'
import type { ViewMode } from '../types/view'
import { NAV_GROUPS } from '../lib/navigation'
import { SECTIONS } from '../components/notas/notasSections'
import { MODULE_ALIASES } from '../components/notas/moduleAliases'

export type CommandAction =
  | 'open-settings'
  | 'open-shortcuts'
  | 'open-sortes'
  | 'open-espejo'
  | 'open-careo'
  | 'new-entity'
  | 'new-quote'
  | 'new-momento'

export type CommandSearchItem =
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

export type CommandSearchEntity = {
  id: string
  name: string
  type: string
  year?: number | null
  description?: string | null
}

export type CommandSearchQuote = {
  id: string
  entityId: string
  text: string
}

export type CommandSearchSavedQuery = {
  id: string
  name: string
  query: QueryInput
}

type VisibilityTarget = ViewMode | `notas:${NotasSection}`

type CommandSearchVisibility = {
  isViewVisible: (view: ViewMode) => boolean
  isModuleVisible: (moduleId: NotasSection) => boolean
  isPinRequired: (id: VisibilityTarget) => boolean
  pinActive: boolean
}

export type CommandSearchBuildInput = {
  query: string
  actionsEnabled: boolean
  localSearchEnabled: boolean
  entities: CommandSearchEntity[]
  quotes: CommandSearchQuote[]
  savedQueries: CommandSearchSavedQuery[]
  serverResults: SearchResponse | null
  sectionAliases: Record<string, string | undefined>
  visibility: CommandSearchVisibility
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

const LOCAL_ENTITY_LIMIT = 20
const LOCAL_QUOTE_LIMIT = 12

type Ranked<T> = {
  item: T
  score: number
  index: number
}

export function buildCommandSearchItems({
  query,
  actionsEnabled,
  localSearchEnabled,
  entities,
  quotes,
  savedQueries,
  serverResults,
  sectionAliases,
  visibility,
}: CommandSearchBuildInput): CommandSearchItem[] {
  const q = normalizeQuery(query)
  const revealItems = buildRevealItems(q, sectionAliases, visibility)
  const viewItems = buildViewItems(q, sectionAliases, visibility)
  const actionItems = actionsEnabled ? buildActionItems(q) : []
  const savedQueryItems = buildSavedQueryItems(q, savedQueries)
  const localEntities = localSearchEnabled
    ? rankLocalEntities(q, entities).slice(0, LOCAL_ENTITY_LIMIT)
    : []
  const localQuotes =
    q && localSearchEnabled ? rankLocalQuotes(q, quotes).slice(0, LOCAL_QUOTE_LIMIT) : []

  const entityItems = localEntities.map<CommandSearchItem>((e) => ({
    kind: 'entity',
    id: e.id,
    name: e.name,
    type: e.type,
  }))
  const quoteItems = localQuotes.map<CommandSearchItem>((qt) => ({
    kind: 'quote',
    id: qt.id,
    entityId: qt.entityId,
    text: qt.text,
    entityName: entities.find((e) => e.id === qt.entityId)?.name ?? '?',
  }))

  const localEntityIds = new Set(localEntities.map((e) => e.id))
  const localQuoteIds = new Set(localQuotes.map((qt) => qt.id))

  const serverEntityItems: CommandSearchItem[] = serverResults
    ? serverResults.entities
        .filter((e) => !localEntityIds.has(e.id))
        .map((e) => ({ kind: 'entity', id: e.id, name: e.name, type: e.type }))
    : []
  const serverQuoteItems: CommandSearchItem[] = serverResults
    ? serverResults.quotes
        .filter((qt) => !localQuoteIds.has(qt.id))
        .map((qt) => ({
          kind: 'quote',
          id: qt.id,
          entityId: qt.entityId,
          text: qt.text,
          entityName: qt.entityName,
        }))
    : []
  const momentoItems: CommandSearchItem[] = serverResults
    ? serverResults.momentos.map((m) => ({
        kind: 'momento',
        id: m.id,
        momentoKind: m.kind,
        text: m.text,
      }))
    : []
  const cronicaItems: CommandSearchItem[] = serverResults
    ? serverResults.cronicas.map((c) => ({
        kind: 'cronica',
        id: c.id,
        year: c.year,
        month: c.month,
        text: c.text,
      }))
    : []
  const chatItems: CommandSearchItem[] = serverResults
    ? serverResults.chat.map((c) => ({
        kind: 'chat',
        id: c.id,
        threadId: c.threadId,
        threadTitle: c.threadTitle,
        text: c.text,
      }))
    : []

  const rawQ = query.trim()
  const askItems: CommandSearchItem[] = rawQ.length >= 3 ? [{ kind: 'ask', q: rawQ }] : []

  return [
    ...revealItems,
    ...viewItems,
    ...actionItems,
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
}

export function describeCommandSearchItem(item: CommandSearchItem): {
  key: string
  kind: CommandSearchItem['kind']
  label: string
  hint?: string
} {
  switch (item.kind) {
    case 'view':
      return {
        key: `view:${item.view}`,
        kind: item.kind,
        label: item.label,
        hint: item.hint,
      }
    case 'action':
      return {
        key: `action:${item.action}`,
        kind: item.kind,
        label: item.label,
        hint: item.hint,
      }
    case 'reveal':
      return {
        key: `reveal:${item.moduleId}`,
        kind: item.kind,
        label: item.label,
        hint: item.hint,
      }
    case 'ask':
      return { key: 'ask', kind: item.kind, label: item.q }
    case 'savedQuery':
      return { key: `saved:${item.id}`, kind: item.kind, label: item.name }
    case 'entity':
      return {
        key: `entity:${item.id}`,
        kind: item.kind,
        label: item.name,
        hint: item.type,
      }
    case 'quote':
      return {
        key: `quote:${item.id}`,
        kind: item.kind,
        label: item.text,
        hint: item.entityName,
      }
    case 'momento':
      return {
        key: `momento:${item.id}`,
        kind: item.kind,
        label: item.text,
        hint: item.momentoKind,
      }
    case 'cronica':
      return {
        key: `cronica:${item.id}`,
        kind: item.kind,
        label: item.text,
        hint: `${item.month}/${item.year}`,
      }
    case 'chat':
      return {
        key: `chat:${item.id}`,
        kind: item.kind,
        label: item.text,
        hint: item.threadTitle ?? 'chat',
      }
  }
}

function buildViewItems(
  q: string,
  sectionAliases: Record<string, string | undefined>,
  visibility: CommandSearchVisibility,
): CommandSearchItem[] {
  return rankMatches(
    VIEWS,
    q,
    (v) => [
      { text: v.label, weight: 120 },
      { text: v.hint, weight: 70 },
      { text: sectionAliases[v.view] ?? '', weight: 130 },
    ],
    (v) => {
      const status = describeVisibilityStatus({
        hidden: !visibility.isViewVisible(v.view),
        pinned: visibility.pinActive && visibility.isPinRequired(v.view),
      })
      return {
        kind: 'view',
        view: v.view,
        label: v.label,
        hint: status ? `${v.hint} (${status})` : v.hint,
      }
    },
  )
}

function buildActionItems(q: string): CommandSearchItem[] {
  return rankMatches(
    ACTIONS,
    q,
    (action) => [
      { text: action.label, weight: 120 },
      { text: action.hint, weight: 70 },
    ],
    (action) => ({
      kind: 'action',
      action: action.action,
      label: action.label,
      hint: action.hint,
    }),
  )
}

function buildRevealItems(
  q: string,
  sectionAliases: Record<string, string | undefined>,
  visibility: CommandSearchVisibility,
): CommandSearchItem[] {
  if (!q) return []

  return rankMatches(
    SECTIONS,
    q,
    (section) => {
      const defaultAliases = MODULE_ALIASES.filter(
        (alias) => alias.moduleId === section.id,
      )
      const customAlias = sectionAliases[`notas:${section.id}`] ?? ''
      return [
        { text: section.label, weight: 100 },
        ...defaultAliases.flatMap((alias) => [
          { text: alias.token, weight: 115 },
          { text: `#${alias.token}`, weight: 160 },
        ]),
        { text: customAlias, weight: 150 },
      ]
    },
    (section) => ({
      kind: 'reveal',
      moduleId: section.id,
      label: section.label,
      hint:
        describeVisibilityStatus({
          hidden: !visibility.isModuleVisible(section.id),
          pinned: visibility.pinActive && visibility.isPinRequired(`notas:${section.id}`),
        }) || undefined,
    }),
  )
}

function buildSavedQueryItems(
  q: string,
  savedQueries: CommandSearchSavedQuery[],
): CommandSearchItem[] {
  const ranked = q
    ? rankMatches(
        savedQueries,
        q,
        (saved) => [{ text: saved.name, weight: 125 }],
        (saved) => saved,
      )
    : savedQueries.slice(0, 6)

  return ranked.map((sq) => ({
    kind: 'savedQuery',
    id: sq.id,
    name: sq.name,
    query: sq.query,
  }))
}

function rankLocalEntities(
  q: string,
  entities: CommandSearchEntity[],
): CommandSearchEntity[] {
  if (!q) return entities

  return rankMatches(
    entities,
    q,
    (entity) => [
      { text: entity.name, weight: 130 },
      { text: entity.type, weight: 80 },
      { text: entity.description ?? '', weight: 55 },
    ],
    (entity) => entity,
  )
}

function rankLocalQuotes(q: string, quotes: CommandSearchQuote[]): CommandSearchQuote[] {
  return rankMatches(
    quotes,
    q,
    (quote) => [{ text: quote.text, weight: 75 }],
    (quote) => quote,
  )
}

function rankMatches<T, R>(
  records: T[],
  q: string,
  fields: (record: T) => Array<{ text: string; weight: number }>,
  map: (record: T) => R,
): R[] {
  if (!q) return records.map(map)

  return records
    .map<Ranked<T>>((record, index) => ({
      item: record,
      index,
      score: Math.max(
        ...fields(record).map((field) => scoreField(q, field.text, field.weight)),
      ),
    }))
    .filter((ranked) => ranked.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((ranked) => map(ranked.item))
}

function scoreField(q: string, text: string, weight: number): number {
  const normalizedText = normalizeQuery(text)
  if (!normalizedText) return -1

  const cleanQ = q.startsWith('#') ? q.slice(1) : q
  const cleanText = normalizedText.startsWith('#')
    ? normalizedText.slice(1)
    : normalizedText
  if (normalizedText === q || cleanText === cleanQ) return weight + 100
  if (normalizedText.startsWith(q) || cleanText.startsWith(cleanQ)) return weight + 75
  if (hasWordPrefix(normalizedText, q) || hasWordPrefix(cleanText, cleanQ)) {
    return weight + 60
  }
  if (normalizedText.includes(q) || cleanText.includes(cleanQ)) return weight + 35
  return -1
}

function hasWordPrefix(text: string, q: string): boolean {
  if (!q) return false
  return text.split(/\s+/).some((word) => word.startsWith(q))
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function describeVisibilityStatus({
  hidden,
  pinned,
}: {
  hidden: boolean
  pinned: boolean
}): string {
  if (hidden && pinned) return 'oculta · protegida 🔒'
  if (hidden) return 'oculta'
  if (pinned) return 'protegida 🔒'
  return ''
}
