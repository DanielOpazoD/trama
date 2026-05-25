import { useMemo, useState } from 'react'
import {
  useInfiniteMomentosQuery,
  useDeleteMomento,
  useEntitiesQuery,
  useToast,
} from '../state'
import type { Entity, MomentoKind } from '../types'
import { EndMark, OrnamentBreak } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { AlbumGrid } from './momentos/AlbumGrid'
import { MomentoComposer } from './momentos/MomentoComposer'
import { MomentoEntry } from './momentos/MomentoEntry'
import { MomentoLinkingPanel } from './momentos/MomentoLinkingPanel'
import { MomentosFilters } from './momentos/MomentosFilters'
import { formatDateHeading, groupByDay } from './momentos/helpers'
import { useMomentoComposer } from './momentos/useMomentoComposer'
import { useMomentoLinking } from './momentos/useMomentoLinking'

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

  const linking = useMomentoLinking()
  // τ-mobile-bridge: kind inicial controlado por `?compose=`. Al
  // escanear el QR de Momentos desde el celular, la URL viene con
  // `?view=momentos&compose=foto` — el composer arranca con el tab
  // Foto seleccionado, sin que el usuario tenga que tocar nada extra.
  const initialKind = readInitialCompose()
  const composer = useMomentoComposer({
    onCreated: (created) => {
      // Solo abrimos el panel de linking para recortes/fotos — las notas
      // se guardan y listo (el usuario las vincula a entidades a mano si quiere).
      if (created.kind === 'recorte' || created.kind === 'foto') {
        linking.openFor(created)
      }
    },
    initialKind,
  })

  const items = useMemo(
    () => momentosQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [momentosQuery.data],
  )
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

  return (
    <>
      <header className="mb-10">
        <p
          className="section-eyebrow-serif mb-2"
          style={{ color: 'var(--accent-gold)' }}
        >
          ✦ memoria fechada
        </p>
        <h2 className="font-serif text-4xl text-ink-700 leading-none">Momentos</h2>
        <div className="accent-rule mt-3 mb-2" />
        {/* σ-followup: subtitle descriptivo removido. El eyebrow
            "memoria fechada" + el composer abajo ("¿Qué viste, leíste
            o pensaste hoy?") ya cuentan el concepto. */}
      </header>

      <MomentoComposer composer={composer} />

      <MomentoLinkingPanel
        linking={linking}
        entitiesById={entitiesById}
        totalEntities={entities.length}
      />

      <MomentosFilters
        filterKind={filterKind}
        onChangeFilterKind={setFilterKind}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      />

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
      ) : viewMode === 'album' && filterKind === 'foto' ? (
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
                  <MomentoEntry
                    key={m.id}
                    momento={m}
                    entitiesById={entitiesById}
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
