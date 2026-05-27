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
import type { ExtractionProposal } from '../types'
import { CloseIcon } from './Icons'
import { AISourceTag } from './AISourceTag'
import {
  initialChecked,
  type CheckedState,
} from './proposals/utils'
import { ExtractionProposalView } from './proposals/ExtractionProposalView'
import { EditsProposalView } from './proposals/EditsProposalView'

/**
 * G2 (FF3-d) — ProposalPanel ahora es el shell del modal de propuestas
 * IA: header con metadatos del modelo, footer con "descartar / añadir
 * a la trama", estado de check + handlers de aplicar/cancelar.
 *
 * Los renderers de sección viven en `src/components/proposals/`:
 *   - `ExtractionProposalView` — Entidades / Relaciones / Citas (aditivo)
 *   - `EditsProposalView`     — Cambios / Eliminar (destructivo + opt-in)
 *
 * Reclasificación NO vive acá — el panel para eso es `ReclassifyPanel.tsx`
 * (distinto modal, distinto shape de propuesta), invocado desde
 * `EntitiesView` con su propio flujo. La audit lo proyectó en este
 * archivo pero no encaja: el "kind" del que habla el audit es la sub-
 * sección dentro de un único `ExtractionProposal`, no propuestas de
 * tipos distintos.
 */
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
        if (!e) continue
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
        if (!r) continue
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
        if (!q) continue
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
        if (!e) continue
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
        if (!d) continue
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
          <h2
            className="font-serif text-xl text-ink-700 leading-tight truncate"
            title={sourceText}
          >
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

        <ExtractionProposalView
          entities={proposal.entities}
          relationships={proposal.relationships}
          quotes={proposal.quotes}
          checkedEntities={checked.entities}
          checkedRelationships={checked.relationships}
          checkedQuotes={checked.quotes}
          onToggleEntity={(index) => toggle('entities', index)}
          onToggleRelationship={(index) => toggle('relationships', index)}
          onToggleQuote={(index) => toggle('quotes', index)}
        />

        <EditsProposalView
          edits={edits}
          deletes={deletes}
          checkedEdits={checked.edits}
          checkedDeletes={checked.deletes}
          onToggleEdit={(index) => toggle('edits', index)}
          onToggleDelete={(index) => toggle('deletes', index)}
        />

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
          <button onClick={handleConfirm} disabled={submitting} className="btn-accent">
            {submitting ? 'guardando…' : 'añadir a la trama'}
          </button>
        </footer>
      )}
    </div>
  )
}
