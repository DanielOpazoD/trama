import { useEffect, useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useAddEntity,
  useAddRelationship,
  useAddQuote,
} from '../state'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type ExtractionProposal,
  type ProposedEntity,
  type ProposedQuote,
  type ProposedRelationship,
} from '../types'
import { CloseIcon } from './Icons'

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

export function ProposalPanel({
  proposal,
  sourceText,
  onClose,
  onConfirmed,
}: {
  proposal: ExtractionProposal
  sourceText: string
  onClose: () => void
  onConfirmed: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const addEntity = useAddEntity()
  const addRelationship = useAddRelationship()
  const addQuote = useAddQuote()

  const [checked, setChecked] = useState<CheckedState>(() => initialChecked(proposal))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [submitting, onClose])

  const entitiesByLowerName = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities) map.set(e.name.trim().toLowerCase(), e.id)
    return map
  }, [entities])

  const total =
    proposal.entities.length +
    proposal.relationships.length +
    proposal.quotes.length

  function toggle(section: keyof CheckedState, index: number) {
    setChecked((prev) => {
      const next = { ...prev, [section]: [...prev[section]] }
      next[section][index] = !next[section][index]
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      const idByLowerName = new Map<string, string>(entitiesByLowerName)

      for (let i = 0; i < proposal.entities.length; i++) {
        if (!checked.entities[i]) continue
        const e = proposal.entities[i]
        if (e.matchedId) {
          idByLowerName.set(e.name.trim().toLowerCase(), e.matchedId)
          continue
        }
        const existing = idByLowerName.get(e.name.trim().toLowerCase())
        if (existing) continue
        try {
          const created = await addEntity.mutateAsync({
            type: e.type,
            name: e.name,
            year: e.year,
            description: e.description,
            spotifyUrl: e.spotifyUrl,
            origin: { kind: 'ai' },
          })
          idByLowerName.set(created.name.trim().toLowerCase(), created.id)
        } catch {
          /* skip — error surfaces via the mutation's error state */
        }
      }

      for (let i = 0; i < proposal.relationships.length; i++) {
        if (!checked.relationships[i]) continue
        const r = proposal.relationships[i]
        const fromId = idByLowerName.get(r.fromName.trim().toLowerCase())
        const toId = idByLowerName.get(r.toName.trim().toLowerCase())
        if (!fromId || !toId || fromId === toId) continue
        try {
          await addRelationship.mutateAsync({
            fromId,
            toId,
            type: r.type,
            notes: r.notes,
            origin: { kind: 'ai' },
          })
        } catch {
          /* skip */
        }
      }

      for (let i = 0; i < proposal.quotes.length; i++) {
        if (!checked.quotes[i]) continue
        const q = proposal.quotes[i]
        const entityId = idByLowerName.get(q.entityName.trim().toLowerCase())
        if (!entityId) continue
        try {
          await addQuote.mutateAsync({
            entityId,
            text: q.text,
            source: q.source,
            context: q.context,
            origin: { kind: 'ai' },
          })
        } catch {
          /* skip */
        }
      }

      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label="Propuesta de la IA"
    >
      <header className="px-5 py-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-300">Propuesta</p>
          <h2 className="font-serif text-lg text-ink-700 truncate" title={sourceText}>
            {sourceText.length > 60 ? `${sourceText.slice(0, 60)}…` : sourceText}
          </h2>
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
        {total === 0 && (
          <p className="text-ink-300 italic text-sm">
            La IA no detectó nada concreto. Prueba con más contexto.
          </p>
        )}

        {proposal.entities.length > 0 && (
          <Section title="Entidades">
            {proposal.entities.map((entity, index) => (
              <ProposedEntityRow
                key={index}
                entity={entity}
                checked={checked.entities[index]}
                onToggle={() => toggle('entities', index)}
              />
            ))}
          </Section>
        )}

        {proposal.relationships.length > 0 && (
          <Section title="Relaciones">
            {proposal.relationships.map((rel, index) => (
              <ProposedRelationshipRow
                key={index}
                rel={rel}
                checked={checked.relationships[index]}
                onToggle={() => toggle('relationships', index)}
              />
            ))}
          </Section>
        )}

        {proposal.quotes.length > 0 && (
          <Section title="Citas">
            {proposal.quotes.map((quote, index) => (
              <ProposedQuoteRow
                key={index}
                quote={quote}
                checked={checked.quotes[index]}
                onToggle={() => toggle('quotes', index)}
              />
            ))}
          </Section>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {total > 0 && (
        <footer className="px-5 py-4 border-t border-ink-100/60 flex items-center justify-between gap-3">
          <button onClick={onClose} disabled={submitting} className="btn-ghost">
            descartar
          </button>
          <button onClick={handleConfirm} disabled={submitting} className="btn-ink">
            {submitting ? 'guardando…' : 'añadir a la trama'}
          </button>
        </footer>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-300 mb-2">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
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
    <li className="flex items-start gap-3 p-3 bg-paper-100/50 border border-ink-100 rounded-lg">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-ink-600"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-ink-700">{entity.name}</span>
          {entity.year !== undefined && (
            <span className="text-ink-300 text-sm">({entity.year})</span>
          )}
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300">
            {typeLabel ?? entity.type}
          </span>
          {entity.matchedId && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/80">
              ya existe
            </span>
          )}
        </div>
        {entity.description && (
          <p className="mt-1 text-ink-500 text-sm leading-relaxed">
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
    <li className="flex items-start gap-3 p-3 bg-paper-100/50 border border-ink-100 rounded-lg">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-ink-600"
      />
      <div className="min-w-0 flex-1 text-sm">
        <span className="text-ink-700">{rel.fromName}</span>
        <span className="mx-2 text-[10px] uppercase tracking-[0.18em] text-ink-300">
          {typeLabel ?? rel.type}
        </span>
        <span className="text-ink-700">{rel.toName}</span>
        {rel.notes && (
          <p className="mt-1 text-ink-400 leading-relaxed">{rel.notes}</p>
        )}
        {rel.verification && (
          <div className="mt-1">
            {rel.verification.agreed ? (
              <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/80">
                ✓ verificado por {rel.verification.verifier}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.18em] text-amber-700/90">
                ⚠ {rel.verification.verifier} dudó
                {rel.verification.note && (
                  <span className="normal-case tracking-normal text-ink-500 italic ml-1">
                    — {rel.verification.note}
                  </span>
                )}
              </span>
            )}
          </div>
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
    <li className="flex items-start gap-3 p-3 bg-paper-100/50 border border-ink-100 rounded-lg">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-ink-600"
      />
      <div className="min-w-0 flex-1">
        <blockquote className="font-serif text-ink-600 leading-relaxed border-l-2 border-ink-200 pl-3 italic text-sm">
          «{quote.text}»
        </blockquote>
        <div className="mt-1 pl-3 text-xs">
          <span className="text-ink-500">— {quote.entityName}</span>
          {quote.source && <span className="text-ink-300 ml-2">· {quote.source}</span>}
        </div>
      </div>
    </li>
  )
}
