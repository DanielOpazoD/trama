import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { CronologiaResponse } from '../api'
import { queryKeys } from './queryClient'

/**
 * Cronología — timeline paginado por cursor de tiempo (`before`). Cada
 * página teje las cuatro corrientes (citas/momentos/escuchas/crónicas) y
 * devuelve `nextCursor` para hojear hacia atrás. Ver
 * `netlify/functions/cronologia.mts` y `src/api/cronologia.ts`.
 */

export function useInfiniteCronologiaQuery() {
  return useInfiniteQuery<CronologiaResponse>({
    queryKey: queryKeys.cronologiaInfinite,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.cronologia({ before: pageParam as string | null, limit: 40 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
