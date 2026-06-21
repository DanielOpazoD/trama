import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api'
import type {
  BibliotecaListParams,
  BibliotecaListResult,
  LibraryItem,
} from '../types/biblioteca'
import { queryKeys } from './queryClient'

/**
 * Hook de TanStack Query para la Biblioteca — el read-model unificado de
 * archivos (adjuntos, fotos, recortes, PDFs…). Espeja el patrón de
 * {@link useInfiniteMomentosQuery}: paginación por cursor (offset opaco),
 * una queryKey que incluye los filtros (tab/q/orden) para que cada
 * combinación tenga su propia cache + paginación.
 *
 * En PR2 los únicos filtros que viajan a la URL/servidor son `tab`, `q` y
 * `orden`; `tipo`/`fuente` (popover) llegan en PR3.
 */
const BIBLIOTECA_INFINITE = queryKeys.bibliotecaInfinite

/** Filtros que controla la vista en PR2. */
export type BibliotecaListInput = Pick<BibliotecaListParams, 'tab' | 'q' | 'orden'>

export function useBibliotecaList(input: BibliotecaListInput) {
  const { tab, q, orden } = input
  return useInfiniteQuery<BibliotecaListResult>({
    // El prefijo `biblioteca` invalida todas las variantes de filtro; los
    // segmentos siguientes separan cada combinación tab/q/orden en su cache.
    queryKey: [
      ...BIBLIOTECA_INFINITE,
      tab ?? 'todo',
      q ?? '',
      orden ?? 'modificado-desc',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.biblioteca.list({
        tab,
        q,
        orden,
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
