import { useState, type FormEvent } from 'react'
import { RELATIONSHIP_TYPES, type RelationshipType } from '../types'
import {
  useEntitiesQuery,
  useRelationshipsQuery,
  useAddRelationship,
  useDeleteRelationship,
} from '../state'
import { SparkleIcon } from './Icons'

export function RelationshipsView() {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const addRelationship = useAddRelationship()
  const deleteRelationship = useDeleteRelationship()

  const [fromId, setFromId] = useState('')
  const [type, setType] = useState<RelationshipType>('influye_en')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!fromId || !toId || fromId === toId) return
    try {
      await addRelationship.mutateAsync({
        fromId,
        toId,
        type,
        notes: notes.trim() || undefined,
      })
      setFromId('')
      setToId('')
      setNotes('')
    } catch {
      /* error surfaces via addRelationship.error */
    }
  }

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Relaciones</h2>
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Vínculos entre dos entidades — quién influye en quién, qué cita a qué,
            qué te llegó por dónde. Las líneas del grafo.
          </p>
        </div>
        {entities.length >= 2 && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
          >
            {showForm ? 'cerrar' : 'añadir manualmente'}
          </button>
        )}
      </header>

      {entities.length < 2 ? (
        <p className="text-ink-400 italic leading-relaxed">
          Necesitas al menos dos entidades para tener una relación.
        </p>
      ) : (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-10 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={fromId}
                  onChange={(event) => setFromId(event.target.value)}
                  className="input-paper flex-1"
                >
                  <option value="">— origen —</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as RelationshipType)}
                  className="input-paper"
                >
                  {RELATIONSHIP_TYPES.map((relType) => (
                    <option key={relType.value} value={relType.value}>{relType.label}</option>
                  ))}
                </select>
                <select
                  value={toId}
                  onChange={(event) => setToId(event.target.value)}
                  className="input-paper flex-1"
                >
                  <option value="">— destino —</option>
                  {entities.filter((entity) => entity.id !== fromId).map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Nota sobre la relación (opcional)"
                className="input-paper w-full"
              />
              <button type="submit" disabled={addRelationship.isPending} className="btn-ink">
                {addRelationship.isPending ? 'añadiendo…' : 'Añadir relación'}
              </button>
            </form>
          )}

          {relationships.length === 0 ? (
            <p className="text-ink-400 italic leading-relaxed">Aún sin relaciones.</p>
          ) : (
            <ul className="space-y-2">
              {relationships.map((rel, idx) => {
                const from = entities.find((entity) => entity.id === rel.fromId)
                const to = entities.find((entity) => entity.id === rel.toId)
                const typeLabel =
                  RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ?? rel.type
                return (
                  <li
                    key={rel.id}
                    className="group p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl transition-all duration-200 hover:shadow-md hover:shadow-ink-900/5 hover:border-ink-100 hover:bg-paper-50/70 animate-fade-up"
                    style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  >
                    <div className="flex justify-between items-baseline gap-4">
                      <div className="text-ink-600 leading-relaxed">
                        <span className="text-ink-700">{from?.name ?? '—'}</span>
                        <span className="mx-2 text-[10px] uppercase tracking-[0.18em] text-ink-300">
                          {typeLabel}
                        </span>
                        <span className="text-ink-700">{to?.name ?? '—'}</span>
                        {rel.origin.kind === 'ai' && (
                          <span className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle" title="propuesta por IA">
                            <SparkleIcon size={10} />
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteRelationship.mutate(rel.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-ink-700 text-xs"
                      >
                        eliminar
                      </button>
                    </div>
                    {rel.notes && (
                      <p className="mt-1 text-sm text-ink-400 leading-relaxed">{rel.notes}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
