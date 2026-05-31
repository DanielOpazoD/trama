/**
 * U-4: hooks para Crónicas.
 *
 * - `useCronicasQuery()` lista todas las crónicas del usuario.
 * - `useGenerateCronica()` mutation: dispara la generación de la
 *    crónica para (year, month). Idempotente — si ya existe, devuelve
 *    la existente sin re-llamar al LLM.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Cronica, GeneratedCronica } from '../api'
import { queryKeys } from './queryClient'

export function useCronicasQuery() {
  return useQuery({
    queryKey: queryKeys.cronicas,
    queryFn: () => api.cronicas.list(),
    // staleTime alto — las crónicas son inmutables una vez generadas.
    staleTime: 5 * 60 * 1000,
  })
}

export function useGenerateCronica() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      year,
      month,
    }: {
      year: number
      month: number
    }): Promise<GeneratedCronica> => api.cronicas.generate(year, month),
    onSuccess: (created) => {
      // Actualizar la cache con la crónica nueva (al frente).
      qc.setQueryData<Cronica[]>(queryKeys.cronicas, (prev) => {
        if (!prev) return [created]
        // Si ya está (idempotencia), reemplazar; si no, insertar al frente.
        const idx = prev.findIndex(
          (c) => c.year === created.year && c.month === created.month,
        )
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = created
          return next
        }
        return [created, ...prev]
      })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
