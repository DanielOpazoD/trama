import { useEffect, useMemo, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../state'
import { useModalOverlay } from '../hooks/useModalOverlay'
import type { Quote } from '../types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DiceIcon,
  ReadingIcon,
} from './Icons'
import { LaminaModal } from './quotes/LaminaModal'

/**
 * Atril — el archivo en el atril de lectura. Absorbe Sortes ("segunda
 * lectura"): la página se abre por suerte y lo que aparece, aparece.
 *
 *  - "del día": estable. La primera vez del día se sortea una cita y se
 *    guarda en localStorage; reabrir muestra la misma hasta sortear otra.
 *  - flechas (← →): hojear el archivo en orden cronológico desde la cita
 *    actual. Hojear es lectura, no suerte — NO pisa la cita del día.
 *  - dado: vuelve a sortear (sin repetir la actual) y esa pasa a ser la
 *    cita del día.
 *  - marginalia: si la cita tiene reflexión del usuario, aparece como nota
 *    manuscrita al margen (Caveat) — tu voz junto al texto, no debajo como
 *    prosa del catálogo.
 *
 * Lectura pura — no muta nada. Cliente-only: lee las citas ya cacheadas
 * por useQuotesQuery, sin endpoint propio.
 */

// Misma key que el viejo Sortes: la cita del día sobrevive al rename.
const STORAGE_KEY = 'trama:sortes'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Elige una cita al azar. Si `excludeId` está y hay más de una, nunca
 * devuelve la excluida — así el dado siempre cambia de cita.
 */
export function pickRandom(quotes: Quote[], excludeId?: string): Quote | null {
  const pool =
    excludeId && quotes.length > 1 ? quotes.filter((q) => q.id !== excludeId) : quotes
  if (pool.length === 0) return null
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx] ?? null
}

function readStored(): { date: string; quoteId: string } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date?: unknown; quoteId?: unknown }
    if (typeof parsed.date === 'string' && typeof parsed.quoteId === 'string') {
      return { date: parsed.date, quoteId: parsed.quoteId }
    }
  } catch {
    /* localStorage deshabilitado o JSON corrupto — sorteamos de nuevo */
  }
  return null
}

function writeStored(quoteId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today(), quoteId }))
  } catch {
    /* storage deshabilitado */
  }
}

export function Atril({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: quotes = [] } = useQuotesQuery()
  const { data: entities = [] } = useEntitiesQuery()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [laminaOpen, setLaminaOpen] = useState(false)

  // El orden de hojeo: el archivo como se fue escribiendo (cronológico).
  const ordered = useMemo(
    () =>
      [...quotes].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ),
    [quotes],
  )

  // Al abrir: si hay una cita "del día" válida (misma fecha y todavía
  // existe), mostrarla; si no, sortear una nueva y persistirla.
  useEffect(() => {
    if (!open) return
    if (quotes.length === 0) {
      setCurrentId(null)
      return
    }
    const stored = readStored()
    if (
      stored &&
      stored.date === today() &&
      quotes.some((q) => q.id === stored.quoteId)
    ) {
      setCurrentId(stored.quoteId)
      return
    }
    const picked = pickRandom(quotes)
    if (picked) {
      setCurrentId(picked.id)
      writeStored(picked.id)
    }
  }, [open, quotes])

  const index = useMemo(
    () => ordered.findIndex((q) => q.id === currentId),
    [ordered, currentId],
  )
  const quote = index >= 0 ? (ordered[index] ?? null) : null
  const entity = quote ? (entities.find((e) => e.id === quote.entityId) ?? null) : null
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < ordered.length - 1

  function goPrev() {
    if (index > 0) setCurrentId(ordered[index - 1]!.id)
  }
  function goNext() {
    if (index >= 0 && index < ordered.length - 1) setCurrentId(ordered[index + 1]!.id)
  }
  function rollDice() {
    const picked = pickRandom(quotes, currentId ?? undefined)
    if (picked) {
      setCurrentId(picked.id)
      writeStored(picked.id)
    }
  }

  // Escape, focus trap, scroll-lock y restaurar foco los maneja
  // useModalOverlay. Acá solo quedan los atajos PROPIOS del atril: ← →
  // para hojear el archivo. Sin deps a propósito: cada render renueva el
  // listener para que goPrev/goNext cierren sobre el `index` vigente.
  const overlay = useModalOverlay({ open, onClose })

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  return (
    <div
      ref={overlay.dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Atril"
      className="fixed inset-0 z-50 flex flex-col bg-paper-50 animate-fade-up"
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-5 right-5 p-2 text-ink-300 hover:text-ink-700 transition-colors"
      >
        <CloseIcon />
      </button>

      {/* Flechas laterales — hojear el archivo sin salir del atril. */}
      {quote && (
        <>
          <button
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Cita anterior"
            className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 p-3 text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeftIcon size={22} />
          </button>
          <button
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Cita siguiente"
            className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 p-3 text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronRightIcon size={22} />
          </button>
        </>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-12 md:px-6 text-center">
        <p className="text-micro uppercase tracking-shout text-ink-300 flex items-center gap-2 mb-10">
          <ReadingIcon size={12} />
          atril
        </p>

        {quote ? (
          <article className="relative max-w-2xl">
            <blockquote className="font-serif italic text-h1 leading-snug text-ink-700">
              «{quote.text}»
            </blockquote>
            {(entity || quote.source) && (
              <footer className="mt-8 flex flex-col items-center gap-1">
                <span
                  aria-hidden
                  className="block w-10 h-px mb-3"
                  style={{ backgroundColor: 'var(--accent-gold)' }}
                />
                {entity && (
                  <span className="text-micro uppercase tracking-eyebrow text-ink-500">
                    {entity.name}
                  </span>
                )}
                {quote.source && (
                  <span className="font-serif italic text-caption text-ink-400">
                    {quote.source}
                  </span>
                )}
              </footer>
            )}
            {/* Marginalia — tu reflexión, manuscrita al margen. En pantallas
                anchas vive literalmente en el margen derecho de la cita; en
                angostas baja como hoja pegada debajo. */}
            {quote.userReflection && (
              <aside
                aria-label="Tu reflexión"
                className="marginalia-script mt-10 mx-auto max-w-xs text-left -rotate-1 lg:mt-0 lg:mx-0 lg:absolute lg:left-full lg:top-4 lg:ml-12 lg:w-52"
              >
                {quote.userReflection}
              </aside>
            )}
          </article>
        ) : (
          <p className="font-serif italic text-lead text-ink-400 max-w-md leading-relaxed">
            Todavía no hay citas en tu trama. Cuando guardes la primera vas a poder abrir
            el archivo al azar.
          </p>
        )}
      </div>

      {quote && (
        <div className="pb-10 flex items-center justify-center gap-6">
          <span className="text-micro tabular-nums text-ink-300" aria-hidden>
            {index + 1} / {ordered.length}
          </span>
          <button
            onClick={rollDice}
            aria-label="Sortear otra cita"
            className="section-eyebrow flex items-center gap-1.5 hover:text-ink-700 transition-colors"
          >
            <DiceIcon size={12} />
            al azar
          </button>
          <button
            onClick={() => setLaminaOpen(true)}
            aria-label="Exportar como lámina"
            className="section-eyebrow hover:text-ink-700 transition-colors"
          >
            lámina
          </button>
        </div>
      )}

      {laminaOpen && quote && (
        <LaminaModal
          input={{
            text: quote.text,
            attribution: entity?.name ?? 'Anónimo',
            source: quote.source ?? null,
            marginalia: quote.userReflection ?? null,
          }}
          onClose={() => setLaminaOpen(false)}
        />
      )}
    </div>
  )
}
