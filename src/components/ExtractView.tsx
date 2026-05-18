import { useMemo, useState, type FormEvent } from 'react'
import { useTrama } from '../state'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type ExtractionProposal,
  type ProposedEntity,
  type ProposedQuote,
  type ProposedRelationship,
} from '../types'

type CheckedState = {
  entities: boolean[]
  relationships: boolean[]
  quotes: boolean[]
}

function initialChecked(proposal: ExtractionProposal): CheckedState {
  return {
    entities: proposal.entities.map(() => true),
    relationships: proposal.relationships.map(() => true),
    quotes: proposal.quotes.map(() => true),
  }
}

export function ExtractView() {
  const {
    extract,
    addEntity,
    addRelationship,
    addQuote,
    entities,
    offline,
  } = useTrama()

  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<ExtractionProposal | null>(null)
  const [checked, setChecked] = useState<CheckedState | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const entitiesByLowerName = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities) map.set(e.name.trim().toLowerCase(), e.id)
    return map
  }, [entities])

  async function handleExtract(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setError(null)
    setSuccess(null)
    setProposal(null)
    setChecked(null)
    setLoading(true)
    try {
      const result = await extract(trimmed)
      setProposal(result)
      setChecked(initialChecked(result))
      if (
        result.entities.length === 0 &&
        result.relationships.length === 0 &&
        result.quotes.length === 0
      ) {
        setError('La IA no detectó nada concreto. Prueba con más contexto.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function toggle(section: keyof CheckedState, index: number) {
    setChecked((prev) => {
      if (!prev) return prev
      const next = { ...prev, [section]: [...prev[section]] }
      next[section][index] = !next[section][index]
      return next
    })
  }

  async function handleConfirm() {
    if (!proposal || !checked) return
    setSubmitting(true)
    setError(null)
    try {
      // 1. Create new entities (skip those matching existing).
      const idByLowerName = new Map<string, string>(entitiesByLowerName)
      for (let i = 0; i < proposal.entities.length; i++) {
        if (!checked.entities[i]) continue
        const e = proposal.entities[i]
        if (e.matchedId) {
          idByLowerName.set(e.name.trim().toLowerCase(), e.matchedId)
          continue
        }
        const existingId = idByLowerName.get(e.name.trim().toLowerCase())
        if (existingId) continue
        const created = await addEntity({
          type: e.type,
          name: e.name,
          year: e.year,
          description: e.description,
          origin: 'ai',
        })
        if (created) idByLowerName.set(created.name.trim().toLowerCase(), created.id)
      }

      // 2. Create relationships (resolving from/to names to ids).
      for (let i = 0; i < proposal.relationships.length; i++) {
        if (!checked.relationships[i]) continue
        const r = proposal.relationships[i]
        const fromId = idByLowerName.get(r.fromName.trim().toLowerCase())
        const toId = idByLowerName.get(r.toName.trim().toLowerCase())
        if (!fromId || !toId || fromId === toId) continue
        await addRelationship({
          fromId,
          toId,
          type: r.type,
          notes: r.notes,
          origin: 'ai',
        })
      }

      // 3. Create quotes (resolving entityName to entityId).
      for (let i = 0; i < proposal.quotes.length; i++) {
        if (!checked.quotes[i]) continue
        const q = proposal.quotes[i]
        const entityId = idByLowerName.get(q.entityName.trim().toLowerCase())
        if (!entityId) continue
        await addQuote({
          entityId,
          text: q.text,
          source: q.source,
          context: q.context,
          origin: 'ai',
        })
      }

      const totalAccepted =
        checked.entities.filter(Boolean).length +
        checked.relationships.filter(Boolean).length +
        checked.quotes.filter(Boolean).length
      setSuccess(`Añadido a la trama: ${totalAccepted} elementos.`)
      setText('')
      setProposal(null)
      setChecked(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setProposal(null)
    setChecked(null)
    setError(null)
    setSuccess(null)
  }

  return (
    <>
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Mensaje desordenado
        </h2>
        <form onSubmit={handleExtract} className="space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Escribe algo: lo que estás leyendo, una cita que te quedó, ideas sueltas… La IA propondrá qué añadir a tu trama."
            rows={6}
            className="w-full px-4 py-3 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors resize-none leading-relaxed"
            disabled={loading || submitting}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading || submitting || !text.trim() || offline}
              className="px-5 py-2 bg-stone-800 text-stone-50 rounded hover:bg-stone-700 transition-colors text-sm disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Extrayendo…' : 'Extraer'}
            </button>
            {offline && (
              <span className="text-xs text-amber-700">
                la extracción por IA requiere backend — estás en modo local
              </span>
            )}
          </div>
        </form>
      </section>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded text-sm text-emerald-800">
          {success}
        </div>
      )}

      {proposal && checked && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Propuesta
            </h2>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                disabled={submitting}
                className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
              >
                descartar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-1.5 bg-stone-800 text-stone-50 rounded hover:bg-stone-700 transition-colors text-xs disabled:bg-stone-300"
              >
                {submitting ? 'guardando…' : 'confirmar selección'}
              </button>
            </div>
          </div>

          {proposal.entities.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-2">
                Entidades
              </h3>
              <ul className="space-y-2">
                {proposal.entities.map((entity, index) => (
                  <ProposedEntityRow
                    key={index}
                    entity={entity}
                    checked={checked.entities[index]}
                    onToggle={() => toggle('entities', index)}
                  />
                ))}
              </ul>
            </div>
          )}

          {proposal.relationships.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-2">
                Relaciones
              </h3>
              <ul className="space-y-2">
                {proposal.relationships.map((rel, index) => (
                  <ProposedRelationshipRow
                    key={index}
                    rel={rel}
                    checked={checked.relationships[index]}
                    onToggle={() => toggle('relationships', index)}
                  />
                ))}
              </ul>
            </div>
          )}

          {proposal.quotes.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-2">
                Citas
              </h3>
              <ul className="space-y-3">
                {proposal.quotes.map((quote, index) => (
                  <ProposedQuoteRow
                    key={index}
                    quote={quote}
                    checked={checked.quotes[index]}
                    onToggle={() => toggle('quotes', index)}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function ProposedEntityRow({
  entity,
  checked,
  onToggle,
}: {
  entity: ProposedEntity
  checked: boolean
  onToggle: () => void
}) {
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  return (
    <li className="flex items-start gap-3 p-3 bg-white border border-stone-100 rounded">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-stone-700"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-stone-800">{entity.name}</span>
          {entity.year !== undefined && (
            <span className="text-stone-500 text-sm">({entity.year})</span>
          )}
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
            {typeLabel ?? entity.type}
          </span>
          {entity.matchedId && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              ya existe
            </span>
          )}
        </div>
        {entity.description && (
          <p className="mt-1 text-stone-600 text-sm leading-relaxed">
            {entity.description}
          </p>
        )}
      </div>
    </li>
  )
}

function ProposedRelationshipRow({
  rel,
  checked,
  onToggle,
}: {
  rel: ProposedRelationship
  checked: boolean
  onToggle: () => void
}) {
  const typeLabel = RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label
  return (
    <li className="flex items-start gap-3 p-3 bg-white border border-stone-100 rounded">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-stone-700"
      />
      <div className="min-w-0 flex-1">
        <div className="text-stone-700 leading-relaxed">
          <span className="text-stone-800">{rel.fromName}</span>
          <span className="mx-2 text-[10px] uppercase tracking-[0.2em] text-stone-400">
            {typeLabel ?? rel.type}
          </span>
          <span className="text-stone-800">{rel.toName}</span>
        </div>
        {rel.notes && (
          <p className="mt-1 text-sm text-stone-500 leading-relaxed">{rel.notes}</p>
        )}
      </div>
    </li>
  )
}

function ProposedQuoteRow({
  quote,
  checked,
  onToggle,
}: {
  quote: ProposedQuote
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-start gap-3 p-3 bg-white border border-stone-100 rounded">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-stone-700"
      />
      <div className="min-w-0 flex-1">
        <blockquote className="text-stone-700 leading-relaxed border-l-2 border-stone-300 pl-3 italic">
          «{quote.text}»
        </blockquote>
        <div className="mt-1 pl-3 text-sm">
          <span className="text-stone-600">— {quote.entityName}</span>
          {quote.source && (
            <span className="text-stone-400 ml-2">· {quote.source}</span>
          )}
        </div>
        {quote.context && (
          <p className="mt-1 pl-3 text-sm text-stone-500 leading-relaxed">
            {quote.context}
          </p>
        )}
      </div>
    </li>
  )
}
