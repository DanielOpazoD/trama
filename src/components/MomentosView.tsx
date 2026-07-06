import { useEffect, useMemo, useState } from 'react'
import {
  useInfiniteMomentosQuery,
  useDeleteMomento,
  useEntitiesQuery,
  useToast,
} from '../state'
import type { MomentoKind } from '../types'
import { ErrorState } from './ErrorState'
import { AlbumGrid } from './momentos/AlbumGrid'
import { MomentoComposer } from './momentos/MomentoComposer'
import { MergeMomentosBar } from './momentos/MergeMomentosBar'
import { ConfirmDestroy } from './ConfirmDestroy'
import { MomentoSkeleton, SkeletonList } from './Skeleton'
import { groupByDay } from './momentos/helpers'
import { useMomentoComposer } from './momentos/useMomentoComposer'
import { ViewHeader } from './ViewHeader'
import { MomentoShareModal } from './momentos/MomentoShareModal'
import {
  MomentosDayFilterBanner,
  MomentosEmptyState,
  MomentosTimeline,
  MomentosToolbar,
} from './momentos/MomentosViewSections'
import {
  buildEntitiesById,
  contentFilterToKind,
  filterMomentosByDay,
  momentoHasVideo,
  readInitialComposeFromSearch,
  shouldUseAlbumView,
  type ContentFilter,
} from './momentos/momentosViewModel'
import { clearDayFilter, useDayFilter } from './momentos/useDayFilter'

/**
 * Vista Momentos — orquestador.
 *
 * Estructura intencional:
 *   - useMomentoComposer  → state + submit del form de captura
 *   - useMomentoLinking   → state + IA del panel post-guardar
 *   - MomentosFilters     → barra de filtros (stateless)
 *   - MomentoEntry        → render de cada item del timeline
 *   - AlbumGrid           → render alternativo en grid (solo fotos)
 *
 * Esta vista solo conoce qué pintar dónde y cómo enlazar los hooks
 * entre sí. Toda la lógica vive en los sub-archivos.
 */
export function MomentosView() {
  // Filtros y modo de vista. 'all' = todos. La queryKey de useInfiniteMomentosQuery
  // cambia con el kind derivado, así cada filtro tiene su cache + paginación.
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all')
  const [viewMode, setViewMode] = useState<'timeline' | 'album'>('album')
  const [shareOpen, setShareOpen] = useState(false)

  // El filtro de contenido se traduce a un kind real para la query; 'video'
  // consulta fotos (el clip vive dentro de kind='foto') y se refina abajo.
  const queryKind = contentFilterToKind(contentFilter)
  const momentosQuery = useInfiniteMomentosQuery(
    queryKind ? { kind: queryKind } : undefined,
  )
  // Espejo estable de los primitivos de paginación para el efecto de auto-carga:
  // exhaustive-deps prefiere las claves, no el objeto query que muta cada render.
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    momentosQuery
  const deleteMomento = useDeleteMomento()
  const { data: entities = [] } = useEntitiesQuery()
  const toast = useToast()

  // τ-mobile-bridge: kind inicial controlado por `?compose=`. Al
  // escanear el QR de Momentos desde el celular, la URL viene con
  // `?view=momentos&compose=foto` — el composer arranca con el tab
  // Foto seleccionado, sin que el usuario tenga que tocar nada extra.
  const initialKind = readInitialCompose()
  // υ-no-ai: el panel de linking automático con IA (suggest-entities +
  // vision-suggest) fue removido. Los momentos se guardan tal cual; el
  // vínculo manual a entidades queda pendiente como feature explícita
  // si el usuario la pide. Quitamos la fricción de un paso post-guardar
  // que siempre era opcional.
  const composer = useMomentoComposer({
    initialKind,
  })

  // ω-D: filtro por día desde el heatmap del Inicio. Lee `?day=YYYY-MM-DD`
  // de la URL al mount + responde a popstate. Si está presente, filtramos
  // `items` client-side para mostrar solo los del día.
  const dayFilter = useDayFilter()

  const items = useMemo(() => {
    const all = momentosQuery.data?.pages.flatMap((p) => p.items) ?? []
    const byDay = filterMomentosByDay(all, dayFilter)
    // 'video' no es un kind: se refina client-side a los momentos que traen al
    // menos un clip. El álbum ya cargó todas las páginas (auto-load de abajo),
    // así que ve todos los videos y no solo los de la primera página.
    return contentFilter === 'video' ? byDay.filter(momentoHasVideo) : byDay
  }, [momentosQuery.data, dayFilter, contentFilter])
  const groups = useMemo(() => groupByDay(items), [items])
  const entitiesById = useMemo(() => buildEntitiesById(entities), [entities])

  // Confirmación de borrado: el botón "eliminar" del MomentoEntry sólo
  // marca el id como pendiente; la mutación corre cuando el usuario
  // confirma en ConfirmDestroy.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDelete(id: string) {
    setPendingDeleteId(id)
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    try {
      await deleteMomento.mutateAsync(pendingDeleteId)
      setPendingDeleteId(null)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo eliminar',
        tone: 'error',
      })
    }
  }

  // EE: modo selección para fusionar. Cuando está activo:
  //   - el toggle del header cambia a "salir"
  //   - cada momento se vuelve clickeable como checkbox (sin abrir nada)
  //   - aparece la MergeMomentosBar flotante al pie
  // Al fusionar (o cancelar), salimos del modo y limpiamos selección.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectedMomentos = useMemo(
    () => items.filter((m) => selectedIds.has(m.id)),
    [items, selectedIds],
  )
  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function exitSelection(): void {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }
  function toggleSelectionMode(): void {
    if (selectionMode) exitSelection()
    else setSelectionMode(true)
  }
  function showAllMomentos(): void {
    if (dayFilter) clearDayFilter()
    if (contentFilter !== 'all') setContentFilter('all')
  }

  // EE: si el usuario cambia a vista álbum mientras selectionMode=true,
  // limpiar para no dejar la barra flotante huérfana. AlbumGrid no
  // renderiza los SelectableMomento — el wrapping vive solo en el
  // timeline.
  useEffect(() => {
    if (viewMode !== 'timeline' && selectionMode) {
      exitSelection()
    }
  }, [viewMode, selectionMode])

  // ω-álbum: el álbum es una galería completa por año, no una página, y el
  // filtro Videos junta clips de cualquier año — ambos recogen TODAS las
  // páginas. El timeline (sin video) conserva su carga manual con el Paginator.
  const autoLoadsAllPages = viewMode === 'album' || contentFilter === 'video'
  useEffect(() => {
    if (!autoLoadsAllPages) return
    // Guard contra tormenta de reintentos: si `fetchNextPage` falló tras sus
    // retries, `isFetchingNextPage` vuelve a false con `hasNextPage` aún true;
    // sin `isFetchNextPageError` el efecto lo re-dispararía en cada render.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage()
    }
  }, [
    autoLoadsAllPages,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ])

  return (
    <>
      <ViewHeader
        title="Momentos"
        eyebrow="✦ memoria fechada"
        accent="var(--accent-gold)"
        spacing="tight"
        density="compact"
      />

      {/* Si se llega por `?compose=` (QR/celular), el composer arranca expandido;
          en la vista normal arranca colapsado para no dominar el alto. */}
      <MomentoComposer composer={composer} defaultExpanded={initialKind !== undefined} />

      {/* ω-D: banner del filtro por día cuando viene del heatmap. */}
      {dayFilter && (
        <MomentosDayFilterBanner dayFilter={dayFilter} onClear={clearDayFilter} />
      )}

      <MomentosToolbar
        contentFilter={contentFilter}
        viewMode={viewMode}
        itemCount={items.length}
        selectionMode={selectionMode}
        onChangeContentFilter={setContentFilter}
        onChangeViewMode={setViewMode}
        onShare={() => setShareOpen(true)}
        onToggleSelectionMode={toggleSelectionMode}
      />

      {momentosQuery.isLoading ? (
        <ul className="space-y-4">
          <SkeletonList count={6} Component={MomentoSkeleton} />
        </ul>
      ) : momentosQuery.isError && items.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar los momentos"
          onRetry={() => momentosQuery.refetch()}
          retrying={momentosQuery.isFetching}
        />
      ) : items.length === 0 ? (
        // No declarar "vacío" mientras el auto-load aún trae páginas: la 1ª
        // página de fotos sin clips mostraría "Ningún video todavía." un
        // instante antes de que llegue el video de una página posterior.
        <MomentosEmptyState
          contentFilter={contentFilter}
          dayFilter={dayFilter}
          loadingMore={autoLoadsAllPages && (hasNextPage || isFetchingNextPage)}
          onShowAll={showAllMomentos}
        />
      ) : shouldUseAlbumView({ viewMode, filterKind: queryKind }) ? (
        // AA-D: álbum visible también en "Todos" — AlbumGrid filtra
        // internamente a kind=foto, así que el usuario ve solo las
        // fotos en grid sin tener que cambiar de pestaña antes.
        <>
          <AlbumGrid items={items} entitiesById={entitiesById} onDelete={handleDelete} />
          {/* ω-álbum: mientras se recogen las páginas anteriores (todos los
              años), un pie sereno para que no parezca que faltan fotos. */}
          {isFetchingNextPage && (
            <p className="mt-6 text-center text-caption font-serif italic text-ink-400">
              recogiendo años anteriores…
            </p>
          )}
        </>
      ) : (
        <MomentosTimeline
          groups={groups}
          entitiesById={entitiesById}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          hasNext={hasNextPage ?? false}
          loadingNext={isFetchingNextPage}
          onToggleSelect={toggleSelect}
          onDelete={handleDelete}
          onLoadMore={() => fetchNextPage()}
        />
      )}

      {/* EE: barra flotante al fondo cuando hay 2+ seleccionados. */}
      {selectionMode && (
        <MergeMomentosBar
          selected={selectedMomentos}
          onClear={exitSelection}
          onMerged={exitSelection}
        />
      )}

      <ConfirmDestroy
        open={pendingDeleteId !== null}
        title="¿Eliminar este momento?"
        body="La entrada se oculta del timeline. No se borra del todo — si te arrepientes, se puede restaurar."
        confirmLabel="Eliminar"
        pending={deleteMomento.isPending}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
      />
      {shareOpen && <MomentoShareModal onClose={() => setShareOpen(false)} />}
    </>
  )
}

/**
 * τ-mobile-bridge: lee `?compose=` de la URL. Whitelist a los kinds
 * válidos de Momento. Si no hay param o es inválido, devuelve undefined
 * para que el composer arranque en su default ('nota'). SSR-safe.
 */
function readInitialCompose(): MomentoKind | undefined {
  if (typeof window === 'undefined') return undefined
  return readInitialComposeFromSearch(window.location.search)
}
