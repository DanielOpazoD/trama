import { useEffect, useState, type FormEvent } from 'react'
import {
  useAsk,
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useAddQuote,
  useDeleteEntity,
  useDeleteRelationship,
  useUpdateEntity,
} from '../state'
import { useChatThreadsQuery, useCreateChatThread } from '../state/useChat'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Entity,
  type Relationship,
} from '../types'
import { CloseIcon, SparkleIcon, TrashIcon } from './Icons'
import { QuoteCard } from './QuoteCard'

// Music-y types where a Spotify link makes sense.
const SPOTIFY_TYPES = new Set([
  'banda', 'musico', 'cancion', 'album', 'disco', 'artista',
])

export function NodeDetailPanel({
  entityId,
  onClose,
  onOpenThread,
}: {
  entityId: string
  onClose: () => void
  /** Opens ChatView with a specific thread. Used by "hablar con esta
      entidad" — we find or create the entity's focus thread and route there. */
  onOpenThread?: (threadId: string) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const updateEntity = useUpdateEntity()
  const addQuote = useAddQuote()
  const askLLM = useAsk()
  const deleteEntity = useDeleteEntity()
  const deleteRelationship = useDeleteRelationship()
  const { data: chatThreads = [] } = useChatThreadsQuery()
  const createChatThread = useCreateChatThread()

  const entity = entities.find((e) => e.id === entityId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Inline edit state for description + spotify url.
  const [editing, setEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')

  // Essay edit (long-form note about the entity).
  const [editingEssay, setEditingEssay] = useState(false)
  const [essayDraft, setEssayDraft] = useState('')

  // Quick note: writes a quote without source/context — fastest way to add a thought.
  const [noteDraft, setNoteDraft] = useState('')
  const [noteReflectionDraft, setNoteReflectionDraft] = useState('')
  const [showNoteReflection, setShowNoteReflection] = useState(false)

  useEffect(() => {
    if (entity) {
      setDescDraft(entity.description ?? '')
      setUrlDraft(entity.spotifyUrl ?? '')
      setEssayDraft(entity.essay ?? '')
    }
  }, [entity])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmingDelete) setConfirmingDelete(false)
        else if (editing) setEditing(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmingDelete, editing, onClose])

  if (!entity) {
    return (
      <div className="h-full flex flex-col p-5">
        <p className="text-ink-300 italic">Entidad no encontrada.</p>
        <button onClick={onClose} className="btn-ghost mt-3 self-start">
          cerrar
        </button>
      </div>
    )
  }

  const entityQuotes = quotes.filter((q) => q.entityId === entity.id)
  const outgoing = relationships.filter((r) => r.fromId === entity.id)
  const incoming = relationships.filter((r) => r.toId === entity.id)
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  const allowsSpotify = SPOTIFY_TYPES.has(entity.type)

  async function handleSuggestDescription() {
    if (!entity || askLLM.isPending) return
    const meta = [
      entity.type,
      entity.year !== undefined ? `año ${entity.year}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const prompt = `Genera UNA descripción breve para "${entity.name}" (${meta}). Máximo 15 palabras. Sin comillas, sin punto final, sin "es un/una". Solo la frase descriptiva.`
    try {
      const res = await askLLM.mutateAsync({ text: prompt, view: 'entidades' })
      const text = res.reply.trim().replace(/^["']|["']$/g, '')
      if (text) setDescDraft(text)
    } catch {
      /* surfaces via askLLM.error si quisiéramos mostrarlo */
    }
  }

  async function handleSaveEdit() {
    if (!entity) return
    const desc = descDraft.trim()
    const url = urlDraft.trim()
    const patch: Parameters<typeof updateEntity.mutate>[0]['patch'] = {}
    if ((entity.description ?? '') !== desc) {
      patch.description = desc ? desc : null
    }
    if ((entity.spotifyUrl ?? '') !== url) {
      patch.spotifyUrl = url ? url : null
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    try {
      await updateEntity.mutateAsync({ id: entity.id, patch })
      setEditing(false)
    } catch {
      // error surfaces via updateEntity.error
    }
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault()
    if (!entity) return
    const text = noteDraft.trim()
    if (!text || addQuote.isPending) return
    try {
      await addQuote.mutateAsync({
        entityId: entity.id,
        text,
        userReflection: noteReflectionDraft.trim() || undefined,
        origin: { kind: 'manual' },
      })
      setNoteDraft('')
      setNoteReflectionDraft('')
      setShowNoteReflection(false)
    } catch {
      /* surfaces via addQuote.error */
    }
  }

  async function handleTalkAboutEntity() {
    if (!entity || !onOpenThread) return
    const wantedContext = `entity:${entity.id}`
    // Reuse an existing entity-focused thread if there is one; otherwise
    // create a new thread tagged with this entity's id.
    const existing = chatThreads.find((t) => t.context === wantedContext)
    if (existing) {
      onOpenThread(existing.id)
      return
    }
    try {
      const created = await createChatThread.mutateAsync({
        context: wantedContext,
        title: `Sobre ${entity.name}`,
      })
      onOpenThread(created.id)
    } catch {
      /* surfaces via createChatThread.error */
    }
  }

  async function handleSaveEssay() {
    if (!entity) return
    const next = essayDraft.trim() || null
    if ((entity.essay ?? null) === next) {
      setEditingEssay(false)
      return
    }
    try {
      await updateEntity.mutateAsync({ id: entity.id, patch: { essay: next } })
      setEditingEssay(false)
    } catch {
      /* surfaces */
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={`Detalle de ${entity.name}`}
    >
      <header className="px-5 py-4 border-b border-ink-100 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-ink-400 flex items-center gap-2 flex-wrap">
            <span>{typeLabel ?? entity.type}</span>
            {entity.year !== undefined && (
              <>
                <span className="text-ink-200">·</span>
                <span>{entity.year}</span>
              </>
            )}
            {entity.origin.kind === 'ai' && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: 'var(--accent-gold-soft)',
                  color: 'var(--accent-gold)',
                }}
              >
                <SparkleIcon size={10} />
                IA
              </span>
            )}
          </p>
          <h2 className="font-serif text-2xl text-ink-800 leading-tight mt-1 break-words">
            {entity.name}
          </h2>
          {entity.spotifyUrl && (
            <a
              href={entity.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
            >
              ↗ abrir en Spotify
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      {/* Acción IA primaria — fuera del header para que tenga su espacio
          y el título no compita con ella por ancho. */}
      {onOpenThread && (
        <div className="px-5 pt-3">
          <button
            onClick={handleTalkAboutEntity}
            disabled={createChatThread.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent-primary-soft)',
              color: 'var(--accent-primary)',
            }}
            title="Abre un hilo de chat focalizado en esta entidad: su contexto, sus citas y sus relaciones."
          >
            <SparkleIcon size={12} />
            {createChatThread.isPending ? 'Abriendo…' : 'Hablar'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Description / edit block */}
        <section>
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="descripción"
                rows={3}
                className="input-paper w-full resize-none"
              />
              {allowsSpotify && (
                <input
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://open.spotify.com/…"
                  className="input-paper w-full text-sm"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleSuggestDescription}
                  disabled={askLLM.isPending}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-ink-100 hover:bg-ink-100 transition-colors disabled:opacity-50"
                  style={{ color: 'var(--accent-primary)' }}
                  title="Generar descripción con IA"
                >
                  {askLLM.isPending ? (
                    <>
                      <span
                        className="size-3 border-2 rounded-full animate-spin"
                        style={{
                          borderColor: 'var(--accent-primary-ring)',
                          borderTopColor: 'var(--accent-primary)',
                        }}
                      />
                      Pensando…
                    </>
                  ) : (
                    <>
                      <SparkleIcon size={11} />
                      IA
                    </>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(false)
                      setDescDraft(entity.description ?? '')
                      setUrlDraft(entity.spotifyUrl ?? '')
                    }}
                    className="btn-ghost text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateEntity.isPending}
                    className="btn-ink text-xs"
                  >
                    {updateEntity.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="group">
              {entity.description ? (
                <p className="text-ink-700 leading-relaxed">{entity.description}</p>
              ) : (
                <p className="text-ink-300 italic text-sm">sin descripción.</p>
              )}
              <button
                onClick={() => setEditing(true)}
                className="mt-2 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
              >
                editar
              </button>
            </div>
          )}
        </section>

        {/* Essay / long-form note */}
        <section>
          {editingEssay ? (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-ink-400">ensayo</h3>
              <textarea
                value={essayDraft}
                onChange={(e) => setEssayDraft(e.target.value)}
                placeholder="Nota larga sobre esto…"
                rows={8}
                className="input-paper w-full resize-none text-sm leading-relaxed"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingEssay(false)
                    setEssayDraft(entity.essay ?? '')
                  }}
                  className="btn-ghost text-xs"
                >
                  cancelar
                </button>
                <button
                  onClick={handleSaveEssay}
                  disabled={updateEntity.isPending}
                  className="btn-ink text-xs"
                >
                  {updateEntity.isPending ? 'guardando…' : 'guardar ensayo'}
                </button>
              </div>
            </div>
          ) : entity.essay ? (
            <div className="group/essay">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs uppercase tracking-wider text-ink-400">ensayo</span>
                <button
                  onClick={() => setEditingEssay(true)}
                  className="opacity-0 group-hover/essay:opacity-100 transition-opacity text-xs text-ink-400 hover:text-ink-700"
                >
                  editar
                </button>
              </div>
              <div className="text-ink-700 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                {entity.essay}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingEssay(true)}
              className="text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
            >
              + Ensayo
            </button>
          )}
        </section>

        {/* Quick note form */}
        <section>
          <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-2">
            Cita o nota
          </h3>
          <form onSubmit={handleAddNote} className="flex flex-col gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Una cita, una nota…"
              rows={2}
              className="input-paper w-full resize-none text-sm"
            />
            {showNoteReflection ? (
              <textarea
                value={noteReflectionDraft}
                onChange={(e) => setNoteReflectionDraft(e.target.value)}
                placeholder="Tu reflexión…"
                rows={2}
                className="input-paper w-full resize-none text-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowNoteReflection(true)}
                className="self-start text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
              >
                + Reflexión
              </button>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!noteDraft.trim() || addQuote.isPending}
                className="btn-ink text-xs"
              >
                {addQuote.isPending ? 'añadiendo…' : 'añadir'}
              </button>
            </div>
          </form>
        </section>

        {entityQuotes.length > 0 && (
          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">
              {entityQuotes.length === 1 ? 'Cita / nota' : `${entityQuotes.length} citas / notas`}
            </h3>
            <ul className="space-y-5">
              {entityQuotes.map((quote) => {
                const linkedQuotes = quote.linkedQuoteIds
                  .map((id) => quotes.find((q) => q.id === id))
                  .filter((q): q is NonNullable<typeof q> => q !== undefined)
                return (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    linkedQuotes={linkedQuotes}
                  />
                )
              })}
            </ul>
          </section>
        )}

        {(outgoing.length > 0 || incoming.length > 0) && (
          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">
              Conexiones
            </h3>
            <ul className="space-y-1.5">
              {outgoing.map((rel) => (
                <RelationshipLine
                  key={rel.id}
                  rel={rel}
                  direction="out"
                  otherEntity={entities.find((e) => e.id === rel.toId)}
                  onDelete={() => deleteRelationship.mutate(rel.id)}
                />
              ))}
              {incoming.map((rel) => (
                <RelationshipLine
                  key={rel.id}
                  rel={rel}
                  direction="in"
                  otherEntity={entities.find((e) => e.id === rel.fromId)}
                  onDelete={() => deleteRelationship.mutate(rel.id)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="px-5 py-3 border-t border-ink-100 flex justify-end">
        {confirmingDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-600">¿Borrar?</span>
            <button onClick={() => setConfirmingDelete(false)} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={async () => {
                await deleteEntity.mutateAsync(entity.id)
                onClose()
              }}
              className="text-red-700 hover:text-red-900 text-sm"
            >
              Sí
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded transition-colors"
            aria-label="Eliminar"
            title="Eliminar"
          >
            <TrashIcon size={14} />
          </button>
        )}
      </footer>
    </div>
  )
}

function RelationshipLine({
  rel,
  direction,
  otherEntity,
  onDelete,
}: {
  rel: Relationship
  direction: 'in' | 'out'
  otherEntity: Entity | undefined
  onDelete: () => void
}) {
  const typeDef = RELATIONSHIP_TYPES.find((t) => t.value === rel.type)
  const label = direction === 'out' ? typeDef?.label : typeDef?.reverseLabel
  return (
    <li className="group flex items-baseline justify-between gap-2 text-sm">
      <span className="leading-relaxed">
        <span className="text-xs uppercase tracking-wider text-ink-400 mr-2">
          {label ?? rel.type}
        </span>
        <span className="text-ink-700">{otherEntity?.name ?? '—'}</span>
        {rel.origin.kind === 'ai' && (
          <span className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle" title="propuesta por IA">
            <SparkleIcon size={10} />
          </span>
        )}
      </span>
      <button
        onClick={onDelete}
        aria-label="Eliminar relación"
        title="Eliminar relación"
        className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-700 transition-opacity text-xs"
      >
        ✕
      </button>
    </li>
  )
}
