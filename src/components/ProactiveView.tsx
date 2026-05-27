import {
  useAddRelationship,
  useEntitiesQuery,
  useGenerateProactive,
  useOffline,
  useProactiveQuery,
  useResolveProactive,
  useUpdateEntity,
  useUpdateEntityType,
} from '../state'
import type { ProactiveSuggestion } from '../api'
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from '../types'
import { EndMark, SparkleIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { AISourceTag } from './AISourceTag'
import { ViewHeader } from './ViewHeader'
import { ProactiveSuggestionSkeleton, SkeletonList } from './Skeleton'

/**
 * Inbox of proactive AI suggestions. The AI does a sweep over the trama and
 * leaves bundles of small, actionable proposals here. Each row has accept /
 * dismiss buttons — accepting fires the corresponding mutation (add
 * relationship / update entity type / update entity description) and marks
 * the suggestion 'applied'.
 */
export function ProactiveView() {
  const { offline } = useOffline()
  const list = useProactiveQuery()
  const generate = useGenerateProactive()
  const resolve = useResolveProactive()
  const { data: entities = [] } = useEntitiesQuery()
  const addRelationship = useAddRelationship()
  const updateEntityType = useUpdateEntityType()
  const updateEntity = useUpdateEntity()

  function lookupEntityId(name: string): string | undefined {
    const n = name.trim().toLowerCase()
    return entities.find((e) => e.name.trim().toLowerCase() === n)?.id
  }

  async function handleAccept(s: ProactiveSuggestion) {
    try {
      if (s.kind === 'relationship') {
        const fromId = lookupEntityId(s.payload.fromName ?? '')
        const toId = lookupEntityId(s.payload.toName ?? '')
        if (!fromId || !toId || !s.payload.type) throw new Error('entidades no encontradas')
        await addRelationship.mutateAsync({
          fromId,
          toId,
          type: s.payload.type,
          notes: s.payload.reason,
          origin: { kind: 'ai' },
        })
      } else if (s.kind === 'reclassification') {
        if (!s.payload.entityId || !s.payload.newType) throw new Error('payload incompleto')
        await updateEntityType.mutateAsync({
          id: s.payload.entityId,
          type: s.payload.newType,
        })
      } else if (s.kind === 'description') {
        if (!s.payload.entityId || !s.payload.description) throw new Error('payload incompleto')
        await updateEntity.mutateAsync({
          id: s.payload.entityId,
          patch: { description: s.payload.description },
        })
      } else {
        throw new Error(`tipo no soportado: ${s.kind}`)
      }
      await resolve.mutateAsync({ id: s.id, status: 'applied' })
    } catch {
      /* surfaces via resolve.error */
    }
  }

  async function handleDismiss(s: ProactiveSuggestion) {
    await resolve.mutateAsync({ id: s.id, status: 'dismissed' })
  }

  const suggestions = list.data ?? []

  return (
    <>
      <ViewHeader
        title="Sugerencias"
        eyebrow="lecturas de la IA"
        accent="var(--accent-primary)"
        eyebrowColor="var(--accent-gold)"
        noWash
        spacing="wide"
        subtitle="La IA recorre tu trama y deja aquí lo que cree que vale la pena agregar. Acepta lo que te resuene, descarta el resto. Pídele otra ronda cuando quieras."
        action={
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || offline}
            className="ai-cta"
          >
            {generate.isPending ? (
              <>
                <span className="size-3 border-2 rounded-full animate-spin" style={{ borderColor: `var(--accent-primary-ring)`, borderTopColor: `var(--accent-primary)` }} />
                pensando…
              </>
            ) : (
              <>
                <SparkleIcon size={12} />
                {suggestions.length === 0 ? 'pedir ronda' : 'pedir otra ronda'}
              </>
            )}
          </button>
        }
      />

      {generate.error && (
        <div className="alert-error mb-6 px-4 py-3 rounded-xl text-sm">
          {generate.error instanceof Error
            ? generate.error.message
            : 'Error generando sugerencias'}
        </div>
      )}

      {list.isLoading ? (
        <div className="space-y-3">
          <SkeletonList count={4} Component={ProactiveSuggestionSkeleton} />
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyMessage
          icon={<SparkleIcon size={18} />}
          title="Nada pendiente. La trama por ahora se ve serena."
          body={
            <>
              Cuando pulses <em>pedir ronda</em>, la IA revisa lo que has
              guardado y deja aquí relaciones nuevas, tipos que podrían
              afinarse, descripciones que faltan.
            </>
          }
        />
      ) : (
        <>
        <ul className="space-y-3">
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              className="group p-4 bg-paper-50/50 border border-ink-100/60 rounded-xl animate-fade-up"
              style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
            >
              <div className="flex items-baseline gap-2 mb-1.5">
                <SparkleIcon size={10} className="text-sky-700/70" />
                <span className="text-micro uppercase tracking-eyebrow text-sky-700/80">
                  {kindLabel(s.kind)}
                </span>
                {/* κ-info: provider antes era texto plano "· deepseek". Ahora
                    se condensa en el icono "i" con tooltip rico (provider +
                    modelo + timestamp). Más limpio, mismo contenido. */}
                <AISourceTag
                  provider={s.provider}
                  model={s.model}
                  at={s.createdAt}
                />
                <span
                  className="ml-auto text-micro uppercase tracking-eyebrow text-ink-300 tabular-nums"
                  title={new Date(s.createdAt).toLocaleString('es')}
                >
                  {new Date(s.createdAt).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>

              <SuggestionBody suggestion={s} />

              {s.payload.reason && (
                <p className="mt-2 text-xs text-ink-400 leading-relaxed italic">
                  {s.payload.reason}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleDismiss(s)}
                  disabled={resolve.isPending}
                  className="btn-ghost text-xs"
                >
                  descartar
                </button>
                <button
                  onClick={() => handleAccept(s)}
                  disabled={resolve.isPending}
                  className="btn-accent text-xs"
                >
                  aceptar
                </button>
              </div>
            </li>
          ))}
        </ul>
        {suggestions.length >= 3 && (
          <div className="flex justify-center mt-8 mb-2 text-ink-300">
            <EndMark size={14} />
          </div>
        )}
        </>
      )}
    </>
  )
}

function kindLabel(kind: string): string {
  if (kind === 'relationship') return 'nueva relación'
  if (kind === 'reclassification') return 'reclasificación'
  if (kind === 'description') return 'descripción faltante'
  return kind
}

function entityTypeLabel(slug?: string): string {
  if (!slug) return ''
  return ENTITY_TYPES.find((t) => t.value === slug)?.label ?? slug
}

function relTypeLabel(slug?: string): string {
  if (!slug) return ''
  return (
    RELATIONSHIP_TYPES.find((t) => t.value === slug)?.label ??
    // ρ-consistency: fallback defensivo — sin esto un type con underscore
    // que no esté en el fallback array se renderea "ASOCIADO_CON" en
    // uppercase, leak de la tabla SQL.
    slug.replace(/_/g, ' ')
  )
}

function SuggestionBody({ suggestion }: { suggestion: ProactiveSuggestion }) {
  const p = suggestion.payload
  if (suggestion.kind === 'relationship') {
    return (
      <p className="text-sm text-ink-700 leading-relaxed">
        <span>{p.fromName}</span>
        <span className="mx-2 text-micro uppercase tracking-eyebrow text-ink-300">
          {relTypeLabel(p.type)}
        </span>
        <span>{p.toName}</span>
      </p>
    )
  }
  if (suggestion.kind === 'reclassification') {
    return (
      <p className="text-sm text-ink-700 leading-relaxed">
        <span>{p.name}</span>
        <span className="ml-2 text-micro uppercase tracking-eyebrow text-ink-400 line-through decoration-ink-300/60">
          {entityTypeLabel(p.oldType)}
        </span>
        <span className="mx-1.5 text-ink-300">→</span>
        <span className="text-micro uppercase tracking-eyebrow text-sky-800">
          {entityTypeLabel(p.newType)}
        </span>
      </p>
    )
  }
  if (suggestion.kind === 'description') {
    return (
      <div className="text-sm leading-relaxed">
        <span className="text-ink-700">{p.name}</span>
        <span className="ml-2 text-micro uppercase tracking-eyebrow text-ink-300">
          añadir descripción
        </span>
        <p className="mt-1 text-ink-600 italic">"{p.description}"</p>
      </div>
    )
  }
  return null
}
