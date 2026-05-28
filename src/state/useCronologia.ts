import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { CronologiaResponse } from '../api'

/**
 * Cronología — timeline paginado por cursor de tiempo (`before`). Cada
 * página teje las cuatro corrientes (citas/momentos/escuchas/crónicas) y
 * devuelve `nextCursor` para hojear hacia atrás. Ver
 * `netlify/functions/cronologia.mts` y `src/api/cronologia.ts`.
 */

const CRONOLOGIA_INFINITE = ['cronologia', 'infinite'] as const

export function useInfiniteCronologiaQuery() {
  return useInfiniteQuery<CronologiaResponse>({
    queryKey: CRONOLOGIA_INFINITE,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.cronologia({ before: pageParam as string | null, limit: 40 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
