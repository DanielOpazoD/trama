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
import type { SavedQuery } from '../api/savedQueries'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

export function useSavedQueries() {
  return useQuery({
    queryKey: queryKeys.savedQueries,
    queryFn: () => api.listSavedQueries(),
  })
}

export function useSaveQuery() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { name: string; query: QueryInput; description?: string }) =>
      api.createSavedQuery(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedQueries })
      toast.show({ message: 'Consulta guardada', tone: 'success' })
    },
  })
}

export function useDeleteSavedQuery() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (sq: SavedQuery) => api.deleteSavedQuery(sq.id),
    onSuccess: (_void, sq) => {
      qc.invalidateQueries({ queryKey: queryKeys.savedQueries })
      // Soft-delete → ofrecemos Deshacer recreando la consulta (nuevo id; los
      // bloques embebibles llevan el AST inline, así que no dependen del id).
      toast.show({
        message: 'Consulta eliminada',
        tone: 'success',
        durationMs: 10_000,
        action: {
          label: 'Deshacer',
          onAction: async () => {
            await api.createSavedQuery({
              name: sq.name,
              query: sq.query,
              description: sq.description ?? undefined,
            })
            qc.invalidateQueries({ queryKey: queryKeys.savedQueries })
          },
        },
      })
    },
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
