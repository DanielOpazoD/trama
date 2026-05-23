import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Entity } from '../types'
import { ENTITY_TYPES } from '../types'

/**
 * Autocomplete de entidades sobre /api/entities-lookup.
 *
 * Pensado para reemplazar &lt;select&gt; gigantes en formularios cuando
 * la lista crece a miles. En vez de cargar todas las opciones, el
 * usuario escribe un prefijo y el servidor devuelve los 10 mejores
 * matches (trigram + ILIKE).
 *
 * Props:
 *   value:         id seleccionado, o null
 *   onChange:      callback cuando se elige una entidad (o se borra)
 *   excludeId:     opcional, esconde esa entidad del dropdown (útil para
 *                  el "to" del formulario de relaciones, que no debería
 *                  permitir seleccionar la misma entidad que el "from")
 *   placeholder:   texto del input cuando está vacío
 *
 * No persiste estado entre renders más allá del input string y el flag
 * de dropdown abierto — el padre maneja la selección.
 */
export function EntityCombobox({
  value,
  onChange,
  excludeId,
  placeholder = 'busca una entidad…',
  selectedName,
}: {
  value: string | null
  onChange: (entity: Entity | null) => void
  excludeId?: string | null
  placeholder?: string
  /** Si el padre ya tiene el nombre de la entidad seleccionada, pásalo —
      evita un fetch extra para resolver el id a name. */
  selectedName?: string | null
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce el fetch al escribir. 200ms es ágil sin saturar.
  useEffect(() => {
    if (!open) return
    const trimmed = input.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        const hits = await api.lookupEntitiesByPrefix(trimmed)
        const filtered = excludeId ? hits.filter((h) => h.id !== excludeId) : hits
        setResults(filtered)
        setHighlight(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(id)
  }, [input, open, excludeId])

  // Click fuera cierra el dropdown.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handleSelect(entity: Entity) {
    onChange(entity)
    setOpen(false)
    setInput('')
  }

  function handleClear() {
    onChange(null)
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault()
      handleSelect(results[highlight])
    }
  }

  // Vista "ya hay algo seleccionado": chip con el nombre + botón ✕.
  if (value && selectedName) {
    return (
      <div
        ref={containerRef}
        className="input-paper flex items-center gap-2 w-full cursor-default"
      >
        <span className="flex-1 text-ink-700 truncate">{selectedName}</span>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Cambiar entidad"
          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors shrink-0"
        >
          cambiar
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="input-paper w-full"
        autoComplete="off"
      />
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-lg border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-xl shadow-ink-900/15"
        >
          {loading && input.trim() ? (
            <p className="px-3 py-2 text-xs text-ink-300 italic">buscando…</p>
          ) : input.trim() === '' ? (
            <p className="px-3 py-2 text-xs text-ink-300 italic">
              escribe para buscar…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-300 italic">
              ninguna coincidencia
            </p>
          ) : (
            <ul className="py-1">
              {results.map((entity, idx) => (
                <li key={entity.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === highlight}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => handleSelect(entity)}
                    className={
                      idx === highlight
                        ? 'w-full text-left px-3 py-1.5 text-sm bg-ink-700/5 transition-colors'
                        : 'w-full text-left px-3 py-1.5 text-sm hover:bg-ink-700/5 transition-colors'
                    }
                  >
                    <span className="text-ink-700">{entity.name}</span>
                    <span className="ml-2 text-micro uppercase tracking-eyebrow text-ink-300">
                      {ENTITY_TYPES.find((t) => t.value === entity.type)?.label ?? entity.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
