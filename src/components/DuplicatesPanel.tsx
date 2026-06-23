import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type DuplicateGroup } from '../api'
import { queryKeys } from '../state/queryClient'
import { typeAccent } from './graph/GraphNode'

/**
 * Panel de revisión de entidades duplicadas. Cada grupo muestra los candidatos;
 * el usuario marca CUÁL conservar y combina — el resto se absorbe (sus citas,
 * relaciones y momentos pasan a la conservada) y se soft-deletean. Nada se
 * combina sin confirmación explícita.
 *
 * El estado (keeper elegido, busy) se indexa por la identidad del grupo, no por
 * índice posicional — así remover un grupo resuelto no descoloca al resto.
 */
export function DuplicatesPanel({
  groups: initial,
  embeddingSkipped,
  onClose,
}: {
  groups: DuplicateGroup[]
  embeddingSkipped: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [groups, setGroups] = useState(initial)
  const [keepers, setKeepers] = useState<Map<DuplicateGroup, string>>(
    () => new Map(initial.map((g) => [g, g.entities[0]?.id ?? ''])),
  )
  const [busy, setBusy] = useState<DuplicateGroup | null>(null)
  const [error, setError] = useState<string | null>(null)

  function keeperOf(g: DuplicateGroup): string {
    return keepers.get(g) ?? g.entities[0]?.id ?? ''
  }

  async function merge(g: DuplicateGroup) {
    const keepId = keeperOf(g)
    const mergeIds = g.entities.filter((e) => e.id !== keepId).map((e) => e.id)
    if (!keepId || mergeIds.length === 0) return
    setBusy(g)
    setError(null)
    try {
      await api.mergeEntities(keepId, mergeIds)
      // Refresca todo lo que el merge tocó (el prefijo cubre infinite + counts).
      queryClient.invalidateQueries({ queryKey: queryKeys.entities })
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes })
      setGroups((prev) => prev.filter((x) => x !== g))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo combinar')
    } finally {
      setBusy(null)
    }
  }

  function dismiss(g: DuplicateGroup) {
    setGroups((prev) => prev.filter((x) => x !== g))
  }

  if (groups.length === 0) {
    return (
      <div className="card-paper-soft mb-6 flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-500">
        <span>No quedan grupos de duplicados.</span>
        <button onClick={onClose} className="btn-ghost text-xs">
          cerrar
        </button>
      </div>
    )
  }

  return (
    <div className="card-paper mb-6 p-4 animate-fade-up">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="section-eyebrow-serif">
          {groups.length === 1
            ? 'Posible duplicado'
            : `${groups.length} posibles duplicados`}
        </h3>
        <button onClick={onClose} className="btn-ghost text-xs">
          cerrar
        </button>
      </div>
      {embeddingSkipped && (
        <p className="mb-2 text-micro text-ink-400">
          Demasiadas entidades para comparar por similitud — solo por nombre.
        </p>
      )}
      {error && <p className="alert-error mb-2 rounded-lg px-3 py-2 text-sm">{error}</p>}
      <ul className="space-y-4">
        {groups.map((g, i) => {
          const keepId = keeperOf(g)
          return (
            <li key={i} className="border-l-2 border-ink-200/70 pl-3">
              <span className="section-eyebrow">
                {g.reason === 'name'
                  ? 'nombre idéntico'
                  : `similar · ${Math.round((g.similarity ?? 0) * 100)}%`}
              </span>
              <fieldset className="mt-1 space-y-1">
                {g.entities.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      checked={keepId === e.id}
                      onChange={() => setKeepers((m) => new Map(m).set(g, e.id))}
                      aria-label={`Conservar ${e.name}`}
                    />
                    <span className="text-ink-700">{e.name}</span>
                    <span
                      className="text-micro uppercase tracking-eyebrow"
                      style={{ color: typeAccent(e.type) }}
                    >
                      {e.type}
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => merge(g)}
                  disabled={busy === g}
                  className="btn-accent text-xs disabled:opacity-50"
                  title="Conserva la entidad marcada y absorbe las demás"
                >
                  {busy === g ? 'combinando…' : 'Combinar en la marcada'}
                </button>
                <button onClick={() => dismiss(g)} className="btn-ghost text-xs">
                  descartar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
