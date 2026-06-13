import type { Note, ProactiveSuggestion, Recorte, Task } from '../api'

export type KnowledgeInboxSource = 'recorte' | 'suggestion' | 'note' | 'task'
export type KnowledgeUrgency = 'alta' | 'media' | 'baja'

export type KnowledgeWorkflowInput = {
  recortes: Array<
    Pick<
      Recorte,
      | 'id'
      | 'status'
      | 'text'
      | 'sourceTitle'
      | 'sourceAuthor'
      | 'sourceUrl'
      | 'captureMode'
      | 'note'
      | 'createdAt'
      | 'updatedAt'
    >
  >
  suggestions: ProactiveSuggestion[]
  notes: Array<
    Pick<
      Note,
      | 'id'
      | 'title'
      | 'content'
      | 'tags'
      | 'pinned'
      | 'promotedMomentoId'
      | 'hasImages'
      | 'createdAt'
      | 'updatedAt'
    >
  >
  tasks: Task[]
}

export type KnowledgeInboxItem = {
  id: string
  source: KnowledgeInboxSource
  sourceId: string
  title: string
  excerpt: string
  meta: string
  actionLabel: string
  urgency: KnowledgeUrgency
  score: number
  createdAt: string
  href?: string | null
  tags?: string[]
}

export type KnowledgeInboxCounts = {
  total: number
  recortes: number
  suggestions: number
  notes: number
  tasks: number
  high: number
}

export function buildKnowledgeInbox(input: KnowledgeWorkflowInput): KnowledgeInboxItem[] {
  return [
    ...input.tasks.filter((task) => !task.done).map(taskToInboxItem),
    ...input.suggestions
      .filter((suggestion) => suggestion.status === 'pending')
      .map(suggestionToInboxItem),
    ...input.recortes
      .filter((recorte) => recorte.status === 'pending')
      .map(recorteToInboxItem),
    ...input.notes
      .filter((note) => note.pinned && note.promotedMomentoId === null)
      .map(noteToInboxItem),
  ].sort((a, b) => b.score - a.score || newestFirst(a.createdAt, b.createdAt))
}

export function knowledgeInboxCounts(items: KnowledgeInboxItem[]): KnowledgeInboxCounts {
  return {
    total: items.length,
    recortes: items.filter((item) => item.source === 'recorte').length,
    suggestions: items.filter((item) => item.source === 'suggestion').length,
    notes: items.filter((item) => item.source === 'note').length,
    tasks: items.filter((item) => item.source === 'task').length,
    high: items.filter((item) => item.urgency === 'alta').length,
  }
}

function taskToInboxItem(task: Task): KnowledgeInboxItem {
  const dueBoost = task.dueDate ? 15 : 0
  const priorityScore =
    task.priority === 'alta' ? 100 : task.priority === 'media' ? 72 : 48
  return {
    id: `task:${task.id}`,
    source: 'task',
    sourceId: task.id,
    title: task.title,
    excerpt: task.detail ?? 'Tarea pendiente sin detalle.',
    meta: [task.category, task.dueDate ? `vence ${task.dueDate}` : null]
      .filter(Boolean)
      .join(' · '),
    actionLabel: 'convertir en avance',
    urgency:
      task.priority === 'alta' ? 'alta' : task.priority === 'media' ? 'media' : 'baja',
    score: priorityScore + dueBoost,
    createdAt: task.createdAt,
    tags: task.tags,
  }
}

function suggestionToInboxItem(suggestion: ProactiveSuggestion): KnowledgeInboxItem {
  return {
    id: `suggestion:${suggestion.id}`,
    source: 'suggestion',
    sourceId: suggestion.id,
    title: suggestionTitle(suggestion),
    excerpt:
      suggestion.payload.reason ??
      suggestion.payload.description ??
      'Sugerencia pendiente de revisión.',
    meta: [kindLabel(suggestion.kind), suggestion.provider].filter(Boolean).join(' · '),
    actionLabel: 'revisar sugerencia',
    urgency: 'alta',
    score: 92,
    createdAt: suggestion.createdAt,
  }
}

function recorteToInboxItem(
  recorte: KnowledgeWorkflowInput['recortes'][number],
): KnowledgeInboxItem {
  return {
    id: `recorte:${recorte.id}`,
    source: 'recorte',
    sourceId: recorte.id,
    title: recorte.sourceTitle ?? hostOf(recorte.sourceUrl) ?? 'Recorte sin título',
    excerpt: recorte.note ? `${recorte.text}\n${recorte.note}` : recorte.text,
    meta: [recorte.sourceAuthor, recorte.captureMode].filter(Boolean).join(' · '),
    actionLabel: 'curar recorte',
    urgency: 'media',
    score: 74,
    createdAt: recorte.createdAt,
    href: recorte.sourceUrl,
  }
}

function noteToInboxItem(
  note: KnowledgeWorkflowInput['notes'][number],
): KnowledgeInboxItem {
  return {
    id: `note:${note.id}`,
    source: 'note',
    sourceId: note.id,
    title: note.title ?? firstLine(note.content),
    excerpt: note.content,
    meta: note.tags.length > 0 ? note.tags.join(' · ') : 'nota fijada',
    actionLabel: 'llevar a mesa',
    urgency: 'media',
    score: 58,
    createdAt: note.createdAt,
    tags: note.tags,
  }
}

function suggestionTitle(suggestion: ProactiveSuggestion): string {
  if (suggestion.kind === 'relationship') {
    const from = suggestion.payload.fromName ?? 'origen'
    const to = suggestion.payload.toName ?? 'destino'
    return `Relación sugerida: ${from} → ${to}`
  }
  if (suggestion.kind === 'reclassification') {
    return `Reclasificar: ${suggestion.payload.name ?? suggestion.payload.entityId ?? 'entidad'}`
  }
  if (suggestion.kind === 'description') {
    return `Completar descripción: ${suggestion.payload.name ?? suggestion.payload.entityId ?? 'entidad'}`
  }
  return 'Sugerencia pendiente'
}

function kindLabel(kind: string): string {
  if (kind === 'relationship') return 'relación'
  if (kind === 'reclassification') return 'tipo'
  if (kind === 'description') return 'descripción'
  return kind
}

function firstLine(text: string): string {
  return text.trim().split(/\n+/)[0]?.slice(0, 80) || 'Nota sin título'
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function newestFirst(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime()
}
