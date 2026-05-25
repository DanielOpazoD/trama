import { useEffect, useMemo, useState } from 'react'
import {
  useInfiniteMomentosQuery,
  useDeleteMomento,
  useEntitiesQuery,
  useToast,
} from '../state'
import type { Entity, Momento, MomentoKind } from '../types'
import { EndMark, OrnamentBreak } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { AlbumGrid } from './momentos/AlbumGrid'
import { MomentoComposer } from './momentos/MomentoComposer'
import { MomentoEntry } from './momentos/MomentoEntry'
import { MomentosFilters } from './momentos/MomentosFilters'
import { MergeMomentosBar } from './momentos/MergeMomentosBar'
import { formatDateHeading, groupByDay } from './momentos/helpers'
import { useMomentoComposer } from './momentos/useMomentoComposer'
import { sectionWashStyle } from '../lib/sectionWash'

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

  async function handleDelete(id: string) {
    try {
      await deleteMomento.mutateAsync(id)
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
      {/* χ-followup: mb-10 → mb-6 — el header pesaba mucho aire encima
          del composer y obligaba a scrollear para arrancar a escribir.
          ω-B: wash con accent-gold (la memoria también pesa en oro). */}
      <header
        className="mb-6 px-3 -mx-3 py-2 -my-2 rounded-lg"
        style={sectionWashStyle('var(--accent-gold)')}
      >
        <p
          className="section-eyebrow-serif mb-2"
          style={{ color: 'var(--accent-gold)' }}
        >
          ✦ memoria fechada
        </p>
        <h2 className="font-serif text-4xl text-ink-700 leading-none">Momentos</h2>
        <div className="accent-rule mt-3 mb-2" />
      </header>

      <MomentoComposer composer={composer} />

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
            className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
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
              selectionMode
                ? 'text-ink-700'
                : 'text-ink-400 hover:text-ink-700'
            }`}
            aria-pressed={selectionMode}
          >
            {selectionMode ? 'salir selección' : 'seleccionar'}
          </button>
        )}
      </div>

      {momentosQuery.isLoading ? (
        <p className="text-ink-300 italic text-sm">Cargando momentos…</p>
      ) : items.length === 0 ? (
        <EmptyMessage
          title="Todavía no hay momentos"
          body={
            <>
              Las entradas que crees acá quedan en una línea de tiempo. Pega
              tweets, links, screenshots y fotos — o simplemente escribe una
              nota del día.
            </>
          }
        />
      ) : viewMode === 'album' && (filterKind === 'foto' || filterKind === null) ? (
        // AA-D: álbum visible también en "Todos" — AlbumGrid filtra
        // internamente a kind=foto, así que el usuario ve solo las
        // fotos en grid sin tener que cambiar de pestaña antes.
        <AlbumGrid
          items={items}
          entitiesById={entitiesById}
          onDelete={handleDelete}
        />
      ) : (
        <div className="space-y-10">
          {groups.map(({ dayKey, entries }) => (
            <section key={dayKey} className="animate-fade-up">
              <div className="mb-3 flex items-baseline gap-3">
                <h3
                  className="section-eyebrow-serif"
                  style={{ color: 'var(--accent-gold)' }}
                >
                  {formatDateHeading(entries[0].capturedAt)}
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

          {momentosQuery.hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => momentosQuery.fetchNextPage()}
                disabled={momentosQuery.isFetchingNextPage}
                className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                {momentosQuery.isFetchingNextPage ? 'cargando…' : 'más atrás ↓'}
              </button>
            </div>
          )}

          {!momentosQuery.hasNextPage && items.length >= 5 && (
            <div className="flex flex-col items-center gap-2 pt-8 text-ink-300">
              <OrnamentBreak />
              <EndMark size={14} />
            </div>
          )}
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
    </>
  )
}

/**
 * EE: wrapper de MomentoEntry para el modo selección.
 *
 * En modo normal: render idéntico al original.
 * En modo selección: agrega overlay click-through que toggle el id +
 * indicador visual (ring + checkbox). Los handlers internos de
 * MomentoEntry (delete, lightbox, etc.) quedan inertes mientras
 * selectionMode=true porque el overlay intercepta el click.
 */
function SelectableMomento({
  momento,
  entitiesById,
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onDelete: () => void
}) {
  if (!selectionMode) {
    return (
      <MomentoEntry
        momento={momento}
        entitiesById={entitiesById}
        onDelete={onDelete}
      />
    )
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    // EE-followup #8: a11y — Space + Enter toggle el checkbox.
    // Es la convención WAI-ARIA estándar para `role="checkbox"`.
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onToggleSelect()
    }
  }

  return (
    <div
      className={`relative rounded-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'ring-2 ring-offset-2'
          : 'ring-1 ring-transparent hover:ring-ink-100/80'
      }`}
      style={{
        // El ring color via CSS var directa funciona; antes usábamos
        // un --tw-ring-color como hack que requería @ts-expect-error.
        // Ahora seteamos boxShadow directo cuando está seleccionado.
        ...(selected
          ? { boxShadow: '0 0 0 2px var(--accent-gold), 0 0 0 4px rgb(var(--paper-50))' }
          : {}),
      }}
      onClick={onToggleSelect}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      aria-label={`Seleccionar momento del ${momento.capturedAt.slice(0, 10)}`}
    >
      {/* Checkbox visual arriba a la izquierda */}
      <div
        className="absolute top-2 left-2 z-10 size-5 rounded-md border-2 flex items-center justify-center pointer-events-none"
        style={{
          backgroundColor: selected ? 'var(--accent-gold)' : 'rgb(var(--paper-50))',
          borderColor: selected ? 'var(--accent-gold)' : 'rgb(var(--ink-300) / 0.6)',
        }}
        aria-hidden
      >
        {selected && (
          <span className="text-paper-50 text-xs leading-none font-bold">✓</span>
        )}
      </div>
      {/* MomentoEntry deshabilitado interactuamente con pointer-events */}
      <div className="pointer-events-none opacity-90">
        <MomentoEntry
          momento={momento}
          entitiesById={entitiesById}
          onDelete={onDelete}
        />
      </div>
    </div>
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
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
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
