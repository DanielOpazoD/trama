import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useOffline } from './offline'

export function useSuggestRelationships() {
  const { offline } = useOffline()
  return useMutation({
    // η1: descubrir IA propone — el usuario tiene que aceptar para que
    // las relaciones entren a la trama. Sin meta.silent, el indicador
    // diría "guardando…" mientras la IA piensa, lo cual es engañoso.
    meta: { silent: true },
    mutationFn: async (input?: {
      /** η2: proposals descartadas en runs previos — la IA evitará repetirlas. */
      avoidPrevious?: Array<{ fromName: string; toName: string; type: string }>
    }) => {
      if (offline) {
        throw new Error(
          'La sugerencia por IA requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.suggestRelationships({ avoidPrevious: input?.avoidPrevious })
    },
  })
}
