import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useOffline } from './offline'

export function useSuggestRelationships() {
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async () => {
      if (offline) {
        throw new Error(
          'La sugerencia por IA requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.suggestRelationships()
    },
  })
}
