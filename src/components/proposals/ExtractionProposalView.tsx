import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type ProposedEntity,
  type ProposedQuote,
  type ProposedRelationship,
} from '../../types'
import { CheckIcon } from '../Icons'
import { Section } from './utils'

/**
 * G2 (FF3-d) — secciones aditivas de la propuesta IA: Entidades,
 * Relaciones, Citas. Extraído de `ProposalPanel.tsx` para que el panel
 * orquestador (header + footer + estado de check) quede más delgado.
 *
 * Cada sección se auto-oculta si su array está vacío — coherente con
 * el comportamiento original (lo decidía el panel orquestador con un
 * `proposal.<x>.length > 0`).
 *
 * El estado de check (qué filas están marcadas) lo maneja el padre via
 * `checked` + `onToggle`. El renderer es presentacional.
 */
export function ExtractionProposalView({
  entities,
  relationships,
  quotes,
  checkedEntities,
  checkedRelationships,
  checkedQuotes,
  onToggleEntity,
  onToggleRelationship,
  onToggleQuote,
}: {
  entities: ProposedEntity[]
  relationships: ProposedRelationship[]
  quotes: ProposedQuote[]
  checkedEntities: boolean[]
  checkedRelationships: boolean[]
  checkedQuotes: boolean[]
  onToggleEntity: (index: number) => void
  onToggleRelationship: (index: number) => void
  onToggleQuote: (index: number) => void
}) {
  return (
    <>
      {entities.length > 0 && (
        <Section title="Entidades">
          {entities.map((entity, index) => (
            <ProposedEntityRow
              key={index}
              entity={entity}
              checked={checkedEntities[index] ?? false}
              onToggle={() => onToggleEntity(index)}
            />
          ))}
        </Section>
      )}

      {relationships.length > 0 && (
        <Section title="Relaciones">
          {relationships.map((rel, index) => (
            <ProposedRelationshipRow
              key={index}
              rel={rel}
              checked={checkedRelationships[index] ?? false}
              onToggle={() => onToggleRelationship(index)}
            />
          ))}
        </Section>
      )}

      {quotes.length > 0 && (
        <Section title="Citas">
          {quotes.map((quote, index) => (
            <ProposedQuoteRow
              key={index}
              quote={quote}
              checked={checkedQuotes[index] ?? false}
              onToggle={() => onToggleQuote(index)}
            />
          ))}
        </Section>
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
        {rel.notes && <p className="mt-1 text-ink-400 leading-relaxed">{rel.notes}</p>}
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
