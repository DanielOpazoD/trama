import { useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type EntityType } from '../types'
import { useTrama } from '../state'

export function EntitiesView() {
  const { entities, addEntity, deleteEntity, quotes, relationships } = useTrama()
  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await addEntity({
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
      <header className="mb-8 flex items-baseline justify-between">
        <h2 className="font-serif text-3xl text-ink-700">Entidades</h2>
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
          className="mb-10 p-4 bg-paper-100/50 border border-ink-100 rounded-lg space-y-3"
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
          <button type="submit" className="btn-ink">
            Añadir
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
          {entities.map((entity) => {
            const quoteCount = quotes.filter((q) => q.entityId === entity.id).length
            const relCount = relationships.filter(
              (r) => r.fromId === entity.id || r.toId === entity.id,
            ).length
            return (
              <li
                key={entity.id}
                className="group p-3 bg-paper-50 border border-ink-100/60 rounded-lg transition-shadow hover:shadow-sm"
              >
                <div className="flex justify-between items-baseline gap-4">
                  <div className="min-w-0">
                    <span className="text-ink-700">{entity.name}</span>
                    {entity.year !== undefined && (
                      <span className="ml-2 text-ink-300 text-sm">
                        ({entity.year})
                      </span>
                    )}
                    <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-ink-300 align-middle">
                      {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
                    </span>
                    {entity.origin === 'ai' && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-sky-700/70 align-middle">
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
