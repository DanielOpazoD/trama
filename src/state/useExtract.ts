import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useOffline } from './offline'

export function useExtract() {
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async (text: string) => {
      if (offline) {
        throw new Error(
          'La extracción por IA requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.extract(text)
    },
  })
}

export function useExtractFromImage() {
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async ({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }) => {
      if (offline) {
        throw new Error(
          'La extracción desde imagen requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.extractFromImage(imageBase64, mimeType)
    },
  })
}
