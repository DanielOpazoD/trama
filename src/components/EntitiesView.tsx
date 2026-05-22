import { useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type EntityType } from '../types'
import {
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useAddEntity,
  useDeleteEntity,
  useOffline,
  useReclassifyEntities,
  useUpdateEntityType,
} from '../state'
import type { Reclassification } from '../api'
import { ChevronRightIcon, SparkleIcon } from './Icons'
import { ReclassifyPanel } from './ReclassifyPanel'
import { EmptyMessage } from './EmptyMessage'

export function EntitiesView({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const addEntity = useAddEntity()
  const deleteEntity = useDeleteEntity()
  const reclassify = useReclassifyEntities()
  const updateType = useUpdateEntityType()
  const { offline } = useOffline()

  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [pending, setPending] = useState<Reclassification[] | null>(null)
  const [emptyHint, setEmptyHint] = useState(false)

  async function handleReclassify() {
    setEmptyHint(false)
    try {
      const res = await reclassify.mutateAsync()
      if (res.reclassifications.length === 0) {
        setEmptyHint(true)
        return
      }
      setPending(res.reclassifications)
    } catch {
      // surfaces via reclassify.error
    }
  }

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
        <div className="flex items-baseline gap-4 shrink-0">
          {entities.length > 0 && (
            <button
              onClick={handleReclassify}
              disabled={reclassify.isPending || offline}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-sky-700/80 hover:text-sky-900 disabled:text-ink-200 disabled:cursor-not-allowed transition-colors"
              title="La IA revisa los tipos actuales y propone reclasificaciones cuando hay uno mejor"
            >
              {reclassify.isPending ? (
                <>
                  <span className="size-3 border-2 border-sky-700/30 border-t-sky-700 rounded-full animate-spin" />
                  revisando…
                </>
              ) : (
                <>
                  <SparkleIcon size={11} />
                  reclasificar con IA
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
          >
            {showForm ? 'cerrar' : 'añadir manualmente'}
          </button>
        </div>
      </header>

      {reclassify.error && (
        <div className="mb-6 px-4 py-3 bg-red-50/80 border border-red-200/60 rounded-xl text-sm text-red-800">
          {reclassify.error.message}
        </div>
      )}
      {emptyHint && !reclassify.isPending && (
        <div className="mb-6 px-4 py-3 bg-paper-100/60 border border-ink-100/60 rounded-xl text-sm text-ink-500 leading-relaxed">
          La IA no encontró mejores clasificaciones. Si hay alguna entidad obviamente mal tipada,
          puedes corregirla a mano (próximamente desde el detalle).
        </div>
      )}
      {pending && (
        <ReclassifyPanel
          proposals={pending}
          onClose={() => setPending(null)}
          onApply={async (selected) => {
            // Fire updates sequentially to avoid hitting the same row twice.
            for (const r of selected) {
              try {
                await updateType.mutateAsync({ id: r.id, type: r.newType })
              } catch {
                /* skip; surface in mutation state */
              }
            }
            setPending(null)
          }}
        />
      )}

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
        <EmptyMessage
          title="Todavía nadie habita la trama."
          body={
            <>
              Las entidades son los nudos: las personas, los libros, las
              canciones, los conceptos que vale la pena retener. La trama crece
              alrededor de ellos.
            </>
          }
          hint="Pega un párrafo en la barra de abajo y la IA propone las primeras."
        />
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
                className="group relative animate-fade-up"
                style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onSelectEntity?.(entity.id)}
                  className="w-full text-left p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl transition-all duration-200 hover:shadow-md hover:shadow-ink-900/5 hover:border-ink-100 hover:bg-paper-50/70 active:scale-[0.995]"
                  aria-label={`Ver ${entity.name}, ${quoteCount} ${
                    quoteCount === 1 ? 'cita' : 'citas'
                  }`}
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
                    <ChevronRightIcon
                      size={12}
                      className="text-ink-200 group-hover:text-ink-400 transition-colors shrink-0"
                    />
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
                </button>
                {/* Delete button sits absolutely over the card — separate from the
                    main button so we don't have nested <button>s. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (
                      confirm(
                        `¿Eliminar "${entity.name}"? Sus citas y relaciones también se borrarán.`,
                      )
                    ) {
                      deleteEntity.mutate(entity.id)
                    }
                  }}
                  className="absolute top-2 right-9 opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-red-700 text-xs px-2 py-1"
                  aria-label={`Eliminar ${entity.name}`}
                >
                  eliminar
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
