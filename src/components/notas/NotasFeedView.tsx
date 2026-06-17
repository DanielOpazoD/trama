import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  type NotasFeedSegment,
  type RecorteStatusFilter,
} from '../../state'
import type { Recorte, RecorteTarget } from '../../api'
import { extractUrl, hostLabel } from '../../lib/captureIntent'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { InlineLoadingLabel } from '../InlineLoadingLabel'
import {
  ScissorsIcon,
  CameraIcon,
  SearchIcon,
  CalendarIcon,
  CloseIcon,
  GalleryIcon,
  ListIcon,
  ThumbSizeIcon,
  CheckSquareIcon,
} from '../Icons'
import { OverflowMenu } from '../OverflowMenu'
import {
  useRecorteThumbSize,
  type RecorteThumbSize,
} from '../../hooks/useRecorteThumbSize'
import { useRecorteFeedView } from '../../hooks/useRecorteFeedView'
import { ViewHeader } from '../ViewHeader'
import { NoteCard } from './NoteCard'
import { ActivityCalendar, localDayKey } from './ActivityCalendar'
import { FeedSkeleton } from './FeedSkeleton'
import { RecorteCard } from '../recortes/RecorteCard'
import { SelectableRecorte } from '../recortes/SelectableRecorte'
import { RecorteSelectionBar } from '../recortes/RecorteSelectionBar'
import { CapturasGalleryGrid } from '../recortes/CapturasGalleryGrid'
import { PromoteModal, type PromoteSeed } from '../recortes/PromoteModal'
import { FavoritosPanel } from '../recortes/FavoritosPanel'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { useFeedKeyboardNav } from '../../hooks/useFeedKeyboardNav'
import { useMainScrollVirtualizer } from '../../hooks/useMainScrollVirtualizer'
import { PendingAttachmentsInput } from './PendingAttachmentsInput'
import { MarkdownField } from './MarkdownField'
import { compressImage } from '../momentos/helpers'

// Lazy: la escritura enfocada (overlay fullscreen) se baja solo al abrirla.
const FocusedWriting = lazy(() =>
  import('./FocusedWriting').then((m) => ({ default: m.FocusedWriting })),
)

const ACCENT = 'var(--accent-sage)'

// Cap del delay escalonado de entrada: hasta este índice cada ítem entra con un
// pequeño retraso incremental; a partir de ahí, 0 (no escalonamos una lista larga).
const STAGGER_CAP = 6
const STAGGER_STEP_MS = 45

const SEGMENTS: Array<{ value: NotasFeedSegment; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'escritas', label: 'Escritas' },
  { value: 'capturas', label: 'Capturas' },
  { value: 'favoritos', label: 'Favoritos' },
]

/** Opciones del control de tamaño de las miniaturas de imagen del feed. */
const THUMB_SIZES: Array<{ value: RecorteThumbSize; label: string }> = [
  { value: 'pequena', label: 'Pequeña' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
]

/**
 * Filtro de estado (triage) que solo aparece en el segmento Capturas. Absorbe el
 * triage que vivía en la antigua RecortesView (pendientes / curados / archivados).
 * "Todas" incluye también los archivados; el resto filtra a su estado.
 */
const CAPTURA_STATUS_OPTIONS: Array<{ value: RecorteStatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'promoted', label: 'Curadas' },
  { value: 'archived', label: 'Archivadas' },
]

/**
 * Segmento inicial. Los enlaces viejos de Favoritos (`?view=recortes&tab=favoritos`)
 * se reescriben a `?world=notas&section=notas&segment=favoritos`: si el param está
 * presente y es válido, el feed abre en ese segmento.
 */
function initialSegment(): NotasFeedSegment {
  if (typeof window === 'undefined') return 'todo'
  const raw = new URLSearchParams(window.location.search).get('segment')
  return SEGMENTS.some((s) => s.value === raw) ? (raw as NotasFeedSegment) : 'todo'
}

/** Las etiquetas solo tienen sentido en segmentos con notas (Todo · Escritas). */
function segmentHasTags(segment: NotasFeedSegment): boolean {
  return segment === 'todo' || segment === 'escritas'
}

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
export function NotasFeedView() {
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
  const [segment, setSegment] = useState<NotasFeedSegment>(initialSegment)
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
    () => ({
      segment,
      query: search.trim() || undefined,
      tag: activeTag ?? undefined,
      day: selectedDay,
      // El filtro de estado solo aplica en Capturas; en el resto se deja sin
      // estado (default = pendientes + curados, oculta archivados).
      recorteStatus: segment === 'capturas' ? capturaStatus : null,
    }),
    [segment, search, activeTag, selectedDay, capturaStatus],
  )

  const { items, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotasFeed(filter)

  // --- Triage en lote -----------------------------------------------------
  // Las capturas elegidas, resueltas desde los ítems cargados del feed.
  const selectedRecortes = useMemo(
    () =>
      items
        .filter((it) => it.type === 'recorte' && selectedIds.has(it.id))
        .map((it) => (it as Extract<typeof it, { type: 'recorte' }>).recorte),
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
  const galleryMode =
    feedView === 'galeria' && (segment === 'todo' || segment === 'capturas')
  useEffect(() => {
    if (galleryMode) exitSelection()
  }, [galleryMode, exitSelection])

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

  // El universo de tags se calcula sobre TODAS las notas (bounded, client-side)
  // SIN filtrar por etiqueta — así elegir una etiqueta no hace desaparecer las
  // demás de la lista sugerida. Antes esto disparaba un segundo feed infinito;
  // ahora deriva de `useNotesQuery` (la fuente del calendario), que ya es la
  // colección completa de notas. Las etiquetas solo existen en notas, así que
  // el segmento "capturas" no aporta tags.
  const tagCounts = useMemo(() => {
    if (!segmentHasTags(segment)) return []
    const q = search.trim().toLowerCase()
    const m = new Map<string, number>()
    for (const n of notes) {
      if (q && !`${n.content}\n${n.title ?? ''}`.toLowerCase().includes(q)) continue
      for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [notes, segment, search])
  // Lista plana de etiquetas para el autocompletar `#` del composer (todo el
  // universo de notas, no el filtrado por segmento/búsqueda).
  const allNoteTags = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) for (const t of n.tags) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [notes])

  // ¿Hay algún filtro activo (más allá del segmento)?
  const hasContentFilter =
    search.trim() !== '' || activeTag !== null || selectedDay !== null
  // ¿El feed está realmente vacío de datos, o solo filtrado a cero? Con el feed
  // paginado server-side, "vacío de verdad" = sin filtros activos, sin estado
  // de triage restringido y la primera página llegó vacía sin más por traer.
  const everythingEmpty =
    !isLoading &&
    !hasContentFilter &&
    items.length === 0 &&
    !hasNextPage &&
    (segment !== 'capturas' || capturaStatus === 'all')

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
  const feedMeasureKey = useMemo(
    () =>
      items
        .map((item) =>
          item.type === 'note'
            ? `n:${item.id}:${item.note.updatedAt}:${item.note.hasImages ? 1 : 0}`
            : `r:${item.id}:${item.recorte.updatedAt}:${item.recorte.imageKey ?? ''}:${
                item.recorte.imageUrl ?? ''
              }:${item.recorte.text.length}`,
        )
        .join('|'),
    [items],
  )

  useLayoutEffect(() => {
    if (items.length === 0) return
    virtualizer.measure()
  }, [feedMeasureKey, items.length, recorteThumb, virtualizer])

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

  /** Sube y captura una o varias imágenes como recortes de imagen.
   *  Las comprime client-side (downscale + JPEG) antes de subir, igual que el
   *  composer de Momentos — evita subir un screenshot de 8 MB tal cual. */
  async function captureImageFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    // Mostramos las tarjetas «subiendo…» desde ya (incluye la compresión).
    setUploadingImages((n) => n + images.length)
    let done = 0
    for (const original of images) {
      const file = await compressImage(original).catch(() => original)
      createRecorte.mutate(
        { kind: 'image', file },
        {
          onSuccess: () => {
            done += 1
            if (done === images.length) {
              toast.show({
                message:
                  images.length === 1
                    ? 'Imagen guardada en tus capturas.'
                    : `${images.length} imágenes guardadas en tus capturas.`,
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
    const images = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (images.length > 0) {
      e.preventDefault()
      captureImageFiles(images)
    }
    setDragging(false)
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

  const showTags = segmentHasTags(segment)

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
        <div
          onFocusCapture={() => setComposerFocused(true)}
          onBlurCapture={() => setComposerFocused(false)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onComposerDrop}
          className={`card-paper-soft rounded-xl border p-3 mb-4 transition ${
            dragging ? 'border-dashed' : 'border-ink-100/70'
          }`}
          // Foco editorial: borde sage + anillo tintado suave (no el outline
          // genérico del navegador). Mientras se arrastra una imagen, borde sage
          // punteado con fondo tenue. El anillo usa box-shadow para no mover el
          // layout (a diferencia de un border que cambia de ancho).
          style={
            dragging
              ? { borderColor: ACCENT, background: 'var(--accent-sage-soft)' }
              : composerFocused
                ? { borderColor: ACCENT, boxShadow: '0 0 0 3px var(--accent-sage-soft)' }
                : undefined
          }
        >
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
          <MarkdownField
            value={draft}
            onChange={setDraft}
            textareaRef={composerRef}
            onKeyDown={onComposerKey}
            onPaste={onComposerPaste}
            rows={3}
            placeholder="Escribe una nota, pega un enlace o suelta una imagen… usa #etiquetas"
            aria-label="Captura: escribe una nota, pega un enlace o pega/suelta una imagen"
            onRequestFocusMode={() => setFocusMode(true)}
            tagUniverse={allNoteTags}
            className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed pr-8"
          />
          <PendingAttachmentsInput
            files={pendingFiles}
            onChange={setPendingFiles}
            busy={createNote.isPending || uploadAttachment.isPending}
          />

          {/* Cuando el borrador es un enlace, anunciamos que se guardará como
              recorte y dejamos volver a nota con un toque. */}
          {isLinkDraft && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-micro text-ink-400">
              <ScissorsIcon size={11} className="text-[color:var(--accent-sage)]" />
              Detectamos un enlace — se guardará como recorte en tus capturas.
              <button
                type="button"
                onClick={() => setForceNote(true)}
                className="underline hover:text-ink-700 transition-colors"
              >
                guardar como nota
              </button>
            </p>
          )}

          {composerActive && (
            <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-ink-100/60 animate-fade-up">
              <span className="flex items-center gap-1.5 text-micro text-ink-300">
                <CameraIcon size={11} />
                pega o suelta una imagen para capturarla
              </span>
              <div className="relative">
                <button
                  onClick={save}
                  disabled={
                    (!draft.trim() && !isLinkDraft) ||
                    createNote.isPending ||
                    createRecorte.isPending
                  }
                  className="btn-ink text-xs disabled:opacity-40"
                >
                  {createRecorte.isPending
                    ? 'Guardando…'
                    : createNote.isPending
                      ? 'Guardando…'
                      : isLinkDraft
                        ? 'Guardar enlace'
                        : 'Guardar nota'}
                </button>
                {/* Micro-confirmación callada: onda concéntrica salvia al guardar. */}
                {justSaved && (
                  <span
                    aria-hidden
                    className="animate-saved-ripple pointer-events-none absolute inset-0 rounded-md"
                    style={{ boxShadow: `0 0 0 2px ${ACCENT}` }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fila única de control: tabs de segmento + lupa/calendario a la derecha.
          Toda la demás afordancia (buscador, etiquetas, calendario, estado) es
          on-demand desde acá. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filtrar el feed"
          className="inline-flex rounded-lg border border-ink-100/70 bg-paper-50 p-0.5"
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

        {/* Acciones on-demand del feed: lupa (buscar) + calendario (heatmap).
            En Favoritos no hay buscador ni heatmap (es otro panel). */}
        {segment !== 'favoritos' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (searchOpen ? closeSearch() : openSearch())}
              aria-label="Buscar en notas y capturas"
              aria-expanded={searchOpen}
              title="Buscar"
              className={`touch-target rounded-md p-1.5 transition-colors ${
                searchOpen || search
                  ? 'bg-ink-100/70 text-ink-700'
                  : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
              }`}
            >
              <SearchIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              aria-label={
                calendarOpen
                  ? 'Ocultar calendario de actividad'
                  : 'Mostrar calendario de actividad'
              }
              aria-pressed={calendarOpen}
              title="Calendario de actividad"
              className={`touch-target rounded-md p-1.5 transition-colors ${
                calendarOpen || selectedDay
                  ? 'bg-ink-100/70 text-ink-700'
                  : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
              }`}
            >
              <CalendarIcon size={14} />
            </button>
            {/* Tamaño de las miniaturas de imagen. Solo donde hay capturas a la
                vista (Todo · Capturas); en Escritas no hay imágenes. */}
            {(segment === 'todo' || segment === 'capturas') && (
              <OverflowMenu
                label="Tamaño de las miniaturas"
                width="w-40"
                triggerContent={<ThumbSizeIcon size={14} />}
                triggerClassName={`touch-target rounded-md p-1.5 transition-colors ${
                  recorteThumb !== 'mediana'
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                {(close) => (
                  <div role="group" aria-label="Tamaño de las miniaturas">
                    <p className="px-2.5 pb-1 pt-0.5 text-micro uppercase tracking-eyebrow text-ink-300">
                      Miniaturas
                    </p>
                    {THUMB_SIZES.map(({ value, label }) => (
                      <button
                        key={value}
                        role="menuitemradio"
                        aria-checked={recorteThumb === value}
                        onClick={() => {
                          setRecorteThumb(value)
                          close()
                        }}
                        className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                          recorteThumb === value
                            ? 'bg-ink-100/70 text-ink-800'
                            : 'text-ink-600 hover:bg-ink-100/60 hover:text-ink-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </OverflowMenu>
            )}
            {/* Alternar lista ↔ galería (grilla de imágenes). */}
            {(segment === 'todo' || segment === 'capturas') && (
              <button
                type="button"
                onClick={() => setFeedView(feedView === 'galeria' ? 'list' : 'galeria')}
                aria-pressed={feedView === 'galeria'}
                aria-label={
                  feedView === 'galeria' ? 'Ver como lista' : 'Ver como galería'
                }
                title={feedView === 'galeria' ? 'Ver como lista' : 'Ver como galería'}
                className={`touch-target rounded-md p-1.5 transition-colors ${
                  feedView === 'galeria'
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                {feedView === 'galeria' ? (
                  <ListIcon size={14} />
                ) : (
                  <GalleryIcon size={14} />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Buscador on-demand: se expande al activar la lupa. Incluye, debajo, las
          etiquetas sugeridas (solo en segmentos con notas) — el filtro por
          etiqueta vive acá, no como tira permanente. */}
      {segment !== 'favoritos' && searchOpen && (
        <div className="mb-4 animate-fade-up space-y-2.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-paper-50 border border-ink-100/60 rounded-md">
            <SearchIcon size={12} className="text-ink-300 shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder="Buscar en notas y capturas…"
              aria-label="Buscar en notas y capturas"
              className="flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300"
            />
            <button
              onClick={closeSearch}
              aria-label="Cerrar búsqueda"
              className="text-ink-300 hover:text-ink-700 transition-colors"
            >
              <CloseIcon size={12} />
            </button>
          </div>
          {showTags && tagCounts.length > 0 && (
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
      )}

      {/* Calendario de actividad (heatmap), on-demand. Cuenta solo notas; el clic
          en un día filtra el feed unificado. Oculto por defecto. */}
      {segment !== 'favoritos' && calendarOpen && (
        <div className="animate-fade-up">
          <ActivityCalendar
            dayKeys={calendarDays}
            stats={calendarStats}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </div>
      )}

      {/* Triage de recortes: control SECUNDARIO de estado, solo en Capturas.
          Texto-links discretos (no otra tira de pills) para que se lea como
          subordinado a los tabs. Por defecto muestra las pendientes. */}
      {segment === 'capturas' && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-caption text-ink-300">
          <div
            role="tablist"
            aria-label="Filtrar capturas por estado"
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="text-micro uppercase tracking-eyebrow text-ink-300">
              estado
            </span>
            {CAPTURA_STATUS_OPTIONS.map(({ value, label }) => {
              const on = capturaStatus === value
              return (
                <button
                  key={value}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setCapturaStatus(value)}
                  className="transition-colors hover:text-ink-700"
                  style={on ? { color: ACCENT } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {/* Triage en lote: entrar/salir del modo selección (solo en lista). */}
          {items.length > 0 && !galleryMode && (
            <button
              type="button"
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              className="ml-auto inline-flex items-center gap-1.5 transition-colors hover:text-ink-700"
              style={selectionMode ? { color: ACCENT } : undefined}
            >
              <CheckSquareIcon size={13} />
              {selectionMode ? 'salir selección' : 'seleccionar'}
            </button>
          )}
        </div>
      )}

      {segment === 'favoritos' ? (
        <FavoritosPanel />
      ) : (
        <>
          {/* Tarjetas «subiendo…» mientras la captura de imagen viaja al servidor.
              Dan feedback inmediato; al terminar, la imagen real toma su lugar. */}
          {uploadingImages > 0 && (
            <ul className="mb-2.5 space-y-2.5" aria-live="polite">
              {Array.from({ length: uploadingImages }).map((_, i) => (
                <li
                  key={i}
                  className="card-paper-soft flex items-center gap-2 p-4 text-caption text-ink-400"
                >
                  <LoadingHint text="subiendo imagen" size="sm" />
                </li>
              ))}
            </ul>
          )}

          {/* Feed / estados */}
          {isLoading ? (
            <FeedSkeleton />
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
                  onClick={focusComposer}
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
          ) : galleryMode ? (
            /* Galería: grilla de las capturas con imagen (omite notas y recortes
               de solo texto). Evita el virtualizador, así que gestiona su propia
               carga incremental sobre las páginas ya traídas del feed. */
            <CapturasGalleryGrid
              items={items}
              size={recorteThumb}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          ) : (
            <>
              {/* Lista virtualizada: solo se monta la ventana visible + overscan.
                  El wrapper reserva la altura total; cada fila se posiciona en
                  absoluto y se mide con measureElement (alturas variables). */}
              <div
                ref={listRef}
                style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
              >
                {virtualItems.map((virtualRow) => {
                  const item = items[virtualRow.index]
                  if (!item) return null
                  const i = virtualRow.index
                  const isSelected = selected === i
                  // Entrada escalonada (capeada). Bajo reduce-motion: sin delay
                  // (y la clase fade-up ya se neutraliza por el @media en CSS).
                  const delay =
                    reducedMotion || i >= STAGGER_CAP
                      ? undefined
                      : `${i * STAGGER_STEP_MS}ms`
                  // Resalte de la selección por teclado (anillo salvia sutil).
                  const selStyle = isSelected
                    ? { boxShadow: `0 0 0 2px ${ACCENT}`, borderRadius: '0.75rem' }
                    : undefined
                  return (
                    <div
                      key={
                        item.type === 'note' ? `note-${item.id}` : `recorte-${item.id}`
                      }
                      data-index={i}
                      ref={virtualizer.measureElement}
                      onMouseDown={() => setSelected(i)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                        // ρ-micro: separación entre tarjetas (antes space-y-2.5).
                        paddingBottom: '0.625rem',
                      }}
                    >
                      <div
                        className={reducedMotion ? undefined : 'animate-fade-up'}
                        style={{ ...selStyle, animationDelay: delay }}
                      >
                        {item.type === 'note' ? (
                          <NoteCard
                            note={item.note}
                            busy={updateNote.isPending || deleteNote.isPending}
                            promoting={
                              promoteNote.isPending && promoteNote.variables === item.id
                            }
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
                                    message:
                                      e instanceof Error
                                        ? e.message
                                        : 'No se pudo promover',
                                    tone: 'error',
                                  }),
                              })
                            }
                          />
                        ) : (
                          <SelectableRecorte
                            selectionMode={selectionMode}
                            selected={selectedIds.has(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            label={`Seleccionar captura: ${
                              item.recorte.sourceTitle ?? item.recorte.text.slice(0, 40)
                            }`}
                          >
                            <ul className="contents">
                              <RecorteCard
                                recorte={item.recorte}
                                thumbSize={recorteThumb}
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
                                  updateRecorte.mutate({
                                    id: item.id,
                                    patch: { status: 'pending' },
                                  })
                                }
                                onDelete={() => deleteRecorte.mutate(item.id)}
                              />
                            </ul>
                          </SelectableRecorte>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Afordancia sutil de carga incremental. */}
              {isFetchingNextPage && (
                <p className="mt-4 text-center text-xs uppercase tracking-eyebrow text-ink-300">
                  <InlineLoadingLabel text="cargando más" />
                </p>
              )}
            </>
          )}
        </>
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

      {segment === 'capturas' && selectionMode && (
        <RecorteSelectionBar
          selected={selectedRecortes}
          onClear={exitSelection}
          onDone={exitSelection}
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
