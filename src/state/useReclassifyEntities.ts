import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useOffline } from './offline'

export function useReclassifyEntities() {
  const { offline } = useOffline()
  return useMutation({
    // η1: reclassify propone cambios de tipo — el usuario aprueba uno
    // por uno. No persiste sin accept. Silent para que el indicador
    // global no diga "guardando" mientras la IA piensa.
    meta: { silent: true },
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
