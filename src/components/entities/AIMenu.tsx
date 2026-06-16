import { useEffect, useRef, useState } from 'react'
import { SparkleIcon } from '../Icons'
import { AIThinkingLabel } from '../AIThinkingLabel'

/**
 * Menú desplegable de acciones IA para el header de Entidades.
 * Hoy solo expone "reclasificar tipos"; el patrón está pensado para
 * crecer — agregar "describir con IA" / "sugerir vínculos" sin tener
 * que repensar el chrome del header.
 *
 * Cierra al hacer click fuera o presionar ESC.
 */
export function AIMenu({
  onReclassify,
  reclassifyPending,
  onFindDuplicates,
  duplicatesPending,
  onSuggestWikipedia,
  wikipediaPending,
  disabled,
}: {
  onReclassify: () => void
  reclassifyPending: boolean
  onFindDuplicates: () => void
  duplicatesPending: boolean
  onSuggestWikipedia: () => void
  wikipediaPending: boolean
  disabled: boolean
}) {
  const pending = reclassifyPending || duplicatesPending || wikipediaPending
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || pending}
        className="ai-cta"
        title="Acciones con IA"
        aria-label="Acciones con IA"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={pending}
      >
        {pending ? (
          <AIThinkingLabel state="reviewing" />
        ) : (
          <>
            <SparkleIcon size={12} />
            IA
            <span aria-hidden className="text-ink-400 ml-0.5">
              ▾
            </span>
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[200px] bg-paper-50 border border-ink-100/80 rounded-md shadow-md shadow-ink-900/15 py-1 z-20 animate-fade-up"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onReclassify()
            }}
            className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-paper-100/70 transition-colors flex items-center gap-2"
          >
            <SparkleIcon size={12} className="text-ink-400" />
            Reclasificar tipos
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onFindDuplicates()
            }}
            className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-paper-100/70 transition-colors flex items-center gap-2"
          >
            <SparkleIcon size={12} className="text-ink-400" />
            Buscar duplicados
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSuggestWikipedia()
            }}
            className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-paper-100/70 transition-colors flex items-center gap-2"
          >
            <SparkleIcon size={12} className="text-ink-400" />
            Sugerir Wikipedia
          </button>
        </div>
      )}
    </div>
  )
}
