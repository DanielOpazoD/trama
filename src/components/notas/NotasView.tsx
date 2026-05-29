import { useMemo, useState } from 'react'
import { useNotesQuery, useCreateNote, useUpdateNote, useDeleteNote } from '../../state'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { SearchIcon } from '../Icons'
import { NoteCard } from './NoteCard'

const ACCENT = 'var(--accent-sage)'

/**
 * τ-worlds Fase 2: la sección Notas de Trama Notas. Captura rápida (markdown
 * con #tags), línea de tiempo, buscador y filtro por etiqueta. El buscado y el
 * filtro son client-side sobre las notas ya cargadas — instantáneos, scope
 * acotado a las notas (no toca el mapa).
 */
export function NotasView() {
  const notesQuery = useNotesQuery()
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()

  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Estable entre renders (el `?? []` por sí solo crearía un array nuevo cada
  // vez y dispararía los useMemo de abajo).
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])

  // Universo de tags (únicos), ordenados alfabéticamente.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) for (const t of n.tags) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [notes])

  // Filtro client-side: texto + etiqueta activa.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => {
      if (activeTag && !n.tags.includes(activeTag)) return false
      if (q && !n.content.toLowerCase().includes(q)) return false
      return true
    })
  }, [notes, search, activeTag])

  function save() {
    const content = draft.trim()
    if (!content || createNote.isPending) return
    createNote.mutate(content, { onSuccess: () => setDraft('') })
  }

  function onComposerKey(e: React.KeyboardEvent) {
    // ⌘/Ctrl + Enter guarda (como en chat/markdown editors).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return (
    <>
      <ViewHeader
        title="Notas"
        eyebrow="apuntes rápidos"
        accent={ACCENT}
        spacing="wide"
        subtitle="Pensamientos a medio cocinar, citas sueltas e ideas — en una línea de tiempo, con #etiquetas."
      />

      {/* Composer */}
      <div className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          rows={3}
          placeholder="Escribe una nota… usa #etiquetas para clasificarla"
          className="w-full resize-y bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none leading-relaxed"
        />
        <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-ink-100/60">
          <span className="text-micro text-ink-300">
            <kbd className="font-mono">⌘↵</kbd> para guardar
          </span>
          <button
            onClick={save}
            disabled={!draft.trim() || createNote.isPending}
            className="btn-ink text-xs disabled:opacity-40"
          >
            {createNote.isPending ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      </div>

      {/* Buscador + chips de etiqueta — sólo si ya hay notas */}
      {notes.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-paper-50 border border-ink-100/60 rounded-md">
            <SearchIcon size={13} className="text-ink-300 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en tus notas…"
              className="flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
                className="text-ink-300 hover:text-ink-700 text-caption"
              >
                ✕
              </button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTag(null)}
                className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors ${
                  activeTag === null
                    ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                    : 'border-ink-100 text-ink-400 hover:text-ink-700'
                }`}
              >
                todas
              </button>
              {allTags.map((t) => {
                const on = activeTag === t
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTag(on ? null : t)}
                    className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors"
                    style={
                      on
                        ? {
                            borderColor: ACCENT,
                            color: ACCENT,
                            background: 'var(--accent-sage-soft, transparent)',
                          }
                        : undefined
                    }
                  >
                    #{t}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lista / estados */}
      {notesQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando notas" size="sm" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Tu primer apunte, todavía sin escribir."
          body={
            <>
              Escribe arriba una nota corta — una idea, una frase, un pendiente mental.
              Con <strong>#etiquetas</strong> las vas a poder filtrar y buscar acá mismo.
            </>
          }
          hint="Markdown y #etiquetas; ⌘↵ para guardar rápido."
        />
      ) : filtered.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Nada coincide con eso."
          body={<>Prueba con otra palabra o quita el filtro de etiqueta.</>}
          hint={
            <button
              onClick={() => {
                setSearch('')
                setActiveTag(null)
              }}
              className="underline hover:text-ink-700 transition-colors"
            >
              Ver todas
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              busy={updateNote.isPending || deleteNote.isPending}
              onTogglePin={() =>
                updateNote.mutate({ id: note.id, patch: { pinned: !note.pinned } })
              }
              onDelete={() => deleteNote.mutate(note.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}
