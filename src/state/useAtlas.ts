/**
 * Bloque #5: hooks para el Atlas temático.
 *
 * - `useAtlasQuery()` lee el snapshot guardado (constelaciones + miembros
 *    vivos). Cero costo LLM — solo lectura.
 * - `useGenerateAtlas()` mutation: re-clusteriza la trama y nombra las
 *    constelaciones con IA. Es la única operación que gasta tokens, por
 *    eso vive detrás de un botón explícito ("regenerar atlas").
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { AtlasResponse } from '../api'
import { queryKeys } from './queryClient'

export function useAtlasQuery() {
  return useQuery({
    queryKey: queryKeys.atlas,
    queryFn: () => api.atlas.read(),
    // El snapshot es estable hasta que el usuario regenera.
    staleTime: 5 * 60 * 1000,
  })
}

export function useGenerateAtlas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (): Promise<AtlasResponse> => api.atlas.generate(),
    onSuccess: (next) => {
      qc.setQueryData<AtlasResponse>(queryKeys.atlas, next)
    },
  })
}
