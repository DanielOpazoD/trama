import { useEffect, useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useAddEntity,
  useAddRelationship,
  useAddQuote,
  useUpdateEntity,
  useUpdateQuote,
  useUpdateRelationship,
  useDeleteEntity,
  useDeleteRelationship,
  useDeleteQuote,
} from '../state'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type ExtractionProposal,
  type ProposedEdit,
  type ProposedDelete,
  type ProposedEntity,
  type ProposedQuote,
  type ProposedRelationship,
} from '../types'
import { CheckIcon, CloseIcon } from './Icons'
import { AISourceTag } from './AISourceTag'

type CheckedState = {
  entities: boolean[]
  relationships: boolean[]
  quotes: boolean[]
  edits: boolean[]
  /** Deletes default to UNCHECKED — opt-in only. */
  deletes: boolean[]
}

function initialChecked(proposal: ExtractionProposal): CheckedState {
  return {
    entities: proposal.entities.map(() => true),
    relationships: proposal.relationships.map(() => true),
    quotes: proposal.quotes.map(() => true),
    edits: (proposal.edits ?? []).map(() => true),
    deletes: (proposal.deletes ?? []).map(() => false), // opt-in
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
  const updateEntity = useUpdateEntity()
  const updateQuote = useUpdateQuote()
  const updateRelationship = useUpdateRelationship()
  const deleteEntity = useDeleteEntity()
  const deleteRelationship = useDeleteRelationship()
  const deleteQuote = useDeleteQuote()

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

  const edits = proposal.edits ?? []
  const deletes = proposal.deletes ?? []
  const total =
    proposal.entities.length +
    proposal.relationships.length +
    proposal.quotes.length +
    edits.length +
    deletes.length

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
            // The AI extraction already had the existing entities as context
            // and proposed matchedId for any near-dups it spotted. Trust the
            // user's review here and bypass the server-side dup guard.
            _force: true,
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

      // ---------- edits ----------
      for (let i = 0; i < edits.length; i++) {
        if (!checked.edits[i]) continue
        const e = edits[i]
        try {
          if (e.kind === 'entity') {
            await updateEntity.mutateAsync({ id: e.id, patch: e.patch })
          } else if (e.kind === 'quote') {
            await updateQuote.mutateAsync({ id: e.id, patch: e.patch })
          } else if (e.kind === 'relationship') {
            await updateRelationship.mutateAsync({ id: e.id, patch: e.patch })
          }
        } catch {
          /* skip */
        }
      }

      // ---------- deletes (opt-in) ----------
      for (let i = 0; i < deletes.length; i++) {
        if (!checked.deletes[i]) continue
        const d = deletes[i]
        try {
          // silent: no queremos un toast "Deshacer" por cada delete
          // dentro de un bulk apply — el usuario ya revisó y aceptó
          // la propuesta entera en el modal.
          if (d.kind === 'entity') {
            await deleteEntity.mutateAsync({ id: d.id, silent: true })
          } else if (d.kind === 'quote') {
            await deleteQuote.mutateAsync({ id: d.id, silent: true })
          } else if (d.kind === 'relationship') {
            await deleteRelationship.mutateAsync({ id: d.id, silent: true })
          }
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
      {/* θ6: header rediseñado — eyebrow serif para "propuesta IA"
          (en vez de uppercase plano), modelo como chip más prominente,
          source-text en serif más grande. El panel ahora se siente
          como un manuscrito de la IA, no como un dialog modal. */}
      <header className="px-6 pad-block-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
        <div className="min-w-0 stack-2">
          <p
            className="section-eyebrow-serif flex items-center gap-2 flex-wrap"
            style={{ color: 'var(--accent-gold)' }}
          >
            <span>◆ propuesta</span>
            {proposal.model && (
              <span className="chip" data-tone="primary">
                {proposal.model}
              </span>
            )}
            {/* κ-info: el chip ya muestra el modelo; el icono añade tooltip
                editorial con provider y metadatos sin pelearse con la
                jerarquía visual del header. */}
            <AISourceTag provider={proposal.provider} model={proposal.model} />
          </p>
          <h2 className="font-serif text-xl text-ink-700 leading-tight truncate" title={sourceText}>
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

      {/* θ6: padding alineado con el resto del RightPanel (px-6).
          space-y-8 entre secciones grandes para que respiren. */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
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

        {edits.length > 0 && (
          <Section title="Cambios">
            {edits.map((edit, index) => (
              <ProposedEditRow
                key={index}
                edit={edit}
                checked={checked.edits[index]}
                onToggle={() => toggle('edits', index)}
              />
            ))}
          </Section>
        )}

        {deletes.length > 0 && (
          <Section title="Eliminar — opt-in" tone="warn">
            {deletes.map((del, index) => (
              <ProposedDeleteRow
                key={index}
                del={del}
                checked={checked.deletes[index]}
                onToggle={() => toggle('deletes', index)}
              />
            ))}
          </Section>
        )}

        {error && (
          <div className="alert-error px-3 py-2 text-sm">
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

function Section({
  title,
  children,
  tone,
}: {
  title: string
  children: React.ReactNode
  tone?: 'warn'
}) {
  return (
    <div>
      {/* θ6: section-eyebrow-serif (small caps Spectral) en vez del
          uppercase tracking-wider plano. Más coherente con QuickNoteForm
          y QuotesList del NodeDetailPanel. */}
      <h3
        className="section-eyebrow-serif mb-3"
        style={tone === 'warn' ? { color: 'var(--accent-clay)' } : undefined}
      >
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function ProposedEditRow({
  edit,
  checked,
  onToggle,
}: {
  edit: ProposedEdit
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
        <div className="flex items-baseline gap-2 text-sm">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--accent-primary)' }}
          >
            editar {edit.kind === 'entity' ? 'entidad' : edit.kind === 'quote' ? 'cita' : 'relación'}
          </span>
          <span className="text-ink-700">
            {edit.kind === 'entity' ? edit.name : edit.preview}
          </span>
        </div>
        <div className="mt-1 text-xs text-ink-500 space-y-0.5">
          {Object.entries(edit.patch).map(([k, v]) => (
            <div key={k}>
              <span className="text-ink-300">{k}:</span>{' '}
              <span className="text-ink-600">{v === null ? '—' : String(v)}</span>
            </div>
          ))}
        </div>
        {edit.reason && (
          <p className="mt-1 text-xs text-ink-400 italic">{edit.reason}</p>
        )}
      </div>
    </li>
  )
}

function ProposedDeleteRow({
  del,
  checked,
  onToggle,
}: {
  del: ProposedDelete
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-start gap-3 p-3 border rounded-lg" style={{ borderColor: 'var(--accent-clay)', backgroundColor: 'rgb(162 82 57 / 0.04)' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
        style={{ accentColor: 'var(--accent-clay)' }}
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-baseline gap-2">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--accent-clay)' }}
          >
            borrar {del.kind === 'entity' ? 'entidad' : del.kind === 'quote' ? 'cita' : 'relación'}
          </span>
          <span className="text-ink-700">{del.preview}</span>
        </div>
        {del.reason && (
          <p className="mt-1 text-xs text-ink-400 italic">{del.reason}</p>
        )}
      </div>
    </li>
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
          <span className="text-xs uppercase tracking-wider text-ink-400">
            {typeLabel ?? entity.type}
          </span>
          {entity.matchedId && (
            <span className="text-xs uppercase tracking-wider text-emerald-700/80">
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
        <span className="mx-2 text-xs uppercase tracking-wider text-ink-400">
          {typeLabel ?? rel.type}
        </span>
        <span className="text-ink-700">{rel.toName}</span>
        {rel.notes && (
          <p className="mt-1 text-ink-400 leading-relaxed">{rel.notes}</p>
        )}
        {rel.verification && (
          <div className="mt-2">
            {/* θ6: verdict badges con backplate de chip — antes era solo
                texto uppercase, ahora se sienten como un sello (pasó
                verificación) o una banderita (dudó). Más fácil de
                escanear cuando hay varias propuestas. */}
            {rel.verification.agreed ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow font-medium"
                style={{
                  backgroundColor: 'var(--accent-sage-soft)',
                  color: 'var(--accent-sage)',
                }}
              >
                <CheckIcon size={10} strokeOverride={3} />
                verificado por {rel.verification.verifier}
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow font-medium"
                  style={{
                    backgroundColor: 'var(--accent-gold-soft)',
                    color: 'var(--accent-gold)',
                  }}
                >
                  <span aria-hidden>⚠</span>
                  {rel.verification.verifier} dudó
                </span>
                {rel.verification.note && (
                  <span className="text-xs text-ink-500 italic">
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
