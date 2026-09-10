import type { SearchResponse } from '../api'
import type { QueryInput } from '../api/query'
import type { NotasSection } from '../types/notas'
import type { ViewMode } from '../types/view'
import { SECTIONS } from '../components/notas/notasSections'
import { MODULE_ALIASES } from '../components/notas/moduleAliases'
import { parseCommandQuery, type CommandSearchScope } from './commandSearchGrammar'
import { normalizeQuery, rankMatches } from './commandSearchRanking'
import { ACTIONS, VIEWS, type CommandAction } from './commandSearchCatalog'

export type { CommandAction }

/**
 * Un resultado que aporta quien monta la paleta (hoy, el mundo Notas). La paleta
 * lo pinta y lo abre, pero no sabe qué es una nota o una tarea.
 */
export type CommandSearchContentItem = {
  kind: 'content'
  id: string
  icon: 'note' | 'task' | 'prompt'
  section: NotasSection
  label: string
  hint?: string
  preview?: string
  /** Acción de la fila sin abrirla (⇧Enter): marcar hecha, copiar. */
  secondary?: { label: string; ariaLabel: string; run: () => void }
}

/** La fuente de contenido de un anfitrión: un hook que corre en el mismo render. */
export type CommandSearchContentSource = {
  useItems: (args: { open: boolean; text: string }) => CommandSearchContentItem[]
}

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
  | CommandSearchContentItem

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
  contentItems?: CommandSearchContentItem[]
}

const LOCAL_ENTITY_LIMIT = 20
const LOCAL_QUOTE_LIMIT = 12

type CommandSearchGroup =
  | 'reveal'
  | 'content'
  | 'view'
  | 'action'
  | 'savedQuery'
  | 'entity'
  | 'quote'
  | 'momento'
  | 'cronica'
  | 'chat'
  | 'ask'

// Qué grupos entran en cada alcance de la gramática, y en qué orden. Sin
// sigilo, `ask` va al final para no tapar hits concretos; con `?` la pregunta
// es la intención y va primero. El contenido del anfitrión va tras las secciones,
// y solo sin sigilo.
const SCOPE_GROUPS: Record<CommandSearchScope, readonly CommandSearchGroup[]> = {
  todo: [
    'reveal',
    'content',
    'view',
    'action',
    'savedQuery',
    'entity',
    'quote',
    'momento',
    'cronica',
    'chat',
    'ask',
  ],
  preguntar: ['ask', 'savedQuery'],
  comandos: ['view', 'action', 'reveal'],
  entidades: ['entity'],
  secciones: ['reveal', 'view'],
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
  contentItems = [],
}: CommandSearchBuildInput): CommandSearchItem[] {
  const { scope, text } = parseCommandQuery(query)
  const q = normalizeQuery(text)
  const revealItems = buildRevealItems(
    q,
    sectionAliases,
    visibility,
    scope === 'secciones',
  )
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

  // Con `?` basta un carácter: la intención de preguntar ya es explícita.
  const askMin = scope === 'preguntar' ? 1 : 3
  const askItems: CommandSearchItem[] =
    text.length >= askMin ? [{ kind: 'ask', q: text }] : []

  const groups: Record<CommandSearchGroup, CommandSearchItem[]> = {
    reveal: revealItems,
    content: contentItems,
    view: viewItems,
    action: actionItems,
    savedQuery: savedQueryItems,
    entity: [...entityItems, ...serverEntityItems],
    quote: [...quoteItems, ...serverQuoteItems],
    momento: momentoItems,
    cronica: cronicaItems,
    chat: chatItems,
    ask: askItems,
  }
  return SCOPE_GROUPS[scope].flatMap((group) => groups[group])
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
    case 'content':
      return {
        key: `content:${item.id}`,
        kind: item.kind,
        label: item.label,
        hint: item.hint,
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
  /** Con `#` solo se listan todas: el sigilo pide ver las secciones. */
  listAll: boolean,
): CommandSearchItem[] {
  if (!q && !listAll) return []

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
