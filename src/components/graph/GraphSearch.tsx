import { useEffect, useMemo, useRef, useState } from 'react'
import type { Entity } from '../../types'
import { SearchIcon } from '../Icons'

/**
 * Búsqueda dentro del grafo: encontrar una voz entre miles de nodos sin
 * salir de la vista. Tecla «/» enfoca el input; escribir filtra por
 * nombre (sin acentos); Enter o click selecciona — y la selección ya
 * sabe viajar (cámara en WebGL, panel en SVG). Esc limpia y suelta.
 */

const MAX_RESULTS = 8

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function searchEntities(entities: Entity[], query: string): Entity[] {
  const q = fold(query.trim())
  if (!q) return []
  const starts: Entity[] = []
  const contains: Entity[] = []
  for (const e of entities) {
    const name = fold(e.name)
    if (name.startsWith(q)) starts.push(e)
    else if (name.includes(q)) contains.push(e)
    if (starts.length >= MAX_RESULTS) break
  }
  return [...starts, ...contains].slice(0, MAX_RESULTS)
}

export function GraphSearch({
  entities,
  onSelect,
}: {
  entities: Entity[]
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchEntities(entities, query), [entities, query])

  // «/» enfoca la búsqueda desde cualquier punto del grafo (si no estás
  // ya escribiendo en otro campo).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function choose(id: string) {
    onSelect(id)
    setQuery('')
    inputRef.current?.blur()
  }

  return (
    // Sin posicionamiento propio: cuelga bajo las acciones en la columna
    // derecha del raíl superior de `GraphChrome`. Repone `pointer-events-auto`
    // porque ese raíl es transparente al puntero.
    <div className="pointer-events-auto w-56">
      <div className="flex items-center gap-1.5 rounded-full border border-ink-100/70 bg-paper-50/90 px-2.5 py-1 shadow-sm backdrop-blur-sm focus-ring-within">
        <SearchIcon size={12} className="shrink-0 text-ink-300" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) choose(results[0].id)
            if (e.key === 'Escape') {
              setQuery('')
              inputRef.current?.blur()
            }
          }}
          placeholder="buscar nodo · /"
          aria-label="Buscar nodo en el grafo"
          // focus-ring-exempt: el wrapper muestra el foco vía el token .focus-ring-within
          className="w-full bg-transparent text-caption text-ink-700 placeholder:text-ink-300 focus:outline-none"
        />
      </div>
      {results.length > 0 && (
        <ul
          aria-label="Resultados"
          className="mt-1.5 overflow-hidden rounded-lg border border-ink-100/70 bg-paper-50/95 shadow-md shadow-ink-900/10 backdrop-blur-sm"
        >
          {results.map((e, i) => (
            <li key={e.id}>
              <button
                onClick={() => choose(e.id)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-caption transition-colors hover:bg-ink-100/50 ${
                  i === 0 ? 'text-ink-800' : 'text-ink-600'
                }`}
              >
                <span className="truncate">{e.name}</span>
                <span className="ml-auto shrink-0 text-micro uppercase tracking-wider text-ink-300">
                  {e.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
