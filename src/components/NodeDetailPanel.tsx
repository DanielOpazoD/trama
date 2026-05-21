import { useEffect, useState, type FormEvent } from 'react'
import {
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useAddQuote,
  useDeleteEntity,
  useDeleteRelationship,
  useDeleteQuote,
  useUpdateEntity,
} from '../state'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Entity,
  type Relationship,
} from '../types'
import { CloseIcon, SparkleIcon } from './Icons'

// Music-y types where a Spotify link makes sense.
const SPOTIFY_TYPES = new Set([
  'banda', 'musico', 'cancion', 'album', 'disco', 'artista',
])

export function NodeDetailPanel({
  entityId,
  onClose,
}: {
  entityId: string
  onClose: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const updateEntity = useUpdateEntity()
  const addQuote = useAddQuote()
  const deleteEntity = useDeleteEntity()
  const deleteRelationship = useDeleteRelationship()
  const deleteQuote = useDeleteQuote()

  const entity = entities.find((e) => e.id === entityId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Inline edit state for description + spotify url.
  const [editing, setEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')

  // Quick note: writes a quote without source/context — fastest way to add a thought.
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    if (entity) {
      setDescDraft(entity.description ?? '')
      setUrlDraft(entity.spotifyUrl ?? '')
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
        origin: { kind: 'manual' },
      })
      setNoteDraft('')
    } catch {
      /* surfaces via addQuote.error */
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={`Detalle de ${entity.name}`}
    >
      <header className="px-5 py-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-300">
            {typeLabel ?? entity.type}
            {entity.year !== undefined && <span className="ml-1">· {entity.year}</span>}
            {entity.origin.kind === 'ai' && (
              <span className="ml-2 inline-flex items-center gap-1 text-sky-700/80">
                <SparkleIcon size={10} />
                añadido por IA
              </span>
            )}
          </p>
          <h2 className="font-serif text-2xl text-ink-700 truncate">{entity.name}</h2>
          {entity.spotifyUrl && (
            <a
              href={entity.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-700/80 hover:text-emerald-900 transition-colors"
            >
              ↗ abrir en Spotify
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          aria-label="Cerrar"
        >
          <CloseIcon />
        </button>
      </header>

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
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditing(false)
                    setDescDraft(entity.description ?? '')
                    setUrlDraft(entity.spotifyUrl ?? '')
                  }}
                  className="btn-ghost text-xs"
                >
                  cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updateEntity.isPending}
                  className="btn-ink text-xs"
                >
                  {updateEntity.isPending ? 'guardando…' : 'guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="group">
              {entity.description ? (
                <p className="text-ink-600 leading-relaxed">{entity.description}</p>
              ) : (
                <p className="text-ink-300 italic text-sm">sin descripción.</p>
              )}
              <button
                onClick={() => setEditing(true)}
                className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
              >
                editar
              </button>
            </div>
          )}
        </section>

        {/* Quick note */}
        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-300 mb-2">
            añadir nota
          </h3>
          <form onSubmit={handleAddNote} className="flex flex-col gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="algo que quieras recordar sobre esta entidad…"
              rows={2}
              className="input-paper w-full resize-none text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!noteDraft.trim() || addQuote.isPending}
                className="btn-ink text-xs"
              >
                {addQuote.isPending ? 'añadiendo…' : 'añadir nota'}
              </button>
            </div>
          </form>
        </section>

        {entityQuotes.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-300 mb-3">
              {entityQuotes.length === 1 ? 'Nota / cita' : `${entityQuotes.length} notas / citas`}
            </h3>
            <ul className="space-y-4">
              {entityQuotes.map((quote) => (
                <li key={quote.id} className="group">
                  <blockquote className="font-serif text-ink-600 italic border-l-2 border-ink-200 pl-3 leading-relaxed text-sm">
                    «{quote.text}»
                  </blockquote>
                  <div className="mt-1 pl-3 flex items-baseline justify-between text-xs">
                    <div>
                      {quote.source && (
                        <span className="text-ink-300">· {quote.source}</span>
                      )}
                      {quote.origin.kind === 'ai' && (
                        <span className="ml-2 inline-flex items-center text-sky-700/70" title="propuesta por IA">
                          <SparkleIcon size={10} />
                        </span>
                      )}
                      <span
                        className="ml-2 text-ink-300 tabular-nums"
                        title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
                      >
                        {new Date(quote.createdAt).toLocaleDateString('es', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteQuote.mutate(quote.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-ink-700 transition-opacity"
                    >
                      eliminar
                    </button>
                  </div>
                  {quote.context && (
                    <p className="mt-1 pl-3 text-ink-400 text-xs leading-relaxed">
                      {quote.context}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(outgoing.length > 0 || incoming.length > 0) && (
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-300 mb-3">
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

      <footer className="px-5 py-3 border-t border-ink-100/60 flex justify-end">
        {confirmingDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-500">¿borrar entidad y todo lo asociado?</span>
            <button onClick={() => setConfirmingDelete(false)} className="btn-ghost">
              cancelar
            </button>
            <button
              onClick={async () => {
                await deleteEntity.mutateAsync(entity.id)
                onClose()
              }}
              className="text-red-700 hover:text-red-900 text-sm"
            >
              sí, eliminar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-ink-300 hover:text-red-700 text-xs uppercase tracking-[0.18em] transition-colors"
          >
            eliminar entidad
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
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-300 mr-2">
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
        className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-ink-700 transition-opacity text-xs"
      >
        ✕
      </button>
    </li>
  )
}
