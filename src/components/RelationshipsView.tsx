import { useState, type FormEvent } from 'react'
import { RELATIONSHIP_TYPES, type ExtractionProposal, type RelationshipType } from '../types'
import {
  useEntitiesQuery,
  useRelationshipsQuery,
  useAddRelationship,
  useDeleteRelationship,
  useSuggestRelationships,
  useOffline,
} from '../state'
import { SparkleIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'

export function RelationshipsView({
  onSelectEntity,
  onProposal,
}: {
  onSelectEntity?: (id: string) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const addRelationship = useAddRelationship()
  const deleteRelationship = useDeleteRelationship()
  const suggest = useSuggestRelationships()
  const { offline } = useOffline()

  const [fromId, setFromId] = useState('')
  const [type, setType] = useState<RelationshipType>('influye_en')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [emptyHint, setEmptyHint] = useState<string | null>(null)

  async function handleSuggest() {
    setEmptyHint(null)
    try {
      const proposal = await suggest.mutateAsync()
      if (proposal.relationships.length === 0) {
        setEmptyHint(
          'La IA no encontró relaciones nuevas obvias. Si esperabas alguna, prueba dándole más contexto: añade citas o descripciones a las entidades.',
        )
        return
      }
      onProposal?.('Sugerencias entre entidades existentes', proposal)
    } catch {
      // surfaces via suggest.error
    }
  }

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
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Vínculos entre dos entidades — quién influye en quién, qué cita a qué,
            qué te llegó por dónde. Las líneas del grafo.
          </p>
        </div>
        {entities.length >= 2 && (
          <div className="flex items-baseline gap-4 shrink-0">
            <button
              onClick={handleSuggest}
              disabled={suggest.isPending || offline}
              className="ai-cta"
              title="Sugerir relaciones nuevas entre entidades ya existentes"
            >
              {suggest.isPending ? (
                <>
                  <span className="size-3 border-2 rounded-full animate-spin" style={{ borderColor: `var(--accent-primary-ring)`, borderTopColor: `var(--accent-primary)` }} />
                  pensando…
                </>
              ) : (
                <>
                  <SparkleIcon size={11} />
                  descubrir con IA
                </>
              )}
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="text-xs uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
            >
              {showForm ? 'cerrar' : 'añadir manualmente'}
            </button>
          </div>
        )}
      </header>

      {suggest.error && (
        <div className="mb-6 px-4 py-3 bg-red-50/80 border border-red-200/60 rounded-xl text-sm text-red-800">
          {suggest.error.message}
        </div>
      )}
      {emptyHint && !suggest.isPending && (
        <div className="mb-6 px-4 py-3 bg-paper-100/60 border border-ink-100/60 rounded-xl text-sm text-ink-500 leading-relaxed">
          {emptyHint}
        </div>
      )}

      {entities.length < 2 ? (
        <EmptyMessage
          title="Una relación necesita dos."
          body={
            <>
              Una relación es una línea entre dos entidades — sin segundo
              extremo no hay línea. Volvé cuando tengas al menos dos.
            </>
          }
        />
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
            <EmptyMessage
              title="Las entidades están sueltas."
              body={
                <>
                  Las relaciones son lo que vuelve constelación a una colección
                  de nombres. Conecta dos cosas que ya tienes y la trama
                  empieza a tener forma.
                </>
              }
              hint="Pulsa “descubrir con IA” arriba para que te sugiera las primeras."
            />
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
                        {from ? (
                          <button
                            onClick={() => onSelectEntity?.(from.id)}
                            className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
                          >
                            {from.name}
                          </button>
                        ) : (
                          <span className="text-ink-700">—</span>
                        )}
                        <span className="mx-2 text-[10px] uppercase tracking-[0.18em] text-ink-300">
                          {typeLabel}
                        </span>
                        {to ? (
                          <button
                            onClick={() => onSelectEntity?.(to.id)}
                            className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
                          >
                            {to.name}
                          </button>
                        ) : (
                          <span className="text-ink-700">—</span>
                        )}
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
