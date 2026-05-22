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

/**
 * The unified "ask" mutation that drives the universal bar.
 *
 * The bar isn't an extractor anymore — it's a conversation entrypoint that
 * also extracts when the input looks like a capture. The endpoint decides.
 */
export function useAsk() {
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async (input: {
      text: string
      view?: string | null
      selectedEntityId?: string | null
      threadId?: string | null
    }) => {
      if (offline) {
        throw new Error('Requiere conexión al backend. Estás en modo local.')
      }
      return api.ask(input.text, {
        view: input.view,
        selectedEntityId: input.selectedEntityId,
        threadId: input.threadId,
      })
    },
  })
}
