import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useNotasFeed,
  useNotesQuery,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  usePromoteNote,
  useUploadNotasAttachment,
  useCreateRecorte,
  useUpdateRecorte,
  useDeleteRecorte,
  useToast,
} from '../../state'
import type { Recorte, RecorteTarget } from '../../api'
import { extractUrl, hostLabel } from '../../lib/captureIntent'
import { useRecorteThumbSize } from '../../hooks/useRecorteThumbSize'
import { useRecorteFeedView } from '../../hooks/useRecorteFeedView'
import { ViewHeader } from '../ViewHeader'
import { RecorteSelectionBar } from '../recortes/RecorteSelectionBar'
import { CapturasGalleryGrid } from '../recortes/CapturasGalleryGrid'
import { PromoteModal, type PromoteSeed } from '../recortes/PromoteModal'
import { FavoritosPanel } from '../recortes/FavoritosPanel'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { useFeedKeyboardNav } from '../../hooks/useFeedKeyboardNav'
import { useMainScrollVirtualizer } from '../../hooks/useMainScrollVirtualizer'
import { NotasFeedContent } from './NotasFeedContent'
import { NotasFeedControls } from './NotasFeedControls'
import { NotasFeedComposer } from './NotasFeedComposer'
import { NotasFeedVirtualList } from './NotasFeedVirtualList'
import { useMeasuredVirtualFeed } from './useMeasuredVirtualFeed'
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
import { compressImage } from '../momentos/helpers'

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
 * La creación de notas (composer) se conserva igual. El triage de recortes
 * (promover / archivar / eliminar) se cablea completo con sus mutaciones propias
 * + PromoteModal.
 */
export function NotasFeedView({
  onSendImagesToPdf,
}: {
  onSendImagesToPdf?: (selected: Recorte[]) => void
}) {
  // --- Composer (captura unificada: nota · enlace · imagen) ---------------
  const createNote = useCreateNote()
  const uploadAttachment = useUploadNotasAttachment()
  const createRecorte = useCreateRecorte()
  const toast = useToast()

  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const composerRef = useAutosizeTextarea(draft, { minRows: 3, maxRows: 12 })
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  // El usuario pegó un enlace solo; el composer ofrece guardarlo como recorte.
  // `forceNote` deja anular esa heurística y guardarlo igual como nota.
  const [forceNote, setForceNote] = useState(false)
  // Resalte del composer mientras se arrastra una imagen encima.
  const [dragging, setDragging] = useState(false)
  // Cuántas imágenes se están subiendo ahora (para tarjetas «subiendo…»).
  const [uploadingImages, setUploadingImages] = useState(0)
  // Foco editorial del composer: ilumina el borde + anillo tintado mientras se
  // escribe, y revela las afordancias del pie (no están siempre a la vista).
  const [composerFocused, setComposerFocused] = useState(false)
  // Escritura enfocada del cuerpo del composer (overlay fullscreen).
  const [focusMode, setFocusMode] = useState(false)
  // Micro-confirmación al guardar una nota: una onda + ✓ silenciosos sobre el
  // botón guardar (check-pop + saved-ripple). La app no celebra; hace lugar.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)

  const reducedMotion = usePrefersReducedMotion()

  // El borrador es un enlace puro (y el usuario no eligió "guardar como nota").
  const linkUrl = forceNote ? null : extractUrl(draft)
  const isLinkDraft = linkUrl !== null

  // El composer está "activo" si tiene foco o algún contenido. Las afordancias
  // del pie (tip de imagen + guardar) solo aparecen entonces — en reposo el
  // composer es una hoja limpia. Con contenido sigue visible aunque pierda el
  // foco, así el click en «guardar» nunca se desmonta antes de registrar.
  const composerActive =
    composerFocused ||
    draft.trim() !== '' ||
    title.trim() !== '' ||
    pendingFiles.length > 0

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
  // demás de la lista sugerida. Antes esto disparaba un segundo feed infinito;
  // ahora deriva de `useNotesQuery` (la fuente del calendario), que ya es la
  // colección completa de notas. Las etiquetas solo existen en notas, así que
  // el segmento "capturas" no aporta tags.
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

  /** Foco al composer (afordancia de teclado `n` + empty state). */
  const focusComposer = useCallback(() => composerRef.current?.focus(), [composerRef])

  // --- Navegación por teclado scopeada al feed ----------------------------
  // n → composer · / → buscador · j/k → seleccionar tarjeta · Enter → activar.
  // El feed solo está "activo" fuera de Favoritos (que es otro panel).
  const navEnabled = segment !== 'favoritos'
  const { selected, setSelected } = useFeedKeyboardNav({
    enabled: navEnabled,
    itemCount: items.length,
    onFocusComposer: focusComposer,
    onOpenSearch: openSearch,
  })

  // --- Virtualización de la lista -----------------------------------------
  // El feed puede ser largo (notas + recortes de meses) y ahora pagina
  // server-side: montamos solo la ventana visible + overscan. `measureElement`
  // corrige la altura real de cada tarjeta (las notas se expanden, los recortes
  // varían). Las tarjetas viven en el scroller principal (#main-scroll), así
  // que usamos el virtualizer atado a él (mismo patrón que Citas/Entidades).
  // El estimate inicial es generoso (tarjeta típica ~200px) para que el salto
  // al medir sea mínimo.
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

  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    }
  }, [])

  /** Dispara la micro-confirmación de guardado (callada). */
  function flashSaved() {
    if (reducedMotion) return
    setJustSaved(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 700)
  }

  /** Guarda el borrador-enlace como recorte web (captura de 1 paso). */
  function saveLink(url: string) {
    if (createRecorte.isPending) return
    createRecorte.mutate(
      { kind: 'link', url, title: title.trim() || hostLabel(url) },
      {
        onSuccess: () => {
          setDraft('')
          setTitle('')
          setForceNote(false)
          flashSaved()
          toast.show({
            message: 'Enlace guardado en tus capturas para curar.',
            tone: 'success',
          })
        },
        onError: (e) =>
          toast.show({
            message: e instanceof Error ? e.message : 'No se pudo guardar el enlace',
            tone: 'error',
          }),
      },
    )
  }

  /** Sube y captura imágenes/videos como recortes visuales.
   *  Las comprime client-side (downscale + JPEG) antes de subir, igual que el
   *  composer de Momentos — evita subir un screenshot de 8 MB tal cual. */
  async function captureMediaFiles(files: File[]) {
    const media = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (media.length === 0) return
    // Mostramos las tarjetas «subiendo…» desde ya (incluye la compresión).
    setUploadingImages((n) => n + media.length)
    let done = 0
    for (const original of media) {
      const isVideo = original.type.startsWith('video/')
      const file = isVideo
        ? original
        : await compressImage(original).catch(() => original)
      createRecorte.mutate(
        { kind: isVideo ? 'video' : 'image', file },
        {
          onSuccess: () => {
            done += 1
            if (done === media.length) {
              toast.show({
                message:
                  media.length === 1
                    ? isVideo
                      ? 'Video guardado en tus capturas.'
                      : 'Imagen guardada en tus capturas.'
                    : `${media.length} archivos guardados en tus capturas.`,
                tone: 'success',
              })
            }
          },
          onError: (e) =>
            toast.show({
              message: e instanceof Error ? e.message : 'No se pudo guardar la imagen',
              tone: 'error',
            }),
          onSettled: () => setUploadingImages((n) => Math.max(0, n - 1)),
        },
      )
    }
  }

  /** Pegar imagen(es) las adjunta a la nota en curso (anexos pendientes), no
   *  las captura como recorte suelto — el pegado acompaña lo que se escribe.
   *  (Soltar una imagen sí crea un recorte; ver onComposerDrop.) */
  function onComposerPaste(e: React.ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (images.length > 0) {
      e.preventDefault()
      setPendingFiles((prev) => [...prev, ...images])
    }
  }

  /** Soltar imágenes sobre el composer las captura como recortes. */
  function onComposerDrop(e: React.DragEvent) {
    const media = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (media.length > 0) {
      e.preventDefault()
      captureMediaFiles(media)
    }
    setDragging(false)
  }

  function onCaptureMediaInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? [])
    if (files.length > 0) void captureMediaFiles(files)
    e.currentTarget.value = ''
  }

  function save() {
    if (isLinkDraft && linkUrl) {
      saveLink(linkUrl)
      return
    }
    const content = draft.trim()
    if (!content || createNote.isPending) return
    const files = pendingFiles
    createNote.mutate(
      { content, title: title.trim() || null },
      {
        onSuccess: async (note) => {
          setDraft('')
          setTitle('')
          setForceNote(false)
          setPendingFiles([])
          flashSaved()
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

      {/* Composer (captura unificada: nota · enlace · imagen). Pegar o soltar
          una imagen la guarda como recorte; pegar solo un enlace ofrece
          guardarlo como recorte web. El texto plano sigue siendo una nota. */}
      {segment !== 'favoritos' && (
        <NotasFeedComposer
          accent={ACCENT}
          title={title}
          draft={draft}
          pendingFiles={pendingFiles}
          allNoteTags={allNoteTags}
          textareaRef={composerRef}
          dragging={dragging}
          composerFocused={composerFocused}
          composerActive={composerActive}
          isLinkDraft={isLinkDraft}
          justSaved={justSaved}
          createNoteBusy={createNote.isPending}
          uploadAttachmentBusy={uploadAttachment.isPending}
          createRecorteBusy={createRecorte.isPending}
          onTitleChange={setTitle}
          onDraftChange={setDraft}
          onPendingFilesChange={setPendingFiles}
          onComposerFocus={() => setComposerFocused(true)}
          onComposerBlur={() => setComposerFocused(false)}
          onComposerDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onComposerDragLeave={() => setDragging(false)}
          onComposerDrop={onComposerDrop}
          onComposerPaste={onComposerPaste}
          onComposerKeyDown={onComposerKey}
          onCaptureMediaInput={onCaptureMediaInput}
          onRequestFocusMode={() => setFocusMode(true)}
          onForceNote={() => setForceNote(true)}
          onSave={save}
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
        uploadingImages={uploadingImages}
        isLoading={isLoading}
        isError={isError}
        everythingEmpty={everythingEmpty}
        itemCount={items.length}
        hasContentFilter={hasContentFilter}
        galleryMode={galleryMode}
        isFetchingNextPage={isFetchingNextPage}
        onFocusComposer={focusComposer}
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
      {focusMode && (
        <Suspense fallback={null}>
          <FocusedWriting
            value={draft}
            onChange={setDraft}
            title={title}
            onTitleChange={setTitle}
            bodyPlaceholder="Escribe tu nota sin distracciones… usa #etiquetas"
            onClose={() => setFocusMode(false)}
          />
        </Suspense>
      )}
    </>
  )
}
