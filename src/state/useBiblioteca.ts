import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type {
  BibliotecaListParams,
  BibliotecaListResult,
  LibraryItem,
  LibraryItemKind,
} from '../types/biblioteca'
import { queryKeys } from './queryClient'
import { invalidateBibliotecaSurface } from './cacheInvalidation'
import { snapshotQueries, restoreQueriesSnapshot } from './cacheOptimistic'
import { useToast } from './toast'

/**
 * Hook de TanStack Query para la Biblioteca — el read-model unificado de
 * archivos (adjuntos, fotos, recortes, PDFs…). Espeja el patrón de
 * {@link useInfiniteMomentosQuery}: paginación por cursor (offset opaco),
 * una queryKey que incluye los filtros (tab/q/orden) para que cada
 * combinación tenga su propia cache + paginación.
 *
 * Los filtros que viajan a la URL/servidor son `tab`, `q`, `orden` y —desde
 * PR3, vía el popover— `tipo` (familia de archivo) y `fuente` (procedencia).
 */
const BIBLIOTECA_INFINITE = queryKeys.bibliotecaInfinite

/**
 * Filtros que controla la vista (pestaña, búsqueda, orden, popover y papelera).
 * `incluyeEliminados` activa la vista "Eliminados recientemente" (PR4): pide al
 * read-model los items ocultos a nivel Biblioteca en vez de los visibles.
 */
export type BibliotecaListInput = Pick<
  BibliotecaListParams,
  'tab' | 'q' | 'orden' | 'tipo' | 'fuente' | 'incluyeEliminados'
>

export function useBibliotecaList(input: BibliotecaListInput) {
  const { tab, q, orden, tipo, fuente, incluyeEliminados } = input
  return useInfiniteQuery<BibliotecaListResult>({
    // El prefijo `biblioteca` invalida todas las variantes de filtro; los
    // segmentos siguientes separan cada combinación de filtros en su cache
    // (la papelera entra como segmento para no mezclar con la lista normal).
    queryKey: [
      ...BIBLIOTECA_INFINITE,
      tab ?? 'todo',
      q ?? '',
      orden ?? 'modificado-desc',
      tipo ?? '',
      fuente ?? '',
      incluyeEliminados ? 'eliminados' : 'activos',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.biblioteca.list({
        tab,
        q,
        orden,
        tipo,
        fuente,
        incluyeEliminados,
        cursor: pageParam as string | undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/** Aplana las páginas de la query infinita a una lista única de items. */
export function flattenBibliotecaItems(
  data: { pages: BibliotecaListResult[] } | undefined,
): LibraryItem[] {
  return data?.pages.flatMap((p) => p.items) ?? []
}

// ---------------------------------------------------------------------------
// Mutaciones (PR4): renombrar, eliminar (papelera) y restaurar.
//
// Optimistas sobre TODAS las variantes de filtro de la query infinita (prefijo
// `['biblioteca', 'infinite']`), porque la combinación de filtros activa es
// dinámica. Tras conciliar con el servidor invalidamos la misma superficie.
// Patrón espejo de `useDeleteMomento` (delete + toast Deshacer que restaura).
// ---------------------------------------------------------------------------

/** Forma cacheada de la query infinita (lo que toca el optimistic update). */
type BibliotecaInfiniteData = {
  pages: BibliotecaListResult[]
  pageParams: unknown[]
}

const BIBLIOTECA_PREFIX = { queryKey: BIBLIOTECA_INFINITE }

/** Identidad estable de un item dentro de la cache. */
function sameItem(a: LibraryItem, kind: LibraryItemKind, itemId: string): boolean {
  return a.kind === kind && a.itemId === itemId
}

/** Reescribe los items de cada página de cada query cacheada con `mapPages`. */
function patchBibliotecaPages(
  data: BibliotecaInfiniteData | undefined,
  mapItems: (items: LibraryItem[]) => LibraryItem[],
): BibliotecaInfiniteData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: mapItems(page.items) })),
  }
}

export function useRenameLibraryItem() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: {
      kind: LibraryItemKind
      itemId: string
      displayTitle: string
    }) => api.biblioteca.rename(input.kind, input.itemId, input.displayTitle),
    onMutate: async ({ kind, itemId, displayTitle }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      const title = displayTitle.trim()
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.map((item) => (sameItem(item, kind, itemId) ? { ...item, title } : item)),
        ),
      )
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo renombrar',
        tone: 'error',
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

export function useSetLibraryItemDeleted() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { kind: LibraryItemKind; itemId: string; deleted: boolean }) =>
      api.biblioteca.setDeleted(input.kind, input.itemId, input.deleted),
    onMutate: async ({ kind, itemId, deleted }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      // Optimista: al eliminar/restaurar el item desaparece de la vista actual
      // (la lista normal lo oculta al eliminar; la papelera al restaurar). En
      // ambos casos lo sacamos de todas las páginas cacheadas; la invalidación
      // posterior lo reubica en la vista correcta.
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.filter((item) => !sameItem(item, kind, itemId)),
        ),
      )
      return { snapshot, deleted }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo completar la acción',
        tone: 'error',
      })
    },
    onSuccess: (_data, { kind, itemId, deleted }) => {
      // Confirmar-por-deshacer: solo al ELIMINAR ofrecemos restaurar (el
      // restore desde la papelera no necesita su propio undo).
      if (!deleted) return
      toast.show({
        message: 'Archivo eliminado',
        tone: 'success',
        durationMs: 10_000,
        action: {
          label: 'Deshacer',
          onAction: async () => {
            await api.biblioteca.setDeleted(kind, itemId, false)
            invalidateBibliotecaSurface(queryClient)
          },
        },
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}
