import { useEffect, useMemo, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery, useRelationshipsQuery } from '../state'
import type { Entity, Quote, Relationship } from '../types'
import { EndMark } from './Icons'
import { CloseButton } from './CloseButton'
import { generateCareoLaminaBlob } from '../lib/lamina'
import { downloadBlob } from '../lib/downloadBlob'
import { useToast } from '../state/toast'
import { useModalOverlay } from '../hooks/useModalOverlay'

/**
 * Careo — dos voces frente a frente. Eliges dos entidades y sus citas se
 * enfrentan en doble columna, como un diálogo que nunca ocurrió: Borges a
 * la izquierda, Cortázar a la derecha, cada uno con su archivo completo en
 * orden cronológico. Si la trama ya los conecta, la relación se declara en
 * el centro («influye_en», «contemporáneo_de») — el careo tiene motivo.
 *
 * Lectura pura, cliente-only: compone sobre las queries cacheadas. El par
 * inicial son las dos entidades con más citas (el careo más sustancioso);
 * los pickers permiten cambiar cualquiera de los dos lados.
 */

/** Entidades con al menos una cita, ordenadas por cuántas tienen. */
export function entitiesWithQuotes(
  entities: Entity[],
  quotes: Quote[],
): { entity: Entity; count: number }[] {
  const counts = new Map<string, number>()
  for (const q of quotes) counts.set(q.entityId, (counts.get(q.entityId) ?? 0) + 1)
  return entities
    .filter((e) => (counts.get(e.id) ?? 0) > 0)
    .map((entity) => ({ entity, count: counts.get(entity.id)! }))
    .sort((a, b) => b.count - a.count || a.entity.name.localeCompare(b.entity.name))
}

/** La relación directa entre los dos (si la trama la registró). */
export function findDirectRelation(
  relationships: Relationship[],
  aId: string,
  bId: string,
): Relationship | null {
  return (
    relationships.find(
      (r) => (r.fromId === aId && r.toId === bId) || (r.fromId === bId && r.toId === aId),
    ) ?? null
  )
}

function QuoteColumn({ entity, quotes }: { entity: Entity; quotes: Quote[] }) {
  return (
    <div className="min-w-0">
      <header className="mb-6 text-center">
        <h3 className="text-micro uppercase tracking-shout text-ink-500">
          {entity.name}
        </h3>
        <p className="mt-1 text-micro uppercase tracking-wider text-ink-300">
          {entity.type}
          {entity.year ? ` · ${entity.year}` : ''}
        </p>
      </header>
      {quotes.length === 0 ? (
        <p className="text-center font-serif italic text-caption text-ink-300">
          sin citas todavía
        </p>
      ) : (
        <ul className="space-y-7">
          {quotes.map((q) => (
            <li key={q.id}>
              <blockquote className="font-serif italic text-lead leading-relaxed text-ink-700">
                «{q.text}»
              </blockquote>
              {q.source && (
                <p className="mt-1.5 font-serif italic text-caption text-ink-400">
                  {q.source}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Careo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const overlay = useModalOverlay({ open, onClose })

  const candidates = useMemo(
    () => entitiesWithQuotes(entities, quotes),
    [entities, quotes],
  )

  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)

  // Par inicial: las dos entidades con más citas. Se fija una sola vez
  // cuando llegan los datos; después mandan los pickers.
  useEffect(() => {
    if (!open) return
    if (leftId || rightId) return
    if (candidates.length >= 2) {
      setLeftId(candidates[0]!.entity.id)
      setRightId(candidates[1]!.entity.id)
    }
  }, [open, candidates, leftId, rightId])

  const left = entities.find((e) => e.id === leftId) ?? null
  const right = entities.find((e) => e.id === rightId) ?? null
  const byCreated = (a: Quote, b: Quote) => a.createdAt.localeCompare(b.createdAt)
  const leftQuotes = left
    ? quotes.filter((q) => q.entityId === left.id).sort(byCreated)
    : []
  const rightQuotes = right
    ? quotes.filter((q) => q.entityId === right.id).sort(byCreated)
    : []
  const relation =
    left && right ? findDirectRelation(relationships, left.id, right.id) : null

  // Lámina del careo: la primera cita de cada lado, frente a frente.
  async function handleLamina() {
    if (!left || !right || exporting) return
    const lq = leftQuotes[0]
    const rq = rightQuotes[0]
    if (!lq || !rq) return
    setExporting(true)
    try {
      const blob = await generateCareoLaminaBlob({
        left: { name: left.name, text: lq.text },
        right: { name: right.name, text: rq.text },
        relation: relation ? relation.type.replace(/_/g, ' ') : null,
      })
      downloadBlob(blob, 'careo.png')
    } catch {
      toast.show({ message: 'No se pudo generar la lámina', tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  if (!open) return null

  const pickerCls =
    'input-paper h-8 max-w-[14rem] rounded-md border border-ink-200 px-2 text-caption text-ink-700'

  return (
    <div
      ref={overlay.dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Careo"
      className="fixed inset-0 z-50 flex flex-col bg-paper-50 animate-fade-up"
    >
      <CloseButton
        onClick={onClose}
        className="absolute top-5 right-5 p-2 text-ink-300 hover:text-ink-700 transition-colors"
      />

      <header className="pt-12 pb-6 px-6 text-center">
        <p className="text-micro uppercase tracking-shout text-ink-300">careo</p>
        <h2 className="mt-3 font-serif text-h2 text-ink-800 text-balance">
          Dos voces frente a frente
        </h2>
        {/* Pickers — cualquiera de los dos lados se puede cambiar. */}
        {candidates.length >= 2 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <select
              aria-label="Voz de la izquierda"
              value={leftId ?? ''}
              onChange={(e) => setLeftId(e.target.value)}
              className={pickerCls}
            >
              {candidates.map(({ entity, count }) => (
                <option
                  key={entity.id}
                  value={entity.id}
                  disabled={entity.id === rightId}
                >
                  {entity.name} ({count})
                </option>
              ))}
            </select>
            <span className="font-serif italic text-caption text-ink-400">frente a</span>
            <select
              aria-label="Voz de la derecha"
              value={rightId ?? ''}
              onChange={(e) => setRightId(e.target.value)}
              className={pickerCls}
            >
              {candidates.map(({ entity, count }) => (
                <option key={entity.id} value={entity.id} disabled={entity.id === leftId}>
                  {entity.name} ({count})
                </option>
              ))}
            </select>
          </div>
        )}
        {left && right && leftQuotes[0] && rightQuotes[0] && (
          <button
            onClick={handleLamina}
            disabled={exporting}
            className="mt-4 section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-40"
          >
            {exporting ? 'generando…' : 'lámina del careo'}
          </button>
        )}
        {/* Si la trama ya los conecta, el careo se declara con motivo. */}
        {relation && (
          <p className="mt-3 text-micro uppercase tracking-eyebrow text-ink-400">
            la trama los une: {relation.type.replace(/_/g, ' ')}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-16">
        {candidates.length < 2 ? (
          <p className="mx-auto max-w-md text-center font-serif italic text-lead text-ink-400 leading-relaxed pt-10">
            El careo necesita al menos dos entidades con citas. Cuando tu archivo las
            tenga, acá van a poder mirarse de frente.
          </p>
        ) : left && right ? (
          <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-10">
            <QuoteColumn entity={left} quotes={leftQuotes} />
            {/* La canaleta central: el pliegue de la doble página. */}
            <div aria-hidden className="hidden md:flex flex-col items-center gap-4 pt-2">
              <span className="w-px flex-1 bg-ink-100" />
              <EndMark className="ornament shrink-0" />
              <span className="w-px flex-1 bg-ink-100" />
            </div>
            <QuoteColumn entity={right} quotes={rightQuotes} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
