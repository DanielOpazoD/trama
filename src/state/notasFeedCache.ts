/**
 * Parcheo optimista de las caches del feed paginado (`/api/notas-feed`).
 *
 * El feed es un `useInfiniteQuery` con UNA cache por combinación de filtros
 * (`['notas-feed', JSON({ segment, query, tag, day, recorteStatus })]`). Las
 * mutaciones de triage (fijar nota, archivar/restaurar/promover recorte) aplican
 * el cambio en sitio sobre cada cache cargada — y, para recortes, quitan el ítem
 * de las caches cuyo filtro de estado ya no lo incluye — para que la acción se
 * vea al instante, sin esperar el refetch. `onSettled` igual invalida para
 * reconciliar (e insertar el ítem en caches donde recién ahora encaja).
 */
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Note, Recorte, CaptureItem } from '../api'
import type { NotasFeedPage } from '../api/notasFeed'
import { restoreQueriesSnapshot, snapshotQueries } from './cacheOptimistic'
import { queryKeys } from './queryClient'

type RecorteStatus = Recorte['status']

/** ¿Un recorte con `status` pertenece a una cache (segmento + filtro de estado)? */
export function recorteInCache(
  status: RecorteStatus,
  segment: string,
  recorteStatusKey: string,
): boolean {
  if (segment === 'escritas') return false // ese segmento no lleva recortes
  if (recorteStatusKey === 'all') return true
  if (recorteStatusKey === '') return status !== 'archived' // default: oculta archivados
  return status === recorteStatusKey
}

function parseFeedMeta(key: unknown): { segment: string; recorteStatus: string } | null {
  if (typeof key !== 'string') return null
  try {
    const o: unknown = JSON.parse(key)
    if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>
      return {
        segment: String(rec.segment ?? ''),
        recorteStatus: String(rec.recorteStatus ?? ''),
      }
    }
  } catch {
    /* clave no-JSON: la ignoramos */
  }
  return null
}

/** Snapshot de todas las caches del feed, para rollback en `onError`. */
export type NotasFeedSnapshot = ReturnType<
  typeof snapshotQueries<InfiniteData<NotasFeedPage>>
>

export function snapshotNotasFeed(qc: QueryClient): NotasFeedSnapshot {
  return snapshotQueries<InfiniteData<NotasFeedPage>>(qc, {
    queryKey: queryKeys.notasFeed,
  })
}

export function restoreNotasFeed(qc: QueryClient, snap: NotasFeedSnapshot): void {
  restoreQueriesSnapshot(qc, snap)
}

/** Mapea/filtra los ítems de cada cache del feed con conocimiento del filtro. */
function patchFeedItems(
  qc: QueryClient,
  mapItems: (
    meta: { segment: string; recorteStatus: string },
    items: CaptureItem[],
  ) => CaptureItem[],
): void {
  const caches = qc.getQueriesData<InfiniteData<NotasFeedPage>>({
    queryKey: queryKeys.notasFeed,
  })
  for (const [key, data] of caches) {
    if (!data) continue
    const meta = parseFeedMeta(key[1])
    if (!meta) continue
    qc.setQueryData<InfiniteData<NotasFeedPage>>(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, items: mapItems(meta, p.items) })),
    })
  }
}

/** Optimista: una nota cambió (p. ej. `pinned`) → actualizar en sitio. */
export function patchNoteInFeed(qc: QueryClient, id: string, patch: Partial<Note>): void {
  patchFeedItems(qc, (_meta, items) =>
    items.map((it) =>
      it.type === 'note' && it.id === id ? { ...it, note: { ...it.note, ...patch } } : it,
    ),
  )
}

/** Optimista: campos de un recorte cambiaron sin tocar su estado → en sitio. */
export function patchRecorteInFeed(
  qc: QueryClient,
  id: string,
  patch: Partial<Recorte>,
): void {
  patchFeedItems(qc, (_meta, items) =>
    items.map((it) =>
      it.type === 'recorte' && it.id === id
        ? { ...it, recorte: { ...it.recorte, ...patch } }
        : it,
    ),
  )
}

/**
 * Optimista: un recorte cambió de estado (archivar/restaurar/promover). En cada
 * cache, si el nuevo estado sigue perteneciendo al filtro se actualiza en sitio;
 * si no, se quita. (La inserción en caches donde recién ahora encaja la resuelve
 * el refetch de `onSettled`.)
 */
export function applyRecorteStatusInFeed(
  qc: QueryClient,
  id: string,
  nextStatus: RecorteStatus,
  promotedTarget?: Recorte['promotedTarget'],
): void {
  patchFeedItems(qc, (meta, items) =>
    items.flatMap((it) => {
      if (it.type !== 'recorte' || it.id !== id) return [it]
      if (!recorteInCache(nextStatus, meta.segment, meta.recorteStatus)) return []
      return [
        {
          ...it,
          recorte: {
            ...it.recorte,
            status: nextStatus,
            ...(promotedTarget !== undefined ? { promotedTarget } : {}),
          },
        },
      ]
    }),
  )
}
