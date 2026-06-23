import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from 'react'
import { api } from '../../api'
import type { SearchQuoteHit } from '../../api'
import { useAddMomento, useToast } from '../../state'
import type { Entity, MomentoPayload } from '../../types'
import { CloseIcon, QuoteIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { getCaretCoordinates } from './caretCoordinates'
import { detectTrigger, formatQuote, replaceRange, type HojaTrigger } from './hojaText'

/** Ancho fijo del dropdown anclado al caret (px). */
const DROPDOWN_W = 288

/**
 * V-4 "Hoja suelta": una superficie de escritura que tiende un puente entre
 * el archivo y la prosa. Mientras escribís:
 *   - `@Nombre` autocompleta una entidad y la enlaza al momento.
 *   - `>` (al inicio de línea) busca una cita por texto y la inserta con
 *     atribución entre comillas latinas.
 *
 * Al guardar, la hoja se persiste como un Momento `kind:'nota'` con su
 * `bodyText` y los `entityIds` enlazados — sin tabla ni migración nueva.
 */
export function HojaEditor({ onClose }: { onClose: () => void }) {
  const addMomento = useAddMomento()
  const toast = useToast()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const suppressNextTriggerSync = useRef(false)

  const [text, setText] = useState('')
  // Entidades enlazadas (id → nombre), tanto por @mención como por cita
  // insertada. Se muestran como chips removibles para que el enlace sea
  // visible y editable, en vez de adivinar al guardar.
  const [links, setLinks] = useState<Map<string, string>>(new Map())

  const [trigger, setTrigger] = useState<HojaTrigger | null>(null)
  // Posición del dropdown anclada al caret (estilo Notion). top ya incluye la
  // altura de línea para caer justo debajo; left está clampeado al ancho del
  // textarea para no desbordar a la derecha.
  const [caretPos, setCaretPos] = useState<{ top: number; left: number } | null>(null)
  const [entityHits, setEntityHits] = useState<Entity[]>([])
  const [quoteHits, setQuoteHits] = useState<SearchQuoteHit[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)

  const itemCount = trigger?.kind === 'entity' ? entityHits.length : quoteHits.length

  // Aplica un texto programático (inserción) reposicionando el cursor tras
  // la inserción. pendingCaret evita pelear con el cursor del usuario: solo
  // se aplica cuando una inserción lo setea.
  useEffect(() => {
    if (pendingCaret.current != null && taRef.current) {
      taRef.current.focus()
      taRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
      suppressNextTriggerSync.current = false
    }
  }, [text])

  // Busca sugerencias para el trigger activo (debounced). Entidad por prefijo
  // de nombre; cita por búsqueda léxica (tsvector) — sin costo de embedding y
  // más predecible para "tipeo las palabras que recuerdo de la cita". La race
  // se corta con `cancelled`.
  useEffect(() => {
    if (!trigger) {
      setEntityHits([])
      setQuoteHits([])
      return
    }
    const q = trigger.query.trim()
    let cancelled = false

    if (trigger.kind === 'entity') {
      if (q.length < 1) {
        setEntityHits([])
        return
      }
      setSearching(true)
      const handle = setTimeout(async () => {
        try {
          const res = await api.lookupEntitiesByPrefix(q)
          if (!cancelled) {
            setEntityHits(res.slice(0, 6))
            setActiveIndex(0)
          }
        } catch {
          if (!cancelled) setEntityHits([])
        } finally {
          if (!cancelled) setSearching(false)
        }
      }, 160)
      return () => {
        cancelled = true
        clearTimeout(handle)
      }
    }

    // kind === 'quote'
    if (q.length < 2) {
      setQuoteHits([])
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const res = await api.search(q, { limit: 6, mode: 'lexical' })
        if (!cancelled) {
          setQuoteHits(res.quotes)
          setActiveIndex(0)
        }
      } catch {
        if (!cancelled) setQuoteHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [trigger])

  function applyText(next: string, caret: number) {
    pendingCaret.current = caret
    suppressNextTriggerSync.current = true
    setText(next)
  }

  function closeSuggestions() {
    setTrigger(null)
    setCaretPos(null)
    setEntityHits([])
    setQuoteHits([])
    setActiveIndex(0)
  }

  function syncTrigger(value: string, caret: number) {
    if (suppressNextTriggerSync.current) {
      closeSuggestions()
      return
    }
    const t = detectTrigger(value, caret)
    setTrigger(t)
    if (t && taRef.current) {
      // Anclamos al carácter del trigger (@ o >) para que el menú no se mueva
      // mientras se tipea la query.
      const c = getCaretCoordinates(taRef.current, t.start)
      const maxLeft = Math.max(0, taRef.current.clientWidth - DROPDOWN_W)
      setCaretPos({ top: c.top + c.height, left: Math.min(c.left, maxLeft) })
    } else {
      setCaretPos(null)
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    syncTrigger(value, e.target.selectionStart ?? value.length)
  }

  function handleSelect(e: SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    syncTrigger(ta.value, ta.selectionStart ?? ta.value.length)
  }

  function selectEntity(ent: Entity) {
    if (!trigger || trigger.kind !== 'entity') return
    const r = replaceRange(text, trigger.start, trigger.end, `@${ent.name} `)
    applyText(r.text, r.caret)
    setLinks((prev) => new Map(prev).set(ent.id, ent.name))
    closeSuggestions()
  }

  function selectQuote(hit: SearchQuoteHit) {
    if (!trigger || trigger.kind !== 'quote') return
    const insert = `${formatQuote(hit.text, hit.source ?? hit.entityName)} `
    const r = replaceRange(text, trigger.start, trigger.end, insert)
    applyText(r.text, r.caret)
    setLinks((prev) => new Map(prev).set(hit.entityId, hit.entityName))
    closeSuggestions()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger) return
    if (e.key === 'Escape') {
      setTrigger(null)
      e.preventDefault()
      return
    }
    if (itemCount === 0) return
    if (e.key === 'ArrowDown') {
      setActiveIndex((i) => (i + 1) % itemCount)
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setActiveIndex((i) => (i - 1 + itemCount) % itemCount)
      e.preventDefault()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (trigger.kind === 'entity') {
        const ent = entityHits[activeIndex]
        if (ent) selectEntity(ent)
      } else {
        const hit = quoteHits[activeIndex]
        if (hit) selectQuote(hit)
      }
    }
  }

  function removeLink(id: string) {
    setLinks((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  async function handleSave() {
    const body = text.trim()
    if (!body || addMomento.isPending) return
    const ids = [...links.keys()]
    try {
      await addMomento.mutateAsync({
        kind: 'nota',
        payload: { bodyText: body } satisfies MomentoPayload,
        ...(ids.length ? { entityIds: ids } : {}),
      })
      setText('')
      setLinks(new Map())
      setTrigger(null)
      toast.show({ message: 'Hoja guardada', tone: 'default' })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        tone: 'error',
      })
    }
  }

  return (
    <section className="mb-6 p-2.5 bg-paper-100/40 border border-ink-100/60 rounded-lg space-y-2 animate-fade-up">
      <header className="pb-1.5 border-b border-ink-100/60 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
            hoja suelta
          </p>
          <h3 className="font-serif text-xl text-ink-800 leading-tight">
            Escribe enlazando tu archivo
          </h3>
        </div>
        <IconButton
          onClick={onClose}
          className="text-ink-300 hover:text-ink-600 transition-colors shrink-0"
          label="Cerrar la hoja"
          title="Cerrar"
        >
          <CloseIcon size={14} />
        </IconButton>
      </header>

      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder="Escribe libremente. @ enlaza una entidad; al inicio de una línea, > busca una cita."
          aria-label="Hoja suelta"
          rows={8}
          className="input-paper w-full resize-y font-serif text-lead leading-relaxed placeholder:italic"
          disabled={addMomento.isPending}
          autoFocus
        />

        {trigger && caretPos && (
          <div
            className="absolute z-20 bg-paper-50 border border-ink-100/60 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto"
            style={{
              top: caretPos.top,
              left: caretPos.left,
              width: DROPDOWN_W,
              maxWidth: '100%',
            }}
          >
            {trigger.kind === 'entity' ? (
              entityHits.length > 0 ? (
                <ul>
                  {entityHits.map((ent, idx) => (
                    <li key={ent.id}>
                      <button
                        type="button"
                        // onMouseDown en vez de onClick: el click roba foco al
                        // textarea y dispara blur antes de seleccionar. mousedown
                        // corre primero y preventDefault mantiene el foco.
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectEntity(ent)
                        }}
                        className={`w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors ${
                          idx === activeIndex ? 'bg-paper-100' : 'hover:bg-paper-100/60'
                        }`}
                      >
                        <span className="text-sm text-ink-700 truncate">{ent.name}</span>
                        <span className="text-micro uppercase tracking-eyebrow text-ink-300 shrink-0">
                          {ent.type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <DropdownHint
                  searching={searching}
                  query={trigger.query.trim()}
                  minLen={1}
                  emptyText="Escribe un nombre para enlazar una entidad…"
                  noResultsText="Ninguna entidad coincide."
                />
              )
            ) : quoteHits.length > 0 ? (
              <ul>
                {quoteHits.map((hit, idx) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectQuote(hit)
                      }}
                      className={`w-full text-left px-3 py-2 transition-colors ${
                        idx === activeIndex ? 'bg-paper-100' : 'hover:bg-paper-100/60'
                      }`}
                    >
                      <p className="text-body text-ink-700 font-serif italic leading-snug line-clamp-2">
                        «{hit.text}»
                      </p>
                      <p className="text-micro uppercase tracking-eyebrow text-ink-300 mt-0.5">
                        {hit.source ?? hit.entityName}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <DropdownHint
                searching={searching}
                query={trigger.query.trim()}
                minLen={2}
                emptyText="Escribe para buscar una cita de tu archivo…"
                noResultsText="Ninguna cita coincide."
              />
            )}
          </div>
        )}
      </div>

      {links.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            enlazadas
          </span>
          {[...links].map(([id, name]) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 text-caption text-ink-600 bg-paper-50 border border-ink-100/60 rounded px-1.5 py-0.5"
            >
              {name}
              <button
                type="button"
                onClick={() => removeLink(id)}
                className="text-ink-300 hover:text-ink-600 transition-colors leading-none"
                aria-label={`Quitar enlace a ${name}`}
                title="Quitar enlace"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 pt-0">
        <p className="text-caption text-ink-400 flex items-center gap-1.5 min-w-0">
          <QuoteIcon size={12} />
          <span className="truncate">
            <code className="text-micro bg-paper-100 px-1 rounded">@</code> entidad ·{' '}
            <code className="text-micro bg-paper-100 px-1 rounded">&gt;</code> cita
          </span>
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!text.trim() || addMomento.isPending}
          className="btn-accent text-xs py-1.5 disabled:opacity-50 shrink-0"
        >
          {addMomento.isPending ? 'guardando…' : 'guardar hoja'}
        </button>
      </div>
    </section>
  )
}

/** Mensaje del dropdown cuando no hay resultados: distingue "escribe más"
    de "no hay coincidencias" según el largo de la query. */
function DropdownHint({
  searching,
  query,
  minLen,
  emptyText,
  noResultsText,
}: {
  searching: boolean
  query: string
  minLen: number
  emptyText: string
  noResultsText: string
}) {
  const text = searching ? 'buscando…' : query.length < minLen ? emptyText : noResultsText
  return <p className="px-3 py-2 text-caption text-ink-400 italic">{text}</p>
}
