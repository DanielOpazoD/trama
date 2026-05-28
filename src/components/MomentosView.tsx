import { useEffect, useMemo, useState } from 'react'
import {
  useInfiniteMomentosQuery,
  useDeleteMomento,
  useEntitiesQuery,
  useToast,
} from '../state'
import type { Entity, MomentoKind } from '../types'
import { Paginator } from './Paginator'
import { EmptyMessage } from './EmptyMessage'
import { AlbumGrid } from './momentos/AlbumGrid'
import { HojaEditor } from './momentos/HojaEditor'
import { MomentoComposer } from './momentos/MomentoComposer'
import { MomentosFilters } from './momentos/MomentosFilters'
import { MergeMomentosBar } from './momentos/MergeMomentosBar'
import { SelectableMomento } from './momentos/SelectableMomento'
import { ConfirmDestroy } from './ConfirmDestroy'
import { QuoteIcon } from './Icons'
import { MomentoSkeleton, SkeletonList } from './Skeleton'
import { formatDateHeading, groupByDay } from './momentos/helpers'
import { useMomentoComposer } from './momentos/useMomentoComposer'
import { ViewHeader } from './ViewHeader'

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
  // Filtros y modo de vista. null = todos. La queryKey de useInfiniteMomentosQuery
  // cambia con `filterKind`, así cada filtro tiene su cache + paginación.
  const [filterKind, setFilterKind] = useState<MomentoKind | null>(null)
  const [viewMode, setViewMode] = useState<'timeline' | 'album'>('timeline')
  // V-4: la "hoja suelta" es una superficie de escritura aparte del composer
  // rápido. Toggle en vez de siempre-visible para no cargar la vista — quien
  // sólo quiere pegar una foto no la ve.
  const [hojaOpen, setHojaOpen] = useState(false)

  const momentosQuery = useInfiniteMomentosQuery(
    filterKind ? { kind: filterKind } : undefined,
  )
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
    if (!dayFilter) return all
    return all.filter((m) => {
      const d = new Date(m.capturedAt)
      if (Number.isNaN(d.getTime())) return false
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return iso === dayFilter
    })
  }, [momentosQuery.data, dayFilter])
  const groups = useMemo(() => groupByDay(items), [items])
  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

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

  // EE: si el usuario cambia a vista álbum mientras selectionMode=true,
  // limpiar para no dejar la barra flotante huérfana. AlbumGrid no
  // renderiza los SelectableMomento — el wrapping vive solo en el
  // timeline.
  useEffect(() => {
    if (viewMode !== 'timeline' && selectionMode) {
      exitSelection()
    }
  }, [viewMode, selectionMode])

  return (
    <>
      <ViewHeader
        title="Momentos"
        eyebrow="✦ memoria fechada"
        accent="var(--accent-gold)"
        spacing="tight"
      />

      <MomentoComposer composer={composer} />

      {/* V-4 Hojas sueltas: superficie de escritura que enlaza el archivo
          (@ entidad, > cita). Guarda como nota. Colapsada por default. */}
      {hojaOpen ? (
        <HojaEditor onClose={() => setHojaOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setHojaOpen(true)}
          className="mb-6 inline-flex items-center gap-1.5 section-eyebrow hover:text-ink-700 transition-colors"
        >
          <QuoteIcon size={12} />
          escribir una hoja suelta
        </button>
      )}

      {/* ω-D: banner del filtro por día cuando viene del heatmap. */}
      {dayFilter && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2 bg-paper-100/50 border border-ink-100/60 rounded-lg">
          <span className="text-caption text-ink-500">
            Mostrando momentos del{' '}
            <span className="text-ink-700 font-medium tabular-nums">
              {formatDayLabel(dayFilter)}
            </span>
          </span>
          <button
            type="button"
            onClick={clearDayFilter}
            className="section-eyebrow hover:text-ink-700 transition-colors"
          >
            ver todos
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 mb-2">
        <MomentosFilters
          filterKind={filterKind}
          onChangeFilterKind={setFilterKind}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
        />
        {/* EE: toggle del modo selección. Solo aparece cuando hay >1 item
            cargado Y la vista es timeline — AlbumGrid no soporta selección
            todavía (TODO: si hay demanda, hacer el wrapping ahí también).
            Si el usuario está en selectionMode y cambia a álbum, el
            useEffect de abajo limpia la selección automáticamente. */}
        {items.length > 1 && viewMode === 'timeline' && (
          <button
            type="button"
            onClick={() => {
              if (selectionMode) exitSelection()
              else setSelectionMode(true)
            }}
            className={`text-micro uppercase tracking-eyebrow transition-colors shrink-0 ${
              selectionMode ? 'text-ink-700' : 'text-ink-400 hover:text-ink-700'
            }`}
            aria-pressed={selectionMode}
          >
            {selectionMode ? 'salir selección' : 'seleccionar'}
          </button>
        )}
      </div>

      {momentosQuery.isLoading ? (
        <ul className="space-y-4">
          <SkeletonList count={6} Component={MomentoSkeleton} />
        </ul>
      ) : items.length === 0 ? (
        filterKind || dayFilter ? (
          // Hay momentos en general, pero el filtro actual no devuelve nada.
          <EmptyMessage
            illustration="pair"
            title={
              dayFilter ? 'Ese día está vacío.' : `Ningún momento de tipo ${filterKind}.`
            }
            body={
              dayFilter ? (
                <>No registraste nada ese día. Probá otro o limpiá el filtro.</>
              ) : (
                <>
                  Cambiá el tipo en la barra de arriba o creá una entrada nueva de este
                  tipo.
                </>
              )
            }
            hint={
              <button
                onClick={() => {
                  if (dayFilter) clearDayFilter()
                  if (filterKind) setFilterKind(null)
                }}
                className="underline hover:text-ink-700 transition-colors"
              >
                Mostrar todos
              </button>
            }
          />
        ) : (
          <EmptyMessage
            illustration="thread"
            title="Todavía no hay momentos"
            body={
              <>
                Las entradas que crees acá quedan en una línea de tiempo. Pega tweets,
                links, screenshots y fotos — o simplemente escribe una nota del día.
              </>
            }
          />
        )
      ) : viewMode === 'album' && (filterKind === 'foto' || filterKind === null) ? (
        // AA-D: álbum visible también en "Todos" — AlbumGrid filtra
        // internamente a kind=foto, así que el usuario ve solo las
        // fotos en grid sin tener que cambiar de pestaña antes.
        <AlbumGrid items={items} entitiesById={entitiesById} onDelete={handleDelete} />
      ) : (
        <div className="space-y-10">
          {groups.map(({ dayKey, entries }) => (
            <section key={dayKey} className="animate-fade-up">
              <div className="mb-3 flex items-baseline gap-3">
                <h3
                  className="section-eyebrow-serif"
                  style={{ color: 'var(--accent-gold)' }}
                >
                  {formatDateHeading(entries[0]!.capturedAt)}
                </h3>
                <span className="flex-1 h-px bg-ink-100/40" />
                <span className="text-caption text-ink-300 tabular-nums">
                  {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
                </span>
              </div>
              <ul className="space-y-4">
                {entries.map((m) => (
                  <SelectableMomento
                    key={m.id}
                    momento={m}
                    entitiesById={entitiesById}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(m.id)}
                    onToggleSelect={() => toggleSelect(m.id)}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <Paginator
            hasNext={momentosQuery.hasNextPage ?? false}
            loading={momentosQuery.isFetchingNextPage}
            onLoadMore={() => momentosQuery.fetchNextPage()}
            showEndMark={items.length >= 5}
          />
        </div>
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
  try {
    const param = new URLSearchParams(window.location.search).get('compose')
    if (param === 'nota' || param === 'recorte' || param === 'foto') {
      return param
    }
  } catch {
    /* malformed URL — fallback al default del composer */
  }
  return undefined
}

/**
 * ω-D: lee `?day=YYYY-MM-DD` de la URL y se actualiza si cambia por
 * navegación (popstate). Valida el formato — un día con caracteres no
 * numéricos queda null. Devuelve la string ISO o null.
 */
function useDayFilter(): string | null {
  const [day, setDay] = useState<string | null>(() => readDayParam())
  useEffect(() => {
    function onPop() {
      setDay(readDayParam())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return day
}

function readDayParam(): string | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('day')
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return raw
}

function formatDayLabel(iso: string): string {
  // YYYY-MM-DD → "viernes 23 de mayo 2026" en español, capitalizado.
  const [y, m, d] = iso.split('-').map(Number)
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  )
    return iso
  const date = new Date(y, m - 1, d)
  const raw = date.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function clearDayFilter() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('day')
  window.history.pushState({}, '', url.toString())
  window.dispatchEvent(new PopStateEvent('popstate'))
}
