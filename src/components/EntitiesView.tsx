import { useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type EntityType } from '../types'
import { useTrama } from '../state'

export function EntitiesView() {
  const { entities, addEntity, deleteEntity, quotes, relationships } = useTrama()
  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addEntity({
      type,
      name: trimmed,
      year: year ? Number(year) : undefined,
      description: description.trim() || undefined,
    })
    setName('')
    setYear('')
    setDescription('')
  }

  return (
    <>
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Nueva entidad
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
              className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
              autoFocus
            />
            <select
              value={type}
              onChange={(event) => setType(event.target.value as EntityType)}
              className="px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
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
              className="w-full sm:w-24 px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
            />
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Nota o descripción (opcional)"
            rows={2}
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors resize-none"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-stone-800 text-stone-50 rounded hover:bg-stone-700 transition-colors text-sm"
          >
            Añadir
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          {entities.length === 0
            ? 'Aún sin entidades'
            : `${entities.length} ${entities.length === 1 ? 'entidad' : 'entidades'}`}
        </h2>
        {entities.length === 0 ? (
          <p className="text-stone-500 italic leading-relaxed">
            Empieza añadiendo personas, libros, canciones, conceptos o ideas que te han marcado.
          </p>
        ) : (
          <ul className="space-y-3">
            {entities.map((entity) => {
              const quoteCount = quotes.filter((q) => q.entityId === entity.id).length
              const relCount = relationships.filter(
                (r) => r.fromId === entity.id || r.toId === entity.id,
              ).length
              return (
                <li
                  key={entity.id}
                  className="group p-4 bg-white border border-stone-100 rounded transition-shadow hover:shadow-sm"
                >
                  <div className="flex justify-between items-baseline gap-4">
                    <div className="min-w-0">
                      <span className="text-lg text-stone-800">{entity.name}</span>
                      {entity.year !== undefined && (
                        <span className="ml-2 text-stone-500 text-sm">
                          ({entity.year})
                        </span>
                      )}
                      <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-stone-400 align-middle">
                        {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
                      </span>
                      {entity.origin === 'ai' && (
                        <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded align-middle">
                          ia
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
                          deleteEntity(entity.id)
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-700 text-xs"
                    >
                      eliminar
                    </button>
                  </div>
                  {entity.description && (
                    <p className="mt-2 text-stone-600 text-sm leading-relaxed">
                      {entity.description}
                    </p>
                  )}
                  {(quoteCount > 0 || relCount > 0) && (
                    <div className="mt-2 flex gap-4 text-xs text-stone-400">
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
      </section>
    </>
  )
}
