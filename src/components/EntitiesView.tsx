import { useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type EntityType } from '../types'
import {
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useAddEntity,
  useDeleteEntity,
} from '../state'
import { SparkleIcon } from './Icons'

export function EntitiesView() {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const addEntity = useAddEntity()
  const deleteEntity = useDeleteEntity()

  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await addEntity.mutateAsync({
        type,
        name: trimmed,
        year: year ? Number(year) : undefined,
        description: description.trim() || undefined,
      })
      setName('')
      setYear('')
      setDescription('')
    } catch {
      /* error surfaces via addEntity.error */
    }
  }

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Entidades</h2>
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Las cosas que conectas: personas, libros, canciones, álbumes, películas,
            obras, conceptos, ideas. Cada nodo del grafo es una entidad.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="text-xs uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
        >
          {showForm ? 'cerrar' : 'añadir manualmente'}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-10 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
              className="input-paper flex-1"
              autoFocus
            />
            <select
              value={type}
              onChange={(event) => setType(event.target.value as EntityType)}
              className="input-paper"
            >
              {ENTITY_TYPES.map((entityType) => (
                <option key={entityType.value} value={entityType.value}>
                  {entityType.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="Año"
              className="input-paper w-full sm:w-24"
            />
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Nota o descripción (opcional)"
            rows={2}
            className="input-paper w-full resize-none"
          />
          <button type="submit" disabled={addEntity.isPending} className="btn-ink">
            {addEntity.isPending ? 'añadiendo…' : 'Añadir'}
          </button>
        </form>
      )}

      {entities.length === 0 ? (
        <p className="text-ink-400 italic leading-relaxed">
          Aún sin entidades. Pega un texto en la barra de abajo y la IA propondrá las
          primeras.
        </p>
      ) : (
        <ul className="space-y-2">
          {entities.map((entity, idx) => {
            const quoteCount = quotes.filter((q) => q.entityId === entity.id).length
            const relCount = relationships.filter(
              (r) => r.fromId === entity.id || r.toId === entity.id,
            ).length
            return (
              <li
                key={entity.id}
                className="group p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl transition-all duration-200 hover:shadow-md hover:shadow-ink-900/5 hover:border-ink-100 hover:bg-paper-50/70 animate-fade-up"
                style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
              >
                <div className="flex justify-between items-baseline gap-4">
                  <div className="min-w-0">
                    <span className="text-ink-700">{entity.name}</span>
                    {entity.year !== undefined && (
                      <span className="ml-2 text-ink-300 text-sm">({entity.year})</span>
                    )}
                    <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-ink-300 align-middle">
                      {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
                    </span>
                    {entity.origin.kind === 'ai' && (
                      <span className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle" title="añadido por IA">
                        <SparkleIcon size={10} />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `¿Eliminar "${entity.name}"? Sus citas y relaciones también se borrarán.`,
                        )
                      ) {
                        deleteEntity.mutate(entity.id)
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-ink-700 text-xs"
                  >
                    eliminar
                  </button>
                </div>
                {entity.description && (
                  <p className="mt-1 text-ink-500 text-sm leading-relaxed">
                    {entity.description}
                  </p>
                )}
                {(quoteCount > 0 || relCount > 0) && (
                  <div className="mt-1.5 flex gap-3 text-[10px] uppercase tracking-[0.16em] text-ink-300">
                    {quoteCount > 0 && (
                      <span>
                        {quoteCount} {quoteCount === 1 ? 'cita' : 'citas'}
                      </span>
                    )}
                    {relCount > 0 && (
                      <span>
                        {relCount} {relCount === 1 ? 'relación' : 'relaciones'}
                      </span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
