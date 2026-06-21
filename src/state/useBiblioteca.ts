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
 * Los filtros que viajan a la URL/servidor son `tab`, `q`, `orden` y —desde
 * PR3, vía el popover— `tipo` (familia de archivo) y `fuente` (procedencia).
 */
const BIBLIOTECA_INFINITE = queryKeys.bibliotecaInfinite

/** Filtros que controla la vista (pestaña, búsqueda, orden y popover). */
export type BibliotecaListInput = Pick<
  BibliotecaListParams,
  'tab' | 'q' | 'orden' | 'tipo' | 'fuente'
>

export function useBibliotecaList(input: BibliotecaListInput) {
  const { tab, q, orden, tipo, fuente } = input
  return useInfiniteQuery<BibliotecaListResult>({
    // El prefijo `biblioteca` invalida todas las variantes de filtro; los
    // segmentos siguientes separan cada combinación de filtros en su cache.
    queryKey: [
      ...BIBLIOTECA_INFINITE,
      tab ?? 'todo',
      q ?? '',
      orden ?? 'modificado-desc',
      tipo ?? '',
      fuente ?? '',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.biblioteca.list({
        tab,
        q,
        orden,
        tipo,
        fuente,
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
