import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryItem, LibraryLinkTargetKind } from '../../types/biblioteca'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useAddLibraryItemLink } from '../../state'
import { entitiesApi } from '../../api/entities'
import { notesApi } from '../../api/notes'
import { momentosApi } from '../../api/momentos'
import { SearchIcon } from '../Icons'
import { CloseButton } from '../CloseButton'
import { LinkTargetIcon } from './LinkTargetIcon'

/**
 * Picker de conexiones (PR-C): un modal sobre papel para vincular el archivo a
 * un objeto de dominio (entidad / nota / momento).
 *
 *   - Control segmentado `[Entidad | Nota | Momento]` arriba.
 *   - Búsqueda con debounce (~250 ms) que consulta el candidato del tipo activo
 *     (lookup de entidades por prefijo; lista de notas por texto; momentos
 *     recientes filtrados en cliente — la API de momentos no toma texto).
 *   - Resultados como filas clickeables; al elegir, `useAddLibraryItemLink`
 *     crea el vínculo y cerramos. Los ya vinculados (`linkedKeys`) se omiten.
 *
 * Escape / clic en el fondo cierran (vía `useModalOverlay`).
 */

type Candidate = { id: string; title: string }

const SEGMENTS: ReadonlyArray<{ value: LibraryLinkTargetKind; label: string }> = [
  { value: 'entidad', label: 'Entidad' },
  { value: 'nota', label: 'Nota' },
  { value: 'momento', label: 'Momento' },
]

/** Texto legible de una nota para el picker (título o 1ª línea acotada). */
function noteTitle(note: { title: string | null; content: string }): string {
  const title = note.title?.trim()
  if (title) return title
  const firstLine = note.content.split('\n', 1)[0]?.trim() ?? ''
  if (!firstLine) return '(sin título)'
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
}

/** Texto legible de un momento para el picker (título/caption/cuerpo/nota). */
function momentoTitle(payload: Record<string, unknown>, note?: string): string {
  const candidate =
    (typeof payload.title === 'string' && payload.title) ||
    (typeof payload.caption === 'string' && payload.caption) ||
    (typeof payload.bodyText === 'string' && payload.bodyText) ||
    (note ?? '') ||
    ''
  const trimmed = candidate.trim()
  if (!trimmed) return 'Momento'
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

/** Consulta candidatos del tipo dado para el texto `q`. */
async function fetchCandidates(
  kind: LibraryLinkTargetKind,
  q: string,
): Promise<Candidate[]> {
  if (kind === 'entidad') {
    const entities = await entitiesApi.lookupEntitiesByPrefix(q)
    return entities.map((e) => ({ id: e.id, title: e.name }))
  }
  if (kind === 'nota') {
    const notes = await notesApi.list({ q })
    const folded = q.trim().toLowerCase()
    return notes
      .filter(
        (n) => !folded || `${n.title ?? ''} ${n.content}`.toLowerCase().includes(folded),
      )
      .slice(0, 12)
      .map((n) => ({ id: n.id, title: noteTitle(n) }))
  }
  // Momentos: la API no acepta texto; traemos los recientes y filtramos en cliente.
  const { items } = await momentosApi.listMomentos({ limit: 30 })
  const folded = q.trim().toLowerCase()
  return items
    .map((m) => ({
      id: m.id,
      title: momentoTitle(m.payload as Record<string, unknown>, m.note),
    }))
    .filter((c) => !folded || c.title.toLowerCase().includes(folded))
    .slice(0, 12)
}

export function BibliotecaLinkPicker({
  item,
  linkedKeys,
  onClose,
}: {
  item: LibraryItem
  /** Claves `${targetKind}:${targetId}` ya vinculadas; se omiten de los resultados. */
  linkedKeys: ReadonlySet<string>
  onClose: () => void
}) {
  const overlay = useModalOverlay({ open: true, onClose, lockScroll: true })
  const addLink = useAddLibraryItemLink()
  const [kind, setKind] = useState<LibraryLinkTargetKind>('entidad')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce ~250 ms del texto antes de disparar la búsqueda.
  const debounceRef = useRef<number | null>(null)
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  // Busca cuando cambia el texto debounced o el tipo. Ignora respuestas viejas.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCandidates(kind, debounced)
      .then((found) => {
        if (!cancelled) setResults(found)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, debounced])

  // Omitimos los destinos ya vinculados (no se puede conectar dos veces).
  const visible = useMemo(
    () => results.filter((c) => !linkedKeys.has(`${kind}:${c.id}`)),
    [results, kind, linkedKeys],
  )

  function handlePick(candidate: Candidate) {
    addLink.mutate(
      {
        kind: item.kind,
        itemId: item.itemId,
        targetKind: kind,
        targetId: candidate.id,
      },
      { onSuccess: () => onClose() },
    )
  }

  return createPortal(
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
        className="fixed inset-0 z-[110] cursor-default bg-ink-900/40 animate-fade-up motion-reduce:animate-none"
      />
      <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-[12vh] pointer-events-none">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Conectar archivo"
          className="pointer-events-auto w-full max-w-md paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 animate-fade-up motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
            <h2 className="section-eyebrow text-ink-500">Conectar con…</h2>
            <CloseButton
              onClick={onClose}
              size={16}
              className="touch-target -mr-1.5 inline-flex size-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            />
          </div>

          {/* Control segmentado de tipo de destino. */}
          <div
            role="tablist"
            aria-label="Tipo de conexión"
            className="mx-4 mb-3 flex rounded-lg bg-ink-100/50 p-0.5"
          >
            {SEGMENTS.map((seg) => {
              const active = seg.value === kind
              return (
                <button
                  key={seg.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setKind(seg.value)}
                  className={`flex-1 rounded-md px-2 py-1 text-caption font-medium transition-colors ${
                    active
                      ? 'bg-paper-50 text-ink-800 shadow-sm'
                      : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  {seg.label}
                </button>
              )
            })}
          </div>

          {/* Buscador. */}
          <div className="px-4">
            <label className="input-paper flex items-center gap-2 py-1.5">
              <SearchIcon size={14} className="shrink-0 text-ink-300" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar destino"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-ink-700 placeholder:text-ink-300 focus:outline-none"
              />
            </label>
          </div>

          {/* Resultados. */}
          <div className="max-h-72 overflow-y-auto p-2">
            {loading ? (
              <p className="px-2 py-6 text-center text-caption text-ink-400">Buscando…</p>
            ) : visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-caption text-ink-400">
                {debounced
                  ? 'Sin resultados.'
                  : 'Escribe para buscar, o explora los más recientes.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visible.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(candidate)}
                      disabled={addLink.isPending}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-100/60 disabled:opacity-50"
                    >
                      <LinkTargetIcon
                        kind={kind}
                        size={15}
                        className="shrink-0 text-ink-400"
                      />
                      <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
