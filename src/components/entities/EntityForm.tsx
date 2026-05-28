import { useEffect, useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type Entity, type EntityType } from '../../types'
import { api, DuplicateEntityError } from '../../api'
import { useAddEntity, useUpdateEntity, useToast } from '../../state'

/**
 * BB7: form "nueva entrada" extraído de EntitiesView (era ~190 LOC inline).
 *
 * Maneja todo el flujo:
 *   - inputs (name, type, year, description)
 *   - lookup proactivo κ3: debounce 280ms sobre `name`, muestra hasta 3
 *     entidades parecidas DEBAJO del input.
 *   - submit: si server devuelve 409 (DuplicateEntityError), muestra el
 *     bloque "¿es la misma entidad?" con candidates y opción "crear igual".
 *   - merge: si el usuario tipeó year/description y luego elige un dup,
 *     ofrece fusionar los datos en la entidad existente vía updateEntity.
 *
 * El padre (EntitiesView) solo necesita pasar:
 *   - `onClose`: callback al cerrar manualmente (Cancelar) o al crear OK.
 *   - `onSelectEntity?`: callback al elegir un dup (abre el detalle del
 *     existente).
 *   - `allLoadedEntities`: necesario para componer description al fusionar
 *     (lo busca el existente para no pisar lo que ya tiene).
 */
export function EntityForm({
  onClose,
  onSelectEntity,
  allLoadedEntities,
}: {
  onClose: () => void
  onSelectEntity?: (id: string) => void
  allLoadedEntities: Entity[]
}) {
  const addEntity = useAddEntity()
  const updateEntity = useUpdateEntity()
  const toast = useToast()

  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [dupCandidates, setDupCandidates] = useState<
    DuplicateEntityError['suggestions'] | null
  >(null)

  // κ3: lookup proactivo a medida que el usuario teclea el nombre.
  // Pega `/api/entities-lookup?prefix=...` con un debounce de 280ms;
  // muestra hasta 3 entidades parecidas DEBAJO del input para que el
  // usuario las descubra antes de submit. Evita el ciclo "envío → 409 →
  // re-leer la card → cancelar" cuando es obvio que ya existe.
  const [proactiveMatches, setProactiveMatches] = useState<Entity[]>([])
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed.length < 3) {
      setProactiveMatches([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      try {
        const matches = await api.lookupEntitiesByPrefix(trimmed)
        if (!cancelled) setProactiveMatches(matches.slice(0, 3))
      } catch {
        if (!cancelled) setProactiveMatches([])
      }
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [name])

  function reset() {
    setName('')
    setYear('')
    setDescription('')
    setProactiveMatches([])
  }

  async function handleSubmit(event: FormEvent, force = false) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setDupCandidates(null)
    try {
      await addEntity.mutateAsync({
        type,
        name: trimmed,
        year: year ? Number(year) : undefined,
        description: description.trim() || undefined,
        _force: force,
      })
      reset()
    } catch (err) {
      if (err instanceof DuplicateEntityError) {
        setDupCandidates(err.suggestions)
      }
      // otros errores ya salen vía addEntity.error
    }
  }

  // κ3: cuando el usuario picks un candidato dup, si había datos en el
  // form (description, year), ofrecemos fusionarlos a la entidad
  // existente. Esto evita perder el contenido tipeado al "darse cuenta
  // de que ya existe a mitad de camino".
  async function handleMergeIntoExisting(target: { id: string; name: string }) {
    const newDescription = description.trim()
    const newYear = year ? Number(year) : null
    const hasNewData =
      newDescription.length > 0 || (newYear !== null && !Number.isNaN(newYear))
    if (!hasNewData) {
      onSelectEntity?.(target.id)
      setDupCandidates(null)
      reset()
      return
    }
    try {
      const existing = allLoadedEntities.find((e) => e.id === target.id)
      const composedDescription =
        existing?.description && newDescription
          ? `${existing.description}\n\n${newDescription}`
          : newDescription || existing?.description || null
      await updateEntity.mutateAsync({
        id: target.id,
        patch: {
          description: composedDescription,
          year:
            existing?.year ??
            (newYear !== null && !Number.isNaN(newYear) ? newYear : null),
        },
      })
      toast.show({
        message: `Notas fusionadas en "${target.name}"`,
        tone: 'success',
      })
      setDupCandidates(null)
      reset()
      onSelectEntity?.(target.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo fusionar'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  return (
    // ι4: new-card pattern — título serif, inputs agrupados, footer
    // con Cancelar + Añadir alineados a la derecha. Le da peso de
    // "estoy creando una entidad nueva" en vez de "hay una forma
    // perdida arriba de la lista".
    <form
      onSubmit={handleSubmit}
      className="mb-10 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl space-y-4 animate-fade-up"
    >
      <header className="stack-2 pb-3 border-b border-ink-100/60">
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
          nueva entrada
        </p>
        <h3 className="font-serif text-xl text-ink-800 leading-tight">
          Una entidad nueva en tu trama
        </h3>
      </header>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre"
          className="input-paper flex-1"
          autoFocus
          aria-describedby={
            proactiveMatches.length > 0 ? 'dup-proactive-hint' : undefined
          }
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

      {/* κ3: lookup proactivo. Sólo aparece si hay matches y el server
          todavía no devolvió un 409 (en ese caso el bloque dupCandidates
          de abajo, más prominente, toma el control). Hint sutil pero
          clicable — un atajo a la entidad ya existente. */}
      {proactiveMatches.length > 0 && !dupCandidates && (
        <div
          id="dup-proactive-hint"
          className="text-caption text-ink-400 leading-relaxed -mt-1"
          role="status"
        >
          <span className="italic">ya escribiste sobre algo parecido:</span>{' '}
          {proactiveMatches.map((m, i) => (
            <span key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectEntity?.(m.id)
                  reset()
                }}
                className="text-ink-500 hover:text-ink-700 border-b border-dotted border-ink-300 hover:border-ink-500 transition-colors"
              >
                {m.name}
              </button>
              {i < proactiveMatches.length - 1 && (
                <span className="text-ink-300"> · </span>
              )}
            </span>
          ))}
        </div>
      )}
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Nota o descripción (opcional)"
        rows={2}
        className="input-paper w-full resize-none"
      />
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
        >
          Cancelar
        </button>
        <button type="submit" disabled={addEntity.isPending} className="btn-accent">
          {addEntity.isPending ? 'Añadiendo…' : 'Añadir'}
        </button>
      </div>
      {dupCandidates && dupCandidates.length > 0 && (
        <div
          className="rounded-lg p-3 mt-2"
          style={{
            backgroundColor: 'var(--accent-primary-soft)',
            border: '1px solid var(--accent-primary-ring)',
          }}
        >
          <p
            className="text-micro uppercase tracking-eyebrow font-medium mb-2"
            style={{ color: 'var(--accent-primary)' }}
          >
            ¿es la misma entidad?
          </p>
          <p className="text-xs text-ink-500 mb-2 leading-relaxed">
            Ya tienes una entidad muy parecida. Si es la misma, mejor quédate con la
            existente:
          </p>
          <ul className="space-y-1 mb-2">
            {dupCandidates.map((c) => {
              const hasNewData = description.trim().length > 0 || year.trim().length > 0
              return (
                <li key={c.id} className="flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectEntity?.(c.id)
                      setDupCandidates(null)
                      reset()
                    }}
                    className="flex-1 text-left px-2.5 py-1.5 rounded text-sm hover:bg-paper-50/70 transition-colors flex items-baseline justify-between gap-3"
                  >
                    <span>
                      <span className="text-ink-700">{c.name}</span>
                      <span className="ml-2 text-micro uppercase tracking-eyebrow text-ink-300">
                        {c.type}
                      </span>
                    </span>
                    <span className="text-micro uppercase tracking-eyebrow text-ink-300 tabular-nums">
                      {(c.similarity * 100).toFixed(0)}%
                    </span>
                  </button>
                  {/* κ3: si el usuario tipeó descripción o año, ofrecemos
                      fusionar esos datos a la entidad ya existente —
                      en vez de perderlos al saltar al detalle. */}
                  {hasNewData && (
                    <button
                      type="button"
                      onClick={() => handleMergeIntoExisting({ id: c.id, name: c.name })}
                      disabled={updateEntity.isPending}
                      className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-60 shrink-0"
                      title="Fusionar tu descripción/año en la entidad existente"
                    >
                      fusionar ↪
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={(e) => handleSubmit(e as unknown as FormEvent, true)}
              className="text-caption uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors"
            >
              crear igual ↪
            </button>
            <button
              type="button"
              onClick={() => setDupCandidates(null)}
              className="text-caption uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              cerrar
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
