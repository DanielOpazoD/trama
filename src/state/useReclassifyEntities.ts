import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useOffline } from './offline'

export function useReclassifyEntities() {
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async () => {
      if (offline) {
        throw new Error(
          'La reclasificación con IA requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.reclassifyEntities()
    },
  })
}
