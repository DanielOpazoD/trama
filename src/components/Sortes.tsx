import { useEffect, useMemo, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../state'
import type { Quote } from '../types'
import { CloseIcon, ReadingIcon } from './Icons'

/**
 * Sortes — "segunda lectura".
 *
 * Abre el archivo al azar y muestra una sola cita, a pantalla completa,
 * fuera de la lista. Sortes virgilianae sobre tu propia trama: la página
 * se abre por suerte y lo que aparece, aparece. La idea es reencontrarte
 * con algo que guardaste y ya no recordabas.
 *
 *  - "del día": estable. La primera vez que abrís en el día se sortea una
 *    cita y se guarda en localStorage; reabrir muestra la misma hasta que
 *    pidas otra.
 *  - "otra": vuelve a sortear (evitando repetir la actual) y reemplaza la
 *    cita del día.
 *
 * Lectura pura — no muta nada. Cliente-only: lee las citas ya cacheadas
 * por useQuotesQuery, sin endpoint propio.
 */

const STORAGE_KEY = 'trama:sortes'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Elige una cita al azar. Si `excludeId` está y hay más de una, nunca
 * devuelve la excluida — así "otra" siempre cambia de cita.
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

export function Sortes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: quotes = [] } = useQuotesQuery()
  const { data: entities = [] } = useEntitiesQuery()
  const [currentId, setCurrentId] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const quote = useMemo(
    () => quotes.find((q) => q.id === currentId) ?? null,
    [quotes, currentId],
  )
  const entity = quote ? (entities.find((e) => e.id === quote.entityId) ?? null) : null

  function drawAnother() {
    const picked = pickRandom(quotes, currentId ?? undefined)
    if (picked) {
      setCurrentId(picked.id)
      writeStored(picked.id)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Sortes"
      className="fixed inset-0 z-50 flex flex-col bg-paper-50 animate-fade-up"
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-5 right-5 p-2 text-ink-300 hover:text-ink-700 transition-colors"
      >
        <CloseIcon />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-micro uppercase tracking-shout text-ink-300 flex items-center gap-2 mb-10">
          <ReadingIcon size={12} />
          sortes
        </p>

        {quote ? (
          <article className="max-w-2xl">
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
          </article>
        ) : (
          <p className="font-serif italic text-lead text-ink-400 max-w-md leading-relaxed">
            Todavía no hay citas en tu trama. Cuando guardes la primera vas a poder abrir
            el archivo al azar.
          </p>
        )}
      </div>

      {quote && (
        <div className="pb-10 flex items-center justify-center">
          <button
            onClick={drawAnother}
            className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
          >
            otra
          </button>
        </div>
      )}
    </div>
  )
}
