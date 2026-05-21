import { useEffect, useState } from 'react'
import type { Reclassification } from '../api'
import { ENTITY_TYPES } from '../types'
import { CloseIcon, SparkleIcon } from './Icons'

/**
 * Inline panel rendered above the entity list when the AI returns
 * reclassification proposals. The user picks which to apply with checkboxes
 * (all selected by default).
 */
export function ReclassifyPanel({
  proposals,
  onClose,
  onApply,
}: {
  proposals: Reclassification[]
  onClose: () => void
  onApply: (selected: Reclassification[]) => Promise<void>
}) {
  const [checked, setChecked] = useState<boolean[]>(() => proposals.map(() => true))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  function label(slug: string) {
    return ENTITY_TYPES.find((t) => t.value === slug)?.label ?? slug
  }

  async function handleApply() {
    setSubmitting(true)
    try {
      const selected = proposals.filter((_, i) => checked[i])
      await onApply(selected)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCount = checked.filter(Boolean).length

  return (
    <section
      role="region"
      aria-label="Propuesta de reclasificación"
      className="mb-8 border border-sky-200/60 bg-sky-50/40 rounded-xl overflow-hidden animate-fade-up"
    >
      <header className="px-4 py-3 flex items-baseline justify-between border-b border-sky-200/50">
        <div className="flex items-baseline gap-2">
          <SparkleIcon size={12} />
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-sky-900/80">
            reclasificación sugerida
          </h3>
          <span className="text-xs text-ink-400">
            {proposals.length} {proposals.length === 1 ? 'cambio' : 'cambios'}
          </span>
        </div>
        <button
          onClick={onClose}
          disabled={submitting}
          className="p-1 text-ink-300 hover:text-ink-700 rounded transition-colors"
          aria-label="Cerrar"
        >
          <CloseIcon />
        </button>
      </header>

      <ul className="px-4 py-3 space-y-2">
        {proposals.map((p, i) => (
          <li key={p.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={() => toggle(i)}
              className="mt-1 accent-ink-700"
              aria-label={`Reclasificar ${p.name}`}
            />
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
              <div>
                <span className="text-ink-700">{p.name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-400 line-through decoration-ink-300/60">
                  {label(p.oldType)}
                </span>
                <span className="mx-1.5 text-ink-300">→</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-sky-800">
                  {label(p.newType)}
                </span>
              </div>
              {p.reason && (
                <p className="text-ink-400 text-xs leading-relaxed mt-0.5">
                  {p.reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="px-4 py-3 border-t border-sky-200/50 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="btn-ghost text-xs"
        >
          descartar
        </button>
        <button
          onClick={handleApply}
          disabled={submitting || selectedCount === 0}
          className="btn-ink text-xs"
        >
          {submitting
            ? 'aplicando…'
            : selectedCount === proposals.length
              ? 'aplicar todo'
              : `aplicar ${selectedCount}`}
        </button>
      </footer>
    </section>
  )
}
