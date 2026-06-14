/**
 * Consultas (Fase 4) — hooks de la vista "Consultas / pregúntale a tu trama".
 *
 * `useAskQuery`/`useRunQuery` son acciones imperativas (mutations): disparan
 * una llamada al motor cuando el usuario pregunta o corre una consulta. Las
 * consultas guardadas siguen el patrón query+mutaciones-que-invalidan del resto
 * (ver useFavoritos).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import {
  queryApi,
  type NlQueryResult,
  type QueryInput,
  type QueryResult,
} from '../api/query'
import { queryKeys } from './queryClient'

export function useSavedQueries() {
  return useQuery({
    queryKey: queryKeys.savedQueries,
    queryFn: () => api.listSavedQueries(),
  })
}

export function useSaveQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; query: QueryInput; description?: string }) =>
      api.createSavedQuery(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedQueries }),
  })
}

export function useDeleteSavedQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteSavedQuery(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedQueries }),
  })
}

/** Pregunta en lenguaje natural → AST interpretado + resultados. */
export function useAskQuery() {
  return useMutation<NlQueryResult, Error, string>({
    mutationFn: (q: string) => queryApi.ask(q),
  })
}

/** Ejecuta un AST directo (al correr una consulta guardada). */
export function useRunQuery() {
  return useMutation<QueryResult, Error, QueryInput>({
    mutationFn: (input: QueryInput) => queryApi.run(input),
  })
}
