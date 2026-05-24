import { useRef, useState } from 'react'
import {
  useAddEntity,
  useAddQuote,
  useAddRelationship,
  useEntitiesQuery,
  useUpdateEntity,
  useUpdateEntityType,
  useUpdateQuote,
  useUpdateRelationship,
  useDeleteEntity,
  useDeleteQuote,
  useDeleteRelationship,
} from '../../state'
import { ENTITY_TYPES, RELATIONSHIP_TYPES, type Origin } from '../../types'
import type { ChatProposal } from '../../api'
import { SparkleIcon } from '../Icons'

const AI_ORIGIN: Origin = { kind: 'ai' }

/**
 * Renders a structured proposal block that came inside an assistant chat
 * message. The user can accept individual items or "accept all". Items that
 * are accepted disappear from the local block (we keep state per item).
 */
export function InlineProposal({ proposal }: { proposal: ChatProposal }) {
  const { data: entities = [] } = useEntitiesQuery()
  const addEntity = useAddEntity()
  const addRelationship = useAddRelationship()
  const addQuote = useAddQuote()
  const updateType = useUpdateEntityType()
  const updateEntity = useUpdateEntity()
  const updateQuote = useUpdateQuote()
  const updateRelationship = useUpdateRelationship()
  const deleteEntity = useDeleteEntity()
  const deleteQuote = useDeleteQuote()
  const deleteRelationship = useDeleteRelationship()

  // Track per-item: 'pending' | 'applied' | 'failed'
  type Status = 'pending' | 'applied' | 'failed'
  const entityList = proposal.entities ?? []
  const relList = proposal.relationships ?? []
  const quoteList = proposal.quotes ?? []
  const reclassList = proposal.reclassifications ?? []
  const editList = proposal.edits ?? []
  const deleteList = proposal.deletes ?? []

  const [statusEntities, setStatusEntities] = useState<Status[]>(
    entityList.map(() => 'pending'),
  )
  const [statusRels, setStatusRels] = useState<Status[]>(relList.map(() => 'pending'))
  const [statusQuotes, setStatusQuotes] = useState<Status[]>(quoteList.map(() => 'pending'))
  const [statusReclass, setStatusReclass] = useState<Status[]>(reclassList.map(() => 'pending'))
  const [statusEdits, setStatusEdits] = useState<Status[]>(editList.map(() => 'pending'))
  const [statusDeletes, setStatusDeletes] = useState<Status[]>(deleteList.map(() => 'pending'))

  // Map local de ids recién creados durante la ronda de "aceptar todo".
  // Se usa como overlay encima del cache `entities` porque el cache no se
  // refleja sincrónicamente entre la creación de una entidad y el lookup
  // siguiente — esa carrera causaba los "FALLÓ" en relaciones que dependen
  // de entidades recién creadas en el mismo batch.
  const recentlyCreatedRef = useRef<Map<string, string>>(new Map())

  function lookupEntityId(name: string): string | undefined {
    const n = name.trim().toLowerCase()
    const fresh = recentlyCreatedRef.current.get(n)
    if (fresh) return fresh
    return entities.find((e) => e.name.trim().toLowerCase() === n)?.id
  }

  async function applyEntity(i: number) {
    const e = entityList[i]
    try {
      const created = await addEntity.mutateAsync({
        type: e.type,
        name: e.name,
        year: e.year,
        description: e.description,
        spotifyUrl: e.spotifyUrl,
        origin: AI_ORIGIN,
        // El chat propuso estas entidades con el contexto de la trama
        // actual. Trust the user's review aquí y bypass el dup guard.
        _force: true,
      })
      // Registrar en el map local para que applyRelationship/applyQuote
      // hechas inmediatamente después puedan resolver el id sin esperar
      // a que el cache de TanStack se actualice.
      recentlyCreatedRef.current.set(created.name.trim().toLowerCase(), created.id)
      setStatusEntities((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusEntities((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyRelationship(i: number) {
    const r = relList[i]
    const fromId = lookupEntityId(r.fromName)
    const toId = lookupEntityId(r.toName)
    if (!fromId || !toId || fromId === toId) {
      setStatusRels((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
      return
    }
    try {
      await addRelationship.mutateAsync({
        fromId,
        toId,
        type: r.type,
        notes: r.notes,
        origin: AI_ORIGIN,
      })
      setStatusRels((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusRels((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyQuote(i: number) {
    const q = quoteList[i]
    const entityId = lookupEntityId(q.entityName)
    if (!entityId) {
      setStatusQuotes((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
      return
    }
    try {
      await addQuote.mutateAsync({
        entityId,
        text: q.text,
        source: q.source,
        origin: AI_ORIGIN,
      })
      setStatusQuotes((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusQuotes((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyReclass(i: number) {
    const r = reclassList[i]
    const id = lookupEntityId(r.name)
    if (!id) {
      setStatusReclass((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
      return
    }
    try {
      await updateType.mutateAsync({ id, type: r.newType })
      setStatusReclass((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusReclass((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyEdit(i: number) {
    const e = editList[i]
    try {
      if (e.kind === 'entity') {
        await updateEntity.mutateAsync({ id: e.id, patch: e.patch as Parameters<typeof updateEntity.mutateAsync>[0]['patch'] })
      } else if (e.kind === 'quote') {
        await updateQuote.mutateAsync({ id: e.id, patch: e.patch as Parameters<typeof updateQuote.mutateAsync>[0]['patch'] })
      } else if (e.kind === 'relationship') {
        await updateRelationship.mutateAsync({ id: e.id, patch: e.patch as Parameters<typeof updateRelationship.mutateAsync>[0]['patch'] })
      }
      setStatusEdits((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusEdits((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyDelete(i: number) {
    const d = deleteList[i]
    try {
      // silent: el usuario ya está revisando esta propuesta inline,
      // no necesita un toast "Deshacer" superpuesto.
      if (d.kind === 'entity') await deleteEntity.mutateAsync({ id: d.id, silent: true })
      else if (d.kind === 'quote') await deleteQuote.mutateAsync({ id: d.id, silent: true })
      else if (d.kind === 'relationship')
        await deleteRelationship.mutateAsync({ id: d.id, silent: true })
      setStatusDeletes((s) => s.map((v, idx) => (idx === i ? 'applied' : v)))
    } catch {
      setStatusDeletes((s) => s.map((v, idx) => (idx === i ? 'failed' : v)))
    }
  }

  async function applyAll() {
    // "Aceptar todo" applies non-destructive items by default. Deletes stay
    // out — they must be individually clicked.
    //
    // IMPORTANTE: SECUENCIAL en dos fases.
    // - Fase 1: entidades. Cada applyEntity registra el id recién creado
    //   en recentlyCreatedRef. Sin esto, las relaciones que referencian
    //   entidades NUEVAS por nombre fallan porque el cache de TanStack
    //   aún no se actualizó cuando applyRelationship hace su lookup.
    // - Fase 2: el resto puede correr en paralelo entre sí, ya con todos
    //   los ids resueltos.
    for (let i = 0; i < statusEntities.length; i++) {
      if (statusEntities[i] === 'pending') {
        await applyEntity(i)
      }
    }
    await Promise.all([
      ...statusRels.map((s, i) => (s === 'pending' ? applyRelationship(i) : null)),
      ...statusQuotes.map((s, i) => (s === 'pending' ? applyQuote(i) : null)),
      ...statusReclass.map((s, i) => (s === 'pending' ? applyReclass(i) : null)),
      ...statusEdits.map((s, i) => (s === 'pending' ? applyEdit(i) : null)),
    ])
  }

  const labelEntityType = (slug: string) =>
    ENTITY_TYPES.find((t) => t.value === slug)?.label ?? slug
  const labelRelType = (slug: string) =>
    RELATIONSHIP_TYPES.find((t) => t.value === slug)?.label ?? slug

  const totalPending =
    statusEntities.filter((s) => s === 'pending').length +
    statusRels.filter((s) => s === 'pending').length +
    statusQuotes.filter((s) => s === 'pending').length +
    statusReclass.filter((s) => s === 'pending').length +
    statusEdits.filter((s) => s === 'pending').length

  const hasItems =
    entityList.length + relList.length + quoteList.length + reclassList.length +
    editList.length + deleteList.length > 0
  if (!hasItems) return null

  return (
    // ζ10: marco editorial. La caja tenía solo border + bg; ahora le
    // añadimos cuatro marcas en las esquinas (estilo corner brackets de
    // documentos archivísticos) para que el momento "la IA propuso algo"
    // se sienta de catálogo, no de UI genérica. Los corner marks están
    // en CSS pseudo-elementos para no contaminar el JSX.
    <div className="mt-3 ai-panel proposal-frame relative">
      <header
        className="px-3 py-2 flex items-baseline justify-between"
        style={{ borderBottom: '1px solid var(--accent-primary-ring)' }}
      >
        <div className="flex items-baseline gap-2 text-micro uppercase tracking-eyebrow" style={{ color: 'var(--accent-primary)' }}>
          <SparkleIcon size={12} />
          propuestas
        </div>
        {totalPending > 1 && (
          <button
            onClick={applyAll}
            className="text-micro uppercase tracking-eyebrow hover:opacity-80 transition-opacity"
            style={{ color: 'var(--accent-primary)' }}
          >
            aceptar todo
          </button>
        )}
      </header>

      <ul className="px-3 py-2 space-y-1.5">
        {entityList.map((e, i) => (
          <ProposalRow
            key={`e${i}`}
            status={statusEntities[i]}
            onAccept={() => applyEntity(i)}
            primary={e.name}
            secondary={labelEntityType(e.type)}
            extra={e.description}
            spotifyUrl={e.spotifyUrl}
          />
        ))}
        {relList.map((r, i) => (
          <ProposalRow
            key={`r${i}`}
            status={statusRels[i]}
            onAccept={() => applyRelationship(i)}
            primary={`${r.fromName} → ${r.toName}`}
            secondary={labelRelType(r.type)}
            extra={r.notes}
          />
        ))}
        {quoteList.map((q, i) => (
          <ProposalRow
            key={`q${i}`}
            status={statusQuotes[i]}
            onAccept={() => applyQuote(i)}
            primary={`«${q.text}»`}
            secondary={`— ${q.entityName}${q.source ? ' · ' + q.source : ''}`}
          />
        ))}
        {reclassList.map((r, i) => (
          <ProposalRow
            key={`x${i}`}
            status={statusReclass[i]}
            onAccept={() => applyReclass(i)}
            primary={r.name}
            secondary={`→ ${labelEntityType(r.newType)}`}
            extra={r.reason}
          />
        ))}
        {editList.map((e, i) => {
          const kindLabel =
            e.kind === 'entity' ? 'edit entidad' : e.kind === 'quote' ? 'edit cita' : 'edit relación'
          const patchSummary = Object.entries(e.patch)
            .map(([k, v]) => `${k}: ${v === null ? '—' : String(v).slice(0, 40)}`)
            .join(' · ')
          return (
            <ProposalRow
              key={`ed${i}`}
              status={statusEdits[i]}
              onAccept={() => applyEdit(i)}
              primary={e.name ?? e.preview ?? e.id.slice(0, 8)}
              secondary={kindLabel}
              extra={[patchSummary, e.reason].filter(Boolean).join(' — ')}
            />
          )
        })}
        {deleteList.map((d, i) => (
          <ProposalRow
            key={`del${i}`}
            status={statusDeletes[i]}
            onAccept={() => applyDelete(i)}
            primary={d.preview}
            secondary={`borrar ${d.kind === 'entity' ? 'entidad' : d.kind === 'quote' ? 'cita' : 'relación'}`}
            extra={d.reason}
            tone="warn"
          />
        ))}
      </ul>
    </div>
  )
}

function ProposalRow({
  status,
  onAccept,
  primary,
  secondary,
  extra,
  spotifyUrl,
  tone,
}: {
  status: 'pending' | 'applied' | 'failed'
  onAccept: () => void
  primary: string
  secondary: string
  extra?: string
  spotifyUrl?: string
  tone?: 'warn'
}) {
  const secondaryStyle =
    tone === 'warn' ? { color: 'var(--accent-clay)' } : undefined
  return (
    <li className="flex items-start gap-2 text-sm">
      <div className="min-w-0 flex-1 leading-relaxed">
        <span className="text-ink-700">{primary}</span>
        <span
          className="ml-2 text-micro uppercase tracking-eyebrow text-ink-400"
          style={secondaryStyle}
        >
          {secondary}
        </span>
        {spotifyUrl && (
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-micro uppercase tracking-eyebrow text-emerald-700/80 hover:text-emerald-900 transition-colors"
          >
            ↗ Spotify
          </a>
        )}
        {extra && (
          <p className="text-ink-400 text-xs leading-relaxed mt-0.5">{extra}</p>
        )}
      </div>
      {status === 'pending' && (
        <button
          onClick={onAccept}
          className="text-micro uppercase tracking-eyebrow hover:opacity-80 transition-opacity px-2 py-0.5"
          style={{ color: 'var(--accent-primary)' }}
        >
          aceptar
        </button>
      )}
      {status === 'applied' && (
        <span
          className="text-micro uppercase tracking-eyebrow px-2 py-0.5"
          style={{ color: 'var(--accent-sage)' }}
        >
          ✓ en la trama
        </span>
      )}
      {status === 'failed' && (
        <span className="text-micro uppercase tracking-eyebrow text-red-700 px-2 py-0.5">
          falló
        </span>
      )}
    </li>
  )
}
