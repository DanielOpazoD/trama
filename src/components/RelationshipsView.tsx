import { useState, type FormEvent } from 'react'
import { RELATIONSHIP_TYPES, type RelationshipType } from '../types'
import { useTrama } from '../state'

export function RelationshipsView() {
  const { entities, relationships, addRelationship, deleteRelationship } = useTrama()
  const [fromId, setFromId] = useState('')
  const [type, setType] = useState<RelationshipType>('influye_en')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!fromId || !toId || fromId === toId) return
    addRelationship({
      fromId,
      type,
      toId,
      notes: notes.trim() || undefined,
    })
    setFromId('')
    setToId('')
    setNotes('')
  }

  if (entities.length < 2) {
    return (
      <p className="text-stone-500 italic leading-relaxed">
        Necesitas al menos dos entidades para crear una relación. Añádelas en la pestaña{' '}
        <em className="text-stone-700">Entidades</em>.
      </p>
    )
  }

  return (
    <>
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Nueva relación
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
            >
              <option value="">— origen —</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as RelationshipType)}
              className="px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
            >
              {RELATIONSHIP_TYPES.map((relType) => (
                <option key={relType.value} value={relType.value}>
                  {relType.label}
                </option>
              ))}
            </select>
            <select
              value={toId}
              onChange={(event) => setToId(event.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
            >
              <option value="">— destino —</option>
              {entities
                .filter((entity) => entity.id !== fromId)
                .map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
            </select>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Nota sobre la relación (opcional)"
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-stone-800 text-stone-50 rounded hover:bg-stone-700 transition-colors text-sm"
          >
            Añadir relación
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          {relationships.length === 0
            ? 'Aún sin relaciones'
            : `${relationships.length} ${
                relationships.length === 1 ? 'relación' : 'relaciones'
              }`}
        </h2>
        <ul className="space-y-3">
          {relationships.map((rel) => {
            const from = entities.find((entity) => entity.id === rel.fromId)
            const to = entities.find((entity) => entity.id === rel.toId)
            const typeLabel =
              RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ?? rel.type
            return (
              <li
                key={rel.id}
                className="group p-3 bg-white border border-stone-100 rounded transition-shadow hover:shadow-sm"
              >
                <div className="flex justify-between items-baseline gap-4">
                  <div className="text-stone-700 leading-relaxed">
                    <span className="text-stone-800">{from?.name ?? '—'}</span>
                    <span className="mx-2 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                      {typeLabel}
                    </span>
                    <span className="text-stone-800">{to?.name ?? '—'}</span>
                    {rel.origin === 'ai' && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded align-middle">
                        ia
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteRelationship(rel.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-700 text-xs"
                  >
                    eliminar
                  </button>
                </div>
                {rel.notes && (
                  <p className="mt-1 text-sm text-stone-500 leading-relaxed">
                    {rel.notes}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
