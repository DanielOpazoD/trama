import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useNotasFeed,
  useNotesQuery,
  useUpdateNote,
  useDeleteNote,
  usePromoteNote,
  useUpdateRecorte,
  useDeleteRecorte,
  useToast,
} from '../../state'
import type { Recorte, RecorteTarget } from '../../api'
import { useRecorteThumbSize } from '../../hooks/useRecorteThumbSize'
import { useRecorteFeedView } from '../../hooks/useRecorteFeedView'
import { ViewHeader } from '../ViewHeader'
import { RecorteSelectionBar } from '../recortes/RecorteSelectionBar'
import { CapturasGalleryGrid } from '../recortes/CapturasGalleryGrid'
import { PromoteModal, type PromoteSeed } from '../recortes/PromoteModal'
import { FavoritosPanel } from '../recortes/FavoritosPanel'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { useFeedKeyboardNav } from '../../hooks/useFeedKeyboardNav'
import { useMainScrollVirtualizer } from '../../hooks/useMainScrollVirtualizer'
import { NotasFeedContent } from './NotasFeedContent'
import { NotasFeedControls } from './NotasFeedControls'
import { NotasFeedComposer } from './NotasFeedComposer'
import { NotasFeedVirtualList } from './NotasFeedVirtualList'
import { useMeasuredVirtualFeed } from './useMeasuredVirtualFeed'
import { useNotasComposer } from './useNotasComposer'
import {
  buildAllNoteTags,
  buildCalendarStats,
  buildNotasFeedFilter,
  buildTagCounts,
  getInitialNotasFeedSegment,
  hasNotasFeedContentFilter,
  isNotasFeedEverythingEmpty,
  isNotasFeedGalleryMode,
  selectedRecortesFromItems,
  type NotasFeedSegment,
  type RecorteStatusFilter,
} from './notasFeedViewModel'

// Lazy: la escritura enfocada (overlay fullscreen) se baja solo al abrirla.
const FocusedWriting = lazy(() =>
  import('./FocusedWriting').then((m) => ({ default: m.FocusedWriting })),
)

const ACCENT = 'var(--accent-sage)'

/**
 * Feed unificado de capturas (fusión Notas + Recortes). La sección "notas" del
 * mundo Notas muestra notas escritas, recortes (texto · imagen · enlace) y
 * favoritos juntos. El chrome es deliberadamente compacto: header → composer →
 * una sola fila de tabs (con lupa + calendario como íconos a la derecha) →
 * contenido. Todo lo demás es on-demand:
 *   - el buscador se expande desde el ícono de lupa (con etiquetas sugeridas);
 *   - el calendario de actividad se muestra/oculta con el ícono de calendario;
 *   - el filtro de estado de Capturas es un control secundario discreto.
 *
 * La vista depende SOLO de la costura `useNotasFeed` (nunca de los dos hooks de
 * query crudos por separado): así la UI nunca ramifica nota-vs-recorte ad hoc.
 *
 * La lógica de captura del composer (nota · enlace · imagen, con sus mutaciones
 * y heurísticas) vive en `useNotasComposer`. Esta vista orquesta filtros, feed,
 * virtualización y el triage de recortes (promover / archivar / eliminar +
 * PromoteModal).
 */
export function NotasFeedView({
  onSendImagesToPdf,
}: {
  onSendImagesToPdf?: (selected: Recorte[]) => void
}) {
  const toast = useToast()
  const reducedMotion = usePrefersReducedMotion()

  // --- Composer (captura unificada: nota · enlace · imagen) ---------------
  // Todo el estado y la lógica de captura viven en el hook; la vista solo
  // cablea sus valores al pie de captura y al overlay de escritura enfocada.
  const composer = useNotasComposer()

  // --- Filtro del feed ----------------------------------------------------
  const [segment, setSegment] = useState<NotasFeedSegment>(getInitialNotasFeedSegment)
  const [search, setSearch] = useState('')
  // El buscador es on-demand: arranca cerrado y se expande desde la lupa.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // Día seleccionado en el calendario de actividad ('YYYY-MM-DD'), o null.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // El calendario de actividad (heatmap) es on-demand: oculto por defecto.
  const [calendarOpen, setCalendarOpen] = useState(false)
  // Triage de recortes (solo activo en el segmento Capturas). Por defecto
  // muestra las pendientes — el primer estado que pide atención del usuario.
  const [capturaStatus, setCapturaStatus] = useState<RecorteStatusFilter>('pending')
  // Tamaño de las miniaturas de imagen de las capturas, persistido.
  const [recorteThumb, setRecorteThumb] = useRecorteThumbSize()
  // Modo de vista del feed: lista (hilo) o galería (grilla de imágenes).
  const [feedView, setFeedView] = useRecorteFeedView()
  // Triage en lote: modo selección + ids elegidos (solo en el segmento Capturas).
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filter = useMemo(
    () =>
      buildNotasFeedFilter({
        segment,
        search,
        activeTag,
        selectedDay,
        capturaStatus,
      }),
    [segment, search, activeTag, selectedDay, capturaStatus],
  )

  const { items, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotasFeed(filter)

  // --- Triage en lote -----------------------------------------------------
  // Las capturas elegidas, resueltas desde los ítems cargados del feed.
  const selectedRecortes = useMemo(
    () => selectedRecortesFromItems(items, selectedIds),
    [items, selectedIds],
  )
  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  // Salir del modo selección al cambiar de segmento (solo vive en Capturas).
  useEffect(() => {
    if (segment !== 'capturas') exitSelection()
  }, [segment, exitSelection])
  // Galería: grilla de imágenes en Todo/Capturas. La selección (triage) es una
  // afordancia de la lista, así que al pasar a galería se sale de selección.
  const galleryMode = isNotasFeedGalleryMode({ feedView, segment })
  useEffect(() => {
    if (galleryMode) exitSelection()
  }, [galleryMode, exitSelection])

  // --- Calendario de actividad (heatmap) ----------------------------------
  // El heatmap cuenta SOLO notas (los recortes no contribuyen), así que lee la
  // query cruda de notas en vez del feed mixto de la costura. El feed de la
  // lista sigue fluyendo por `useNotasFeed`.
  const notesQuery = useNotesQuery()
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])
  const { calendarDays, calendarStats } = useMemo(
    () => buildCalendarStats(notes),
    [notes],
  )

  // El universo de tags se calcula sobre TODAS las notas (bounded, client-side)
  // SIN filtrar por etiqueta — así elegir una etiqueta no hace desaparecer las
  // demás de la lista sugerida. Deriva de `useNotesQuery` (la fuente del
  // calendario), que ya es la colección completa de notas. Las etiquetas solo
  // existen en notas, así que el segmento "capturas" no aporta tags.
  const tagCounts = useMemo(() => {
    return buildTagCounts(notes, { segment, search })
  }, [notes, segment, search])
  // Lista plana de etiquetas para el autocompletar `#` del composer (todo el
  // universo de notas, no el filtrado por segmento/búsqueda).
  const allNoteTags = useMemo(() => {
    return buildAllNoteTags(notes)
  }, [notes])

  // ¿Hay algún filtro activo (más allá del segmento)?
  const hasContentFilter = hasNotasFeedContentFilter({
    search,
    activeTag,
    selectedDay,
  })
  // ¿El feed está realmente vacío de datos, o solo filtrado a cero? Con el feed
  // paginado server-side, "vacío de verdad" = sin filtros activos, sin estado
  // de triage restringido y la primera página llegó vacía sin más por traer.
  const everythingEmpty = isNotasFeedEverythingEmpty({
    isLoading,
    hasContentFilter,
    itemCount: items.length,
    hasNextPage: !!hasNextPage,
    segment,
    capturaStatus,
  })

  // --- Triage de recortes (mutaciones propias + PromoteModal) -------------
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

  /** Abre el buscador y enfoca el input (afordancia on-demand de la lupa / `/`). */
  const openSearch = useCallback(() => {
    setSearchOpen(true)
    // El input se monta en este render; lo enfocamos tras el commit.
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])

  /** Cierra el buscador y limpia la búsqueda y el filtro de etiqueta. */
  function closeSearch() {
    setSearchOpen(false)
    setSearch('')
    setActiveTag(null)
  }

  // --- Navegación por teclado scopeada al feed ----------------------------
  // n → composer · / → buscador · j/k → seleccionar tarjeta · Enter → activar.
  // El feed solo está "activo" fuera de Favoritos (que es otro panel).
  const navEnabled = segment !== 'favoritos'
  const { selected, setSelected } = useFeedKeyboardNav({
    enabled: navEnabled,
    itemCount: items.length,
    onFocusComposer: composer.focusComposer,
    onOpenSearch: openSearch,
  })

  // --- Virtualización de la lista -----------------------------------------
  // El feed puede ser largo (notas + recortes de meses) y pagina server-side:
  // montamos solo la ventana visible + overscan. `measureElement` corrige la
  // altura real de cada tarjeta (las notas se expanden, los recortes varían).
  // Las tarjetas viven en el scroller principal (#main-scroll), así que usamos
  // el virtualizer atado a él (mismo patrón que Citas/Entidades). El estimate
  // inicial es generoso (tarjeta típica ~200px) para que el salto al medir sea
  // mínimo.
  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: items.length,
    estimateSize: 200,
    overscan: 6,
    deps: [segment, searchOpen, calendarOpen, capturaStatus, recorteThumb, items.length],
  })
  const virtualItems = virtualizer.getVirtualItems()
  useMeasuredVirtualFeed({ items, recorteThumb, virtualizer })

  // Carga incremental: cuando la ventana visible llega a los últimos ítems,
  // pedimos la próxima página. Leemos el índice virtual más alto (atado al
  // estado del virtualizer) en vez de un sentinel suelto.
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    if (items.length === 0) return
    if (lastVisibleIndex >= items.length - 5) fetchNextPage()
  }, [lastVisibleIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Scroll la tarjeta seleccionada a la vista al moverse con j/k. Con la lista
  // virtualizada, la tarjeta puede no estar montada: pedimos al virtualizer que
  // la traiga a la ventana (monta + scrollea) en lugar de un scrollIntoView que
  // fallaría sobre un ref nulo.
  useEffect(() => {
    if (selected === null) return
    virtualizer.scrollToIndex(selected, {
      align: 'auto',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [selected, reducedMotion, virtualizer])

  return (
    <>
      <ViewHeader
        title="Notas"
        eyebrow="notas y capturas"
        accent={ACCENT}
        subtitle="Tus apuntes y tus recortes en un solo hilo. Escribe una nota o filtra por lo que buscas."
      />

      {/* Composer (captura unificada: nota · enlace · imagen). Pegar o soltar
          una imagen la guarda como recorte; pegar solo un enlace ofrece
          guardarlo como recorte web. El texto plano sigue siendo una nota. */}
      {segment !== 'favoritos' && (
        <NotasFeedComposer
          accent={ACCENT}
          title={composer.title}
          draft={composer.draft}
          pendingFiles={composer.pendingFiles}
          allNoteTags={allNoteTags}
          textareaRef={composer.composerRef}
          dragging={composer.dragging}
          composerFocused={composer.composerFocused}
          composerActive={composer.composerActive}
          isLinkDraft={composer.isLinkDraft}
          justSaved={composer.justSaved}
          createNoteBusy={composer.createNoteBusy}
          uploadAttachmentBusy={composer.uploadAttachmentBusy}
          createRecorteBusy={composer.createRecorteBusy}
          onTitleChange={composer.setTitle}
          onDraftChange={composer.setDraft}
          onPendingFilesChange={composer.setPendingFiles}
          onComposerFocus={() => composer.setComposerFocused(true)}
          onComposerBlur={() => composer.setComposerFocused(false)}
          onComposerDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              composer.setDragging(true)
            }
          }}
          onComposerDragLeave={() => composer.setDragging(false)}
          onComposerDrop={composer.onComposerDrop}
          onComposerPaste={composer.onComposerPaste}
          onComposerKeyDown={composer.onComposerKey}
          onCaptureMediaInput={composer.onCaptureMediaInput}
          onRequestFocusMode={() => composer.setFocusMode(true)}
          onForceNote={() => composer.setForceNote(true)}
          onSave={composer.save}
        />
      )}

      <NotasFeedControls
        accent={ACCENT}
        segment={segment}
        search={search}
        searchOpen={searchOpen}
        searchInputRef={searchRef}
        activeTag={activeTag}
        tagCounts={tagCounts}
        calendarOpen={calendarOpen}
        calendarDays={calendarDays}
        calendarStats={calendarStats}
        selectedDay={selectedDay}
        capturaStatus={capturaStatus}
        recorteThumb={recorteThumb}
        feedView={feedView}
        itemCount={items.length}
        galleryMode={galleryMode}
        selectionMode={selectionMode}
        onSegmentChange={setSegment}
        onOpenSearch={openSearch}
        onCloseSearch={closeSearch}
        onSearchChange={setSearch}
        onActiveTagChange={setActiveTag}
        onToggleCalendar={() => setCalendarOpen((v) => !v)}
        onSelectDay={setSelectedDay}
        onCapturaStatusChange={setCapturaStatus}
        onRecorteThumbChange={setRecorteThumb}
        onFeedViewChange={setFeedView}
        onToggleSelection={() =>
          selectionMode ? exitSelection() : setSelectionMode(true)
        }
      />

      <NotasFeedContent
        segment={segment}
        uploadingImages={composer.uploadingImages}
        isLoading={isLoading}
        isError={isError}
        everythingEmpty={everythingEmpty}
        itemCount={items.length}
        hasContentFilter={hasContentFilter}
        galleryMode={galleryMode}
        isFetchingNextPage={isFetchingNextPage}
        onFocusComposer={composer.focusComposer}
        onClearFilters={clearFilters}
        favoritosPanel={<FavoritosPanel />}
        gallery={
          <CapturasGalleryGrid
            items={items}
            size={recorteThumb}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        }
        list={
          <NotasFeedVirtualList
            listRef={listRef}
            items={items}
            virtualItems={virtualItems}
            virtualizer={virtualizer}
            selectedIndex={selected}
            reducedMotion={reducedMotion}
            recorteThumb={recorteThumb}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            noteBusy={updateNote.isPending || deleteNote.isPending}
            promotingNoteId={
              promoteNote.isPending
                ? (promoteNote.variables as string | undefined)
                : undefined
            }
            onSelectIndex={setSelected}
            onToggleNotePin={(note) =>
              updateNote.mutate({
                id: note.id,
                patch: { pinned: !note.pinned },
              })
            }
            onEditNote={(id, patch) => updateNote.mutate({ id, patch })}
            onDeleteNote={(id) => deleteNote.mutate(id)}
            onPromoteNote={(id) =>
              promoteNote.mutate(id, {
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
            onToggleRecorteSelect={toggleSelect}
            onPromoteRecorte={(recorte, target, seed) =>
              setPromoting({ recorte, target, seed })
            }
            onArchiveRecorte={(id) =>
              updateRecorte.mutate({ id, patch: { status: 'archived' } })
            }
            onRestoreRecorte={(id) =>
              updateRecorte.mutate({ id, patch: { status: 'pending' } })
            }
            onDeleteRecorte={(id) => deleteRecorte.mutate(id)}
            onSendImagesToPdf={onSendImagesToPdf}
          />
        }
      />

      {/* Modal de promoción de recorte (triage completa) */}
      {promoting && (
        <PromoteModal
          recorte={promoting.recorte}
          target={promoting.target}
          seed={promoting.seed}
          onClose={() => setPromoting(null)}
        />
      )}

      {segment === 'capturas' && selectionMode && (
        <RecorteSelectionBar
          selected={selectedRecortes}
          onClear={exitSelection}
          onDone={exitSelection}
          onSendImagesToPdf={onSendImagesToPdf}
        />
      )}

      {/* Escritura enfocada del composer: edita el MISMO borrador (draft/title). */}
      {composer.focusMode && (
        <Suspense fallback={null}>
          <FocusedWriting
            value={composer.draft}
            onChange={composer.setDraft}
            title={composer.title}
            onTitleChange={composer.setTitle}
            bodyPlaceholder="Escribe tu nota sin distracciones… usa #etiquetas"
            onClose={() => composer.setFocusMode(false)}
          />
        </Suspense>
      )}
    </>
  )
}
