/**
 * Recortes — hooks de la bandeja de capturas web. Patrón de la casa
 * (useNotes): query simple + mutaciones que invalidan, DELETE con toast
 * accionable de Deshacer (restore por deleted_at exacto), y promoción
 * que invalida también la colección destino para que el objeto nuevo
 * aparezca sin recargar.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type PromoteRecorteInput } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

/** Pide a la IA una sugerencia de curaduría para un recorte (no muta). */
export function useSuggestRecorte() {
  return useMutation({
    mutationFn: (id: string) => api.suggestRecorte(id),
  })
}

export function useRecortesQuery() {
  return useQuery({
    queryKey: queryKeys.recortes,
    queryFn: () => api.listRecortes(),
  })
}

/**
 * Captura unificada desde el composer de Notas. Acepta dos formas:
 *   - `{ kind: 'link', url }`  → recorte web (text = url, sourceUrl, modo 'html').
 *   - `{ kind: 'image', file }` → sube la imagen a recortes-media y crea un
 *     recorte de imagen (modo 'image') con la imageKey resultante.
 * Invalida la bandeja + contadores + Inicio para que aparezca sin recargar.
 */
export type CaptureInput =
  | { kind: 'link'; url: string; title?: string | null }
  | { kind: 'image'; file: File; note?: string | null }

export function useCreateRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaptureInput) => {
      if (input.kind === 'link') {
        // Enriquecemos el enlace con metadatos OG (título, autor, descripción,
        // imagen) reusando el endpoint server-side ya endurecido contra SSRF.
        // Nunca bloquea la captura: si no consigue nada, cae al enlace pelado.
        let preview: Awaited<ReturnType<typeof api.momentoUrlPreview>> | null = null
        try {
          preview = await api.momentoUrlPreview(input.url)
        } catch {
          preview = null
        }
        return api.createRecorte({
          text: preview?.description || preview?.title || input.url,
          sourceUrl: input.url,
          sourceTitle: preview?.title ?? input.title ?? null,
          sourceAuthor: preview?.author ?? null,
          imageUrl: preview?.image ?? null,
          captureMode: 'html',
        })
      }
      const { imageKey } = await api.uploadRecorteImage(input.file)
      return api.createRecorte({
        text: 'Imagen guardada',
        imageKey,
        note: input.note ?? null,
        captureMode: 'image',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.counts })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

export function useUpdateRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { text?: string; note?: string | null; status?: 'pending' | 'archived' }
    }) => api.updateRecorte(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recortes }),
  })
}

export function useDeleteRecorte() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.removeRecorte(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      if (deletedAt) {
        toast.show({
          message: 'Recorte eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreRecorte(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.recortes })
            },
          },
        })
      }
    },
  })
}

/** Crea el destino y registra la promoción en el servidor.
 *  Invalida recortes + la colección destino. */
export function usePromoteRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PromoteRecorteInput }) =>
      api.promoteRecorte(id, input),
    onSuccess: (_data, { input }) => {
      const { target } = input
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      if (target === 'quote') {
        qc.invalidateQueries({ queryKey: queryKeys.quotes })
        qc.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      }
      if (target === 'entity') qc.invalidateQueries({ queryKey: queryKeys.entities })
      if (target === 'momento') {
        qc.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
      }
      qc.invalidateQueries({ queryKey: queryKeys.counts })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
