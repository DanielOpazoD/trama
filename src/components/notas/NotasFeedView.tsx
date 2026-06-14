import { useMemo, useState } from 'react'
import {
  useNotasFeed,
  useNotesQuery,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  usePromoteNote,
  useUploadNotasAttachment,
  useUpdateRecorte,
  useDeleteRecorte,
  useToast,
  type NotasFeedSegment,
} from '../../state'
import type { Recorte, RecorteTarget } from '../../api'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { SearchIcon } from '../Icons'
import { ViewHeader } from '../ViewHeader'
import { NoteCard } from './NoteCard'
import { ActivityCalendar, localDayKey } from './ActivityCalendar'
import { RecorteCard } from '../recortes/RecorteCard'
import { PromoteModal, type PromoteSeed } from '../recortes/PromoteModal'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { PendingAttachmentsInput } from './PendingAttachmentsInput'

const ACCENT = 'var(--accent-sage)'

const SEGMENTS: Array<{ value: NotasFeedSegment; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'escritas', label: 'Escritas' },
  { value: 'capturas', label: 'Capturas' },
]

/**
 * Feed unificado de capturas (PR-2 de la fusión Notas + Recortes). La sección
 * "notas" del mundo Notas dejó de ser solo notas: muestra notas y recortes
 * juntos, ordenados por fecha, con un control segmentado (Todo / Escritas /
 * Capturas), buscador y filtro por etiqueta.
 *
 * La vista depende SOLO de la costura `useNotasFeed` (nunca de los dos hooks de
 * query crudos por separado): así la UI nunca ramifica nota-vs-recorte ad hoc.
 * Cada ítem del feed es un `CaptureItem` discriminado por `type`, y según el
 * tipo se renderiza `<NoteCard>` o `<RecorteCard>` con sus handlers existentes.
 *
 * La creación de notas (composer) se conserva igual que antes. La triage de
 * recortes (promover / archivar / eliminar) se cablea completa reusando el
 * patrón de RecortesView (mutaciones + PromoteModal).
 */
export function NotasFeedView() {
  // --- Composer (creación de notas, idéntico a NotasView) -----------------
  const createNote = useCreateNote()
  const uploadAttachment = useUploadNotasAttachment()
  const toast = useToast()

  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const composerRef = useAutosizeTextarea(draft, { minRows: 3, maxRows: 12 })
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // --- Filtro del feed ----------------------------------------------------
  const [segment, setSegment] = useState<NotasFeedSegment>('todo')
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // Día seleccionado en el calendario de actividad ('YYYY-MM-DD'), o null.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const filter = useMemo(
    () => ({
      segment,
      query: search.trim() || undefined,
      tag: activeTag ?? undefined,
      day: selectedDay,
    }),
    [segment, search, activeTag, selectedDay],
  )

  const { items, isLoading, isError } = useNotasFeed(filter)

  // --- Calendario de actividad (heatmap) ----------------------------------
  // El heatmap cuenta SOLO notas (los recortes no contribuyen), así que lee la
  // query cruda de notas en vez del feed mixto de la costura. El feed de la
  // lista sigue fluyendo por `useNotasFeed`.
  const notesQuery = useNotesQuery()
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])
  const calendarDays = useMemo(() => notes.map((n) => localDayKey(n.createdAt)), [notes])
  const calendarStats = useMemo(() => {
    const days = new Set(calendarDays).size
    const tagSet = new Set<string>()
    for (const n of notes) for (const t of n.tags) tagSet.add(t)
    return [
      { n: notes.length, label: notes.length === 1 ? 'nota' : 'notas' },
      { n: days, label: days === 1 ? 'día con notas' : 'días con notas' },
      { n: tagSet.size, label: tagSet.size === 1 ? 'etiqueta' : 'etiquetas' },
    ]
  }, [notes, calendarDays])

  // El universo de tags se calcula sobre el feed SIN filtrar por etiqueta (para
  // que elegir una etiqueta no haga desaparecer las demás del chip-bar). Reusa
  // el feed de la costura para no tocar los hooks crudos.
  const tagUniverse = useNotasFeed(
    useMemo(() => ({ segment, query: search.trim() || undefined }), [segment, search]),
  )
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of tagUniverse.items) {
      if (it.type !== 'note') continue
      for (const t of it.note.tags) m.set(t, (m.get(t) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tagUniverse.items])

  // ¿Hay algún filtro activo (más allá del segmento)?
  const hasContentFilter =
    search.trim() !== '' || activeTag !== null || selectedDay !== null
  // ¿El feed está realmente vacío de datos, o solo filtrado a cero?
  const everythingEmpty =
    !isLoading && tagUniverse.items.length === 0 && !hasContentFilter

  // --- Triage de recortes (reusa el patrón de RecortesView) ---------------
  const updateRecorte = useUpdateRecorte()
  const deleteRecorte = useDeleteRecorte()
  const [promoting, setPromoting] = useState<{
    recorte: Recorte
    target: RecorteTarget
    seed?: PromoteSeed
  } | null>(null)

  // --- Mutaciones de notas ------------------------------------------------
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const promoteNote = usePromoteNote()

  function clearFilters() {
    setSearch('')
    setActiveTag(null)
    setSelectedDay(null)
  }

  function save() {
    const content = draft.trim()
    if (!content || createNote.isPending) return
    const files = pendingFiles
    createNote.mutate(
      { content, title: title.trim() || null },
      {
        onSuccess: async (note) => {
          setDraft('')
          setTitle('')
          setPendingFiles([])
          if (files.length === 0) return
          try {
            await Promise.all(
              files.map((file) =>
                uploadAttachment.mutateAsync({
                  ownerType: 'note',
                  ownerId: note.id,
                  file,
                }),
              ),
            )
            toast.show({ message: 'Nota y anexos guardados.', tone: 'success' })
          } catch (err) {
            toast.show({
              message:
                err instanceof Error
                  ? err.message
                  : 'La nota se guardó, pero algún anexo falló.',
              tone: 'error',
            })
          }
        },
      },
    )
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
        eyebrow="notas y capturas"
        accent={ACCENT}
        subtitle="Tus apuntes y tus recortes en un solo hilo. Escribe una nota o filtra por lo que buscas."
      />

      {/* Calendario de actividad (heatmap) — siempre arriba del feed, en todos
          los segmentos. Cuenta solo notas; el clic en un día filtra el feed
          unificado (notas y recortes) por esa fecha. */}
      <ActivityCalendar
        dayKeys={calendarDays}
        stats={calendarStats}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {/* Composer (creación de notas) */}
      <div className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Enter en el título salta al cuerpo; ⌘↵ guarda (vía onComposerKey).
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
              e.preventDefault()
              composerRef.current?.focus()
              return
            }
            onComposerKey(e)
          }}
          maxLength={200}
          placeholder="Título (opcional)"
          aria-label="Título de la nota (opcional)"
          className="w-full bg-transparent font-serif text-lead text-ink-800 placeholder:font-sans placeholder:not-italic placeholder:text-ink-300 mb-1"
        />
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          rows={3}
          placeholder="Escribe una nota… usa #etiquetas para clasificarla"
          className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed"
        />
        <PendingAttachmentsInput
          files={pendingFiles}
          onChange={setPendingFiles}
          busy={createNote.isPending || uploadAttachment.isPending}
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

      {/* Control segmentado: Todo · Escritas · Capturas */}
      <div
        role="tablist"
        aria-label="Filtrar el feed"
        className="mb-4 inline-flex rounded-lg border border-ink-100/70 bg-paper-50 p-0.5"
      >
        {SEGMENTS.map(({ value, label }) => {
          const on = segment === value
          return (
            <button
              key={value}
              role="tab"
              aria-selected={on}
              onClick={() => setSegment(value)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                on
                  ? 'bg-ink-800 text-paper-50'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/60'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Buscador + chips de etiqueta */}
      <div className="mb-5 space-y-2.5">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-paper-50 border border-ink-100/60 rounded-md">
          <SearchIcon size={12} className="text-ink-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en notas y capturas…"
            aria-label="Buscar en notas y capturas"
            className="flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300"
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
        {tagCounts.length > 0 && (
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
            {tagCounts.map(([t, count]) => {
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
                  #{t} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Feed / estados */}
      {isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando" size="sm" />
        </div>
      ) : isError ? (
        <EmptyMessage
          illustration="thread"
          title="No pudimos cargar tus notas y capturas."
          body={<>Vuelve a intentarlo en unos segundos.</>}
        />
      ) : everythingEmpty ? (
        <EmptyMessage
          illustration="thread"
          title="Tu primer apunte, todavía sin escribir."
          body={<>Un apunte breve alcanza. Tus recortes también aparecerán aquí.</>}
          action={
            <button
              type="button"
              onClick={() => composerRef.current?.focus()}
              className="btn-ink min-h-[44px] px-4 text-xs"
            >
              Escribir primera nota
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Nada coincide con eso."
          body={<>Prueba con otra palabra, otra etiqueta u otro segmento.</>}
          hint={
            hasContentFilter ? (
              <button
                onClick={clearFilters}
                className="underline hover:text-ink-700 transition-colors"
              >
                Ver todo
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) =>
            item.type === 'note' ? (
              <NoteCard
                key={`note-${item.id}`}
                note={item.note}
                busy={updateNote.isPending || deleteNote.isPending}
                promoting={promoteNote.isPending && promoteNote.variables === item.id}
                onTogglePin={() =>
                  updateNote.mutate({
                    id: item.id,
                    patch: { pinned: !item.note.pinned },
                  })
                }
                onEdit={(patch) => updateNote.mutate({ id: item.id, patch })}
                onDelete={() => deleteNote.mutate(item.id)}
                onPromote={() =>
                  promoteNote.mutate(item.id, {
                    onSuccess: () =>
                      toast.show({
                        message: 'Nota promovida a Momento.',
                        tone: 'success',
                      }),
                    onError: (e) =>
                      toast.show({
                        message: e instanceof Error ? e.message : 'No se pudo promover',
                        tone: 'error',
                      }),
                  })
                }
              />
            ) : (
              <ul key={`recorte-${item.id}`} className="contents">
                <RecorteCard
                  recorte={item.recorte}
                  onPromote={(recorte, target, seed) =>
                    setPromoting({ recorte, target, seed })
                  }
                  onArchive={() =>
                    updateRecorte.mutate({
                      id: item.id,
                      patch: { status: 'archived' },
                    })
                  }
                  onRestore={() =>
                    updateRecorte.mutate({ id: item.id, patch: { status: 'pending' } })
                  }
                  onDelete={() => deleteRecorte.mutate(item.id)}
                />
              </ul>
            ),
          )}
        </div>
      )}

      {/* Modal de promoción de recorte (triage completa) */}
      {promoting && (
        <PromoteModal
          recorte={promoting.recorte}
          target={promoting.target}
          seed={promoting.seed}
          onClose={() => setPromoting(null)}
        />
      )}
    </>
  )
}
