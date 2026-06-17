/**
 * Recortes — hooks de la bandeja de capturas web. Patrón de la casa
 * (useNotes): query simple + mutaciones que invalidan, DELETE con toast
 * accionable de Deshacer (restore por deleted_at exacto), y promoción
 * que invalida también la colección destino para que el objeto nuevo
 * aparezca sin recargar.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type PromoteRecorteInput, type Recorte } from '../api'
import { queryKeys } from './queryClient'
import {
  applyRecorteStatusInFeed,
  patchRecorteInFeed,
  restoreNotasFeed,
  snapshotNotasFeed,
} from './notasFeedCache'
import { useToast } from './toast'

/**
 * Reversa de la promoción (Deshacer del triage de 1 toque): soft-borra el
 * objeto destino y devuelve el recorte a 'pending'. Como no sabemos a priori
 * qué colección tocó la promoción, invalidamos todas las afectadas.
 */
export function useUnpromoteRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.unpromoteRecorte(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
      qc.invalidateQueries({ queryKey: queryKeys.quotes })
      qc.invalidateQueries({ queryKey: queryKeys.quotesInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.entities })
      qc.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.counts })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

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
  | { kind: 'video'; file: File; note?: string | null }

/**
 * Enriquecimiento diferido de un recorte-enlace: pide los metadatos OG y, si
 * trae algo útil, parchea el recorte. Best-effort — si falla, queda el enlace
 * pelado. Reusa el endpoint server-side endurecido contra SSRF.
 */
async function enrichLinkRecorte(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  url: string,
) {
  try {
    const preview = await api.momentoUrlPreview(url)
    if (preview.title || preview.description || preview.author || preview.image) {
      await api.updateRecorte(id, {
        text: preview.description || preview.title || undefined,
        sourceTitle: preview.title ?? undefined,
        sourceAuthor: preview.author ?? undefined,
        imageUrl: preview.image ?? undefined,
      })
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
    }
  } catch {
    /* enriquecimiento opcional; el enlace pelado ya quedó guardado */
  }
  // Tras el enriquecimiento (que pudo dejar la image_url del og:image), pedimos
  // al servidor que cachee la miniatura en nuestro blob propio. Corre también
  // para videos de YouTube aunque el preview no haya traído nada (la miniatura
  // se deriva del id server-side). Best-effort: si no cachea, queda la externa.
  await cacheRecorteThumbnail(qc, id)
}

/**
 * Dispara la caché server-side de la miniatura del recorte y, si el servidor la
 * guardó en nuestro blob, invalida la bandeja + el feed para que la tarjeta
 * pase a renderizar desde el blob propio (`image_key`). Best-effort y silencioso.
 */
async function cacheRecorteThumbnail(qc: ReturnType<typeof useQueryClient>, id: string) {
  try {
    const result = await api.cacheRecorteThumbnail(id)
    if (result.cached) {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
    }
  } catch {
    /* caché opcional; la tarjeta sigue con la miniatura externa/derivada */
  }
}

export function useCreateRecorte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaptureInput) => {
      if (input.kind === 'link') {
        // Optimista: creamos el recorte ya (enlace pelado) para que la tarjeta
        // aparezca al instante; los metadatos OG llegan después y se parchean
        // en segundo plano (ver onSuccess). Antes esto esperaba hasta 5s al
        // fetch antes de mostrar nada.
        return api.createRecorte({
          text: input.url,
          sourceUrl: input.url,
          sourceTitle: input.title ?? null,
          captureMode: 'html',
        })
      }
      const { imageKey } = await api.uploadRecorteMedia(input.file)
      if (input.kind === 'video') {
        return api.createRecorte({
          text: 'Video guardado',
          imageKey,
          note: input.note ?? null,
          captureMode: 'video',
        })
      }
      return api.createRecorte({
        text: 'Imagen guardada',
        imageKey,
        note: input.note ?? null,
        captureMode: 'image',
      })
    },
    onSuccess: (recorte, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
      qc.invalidateQueries({ queryKey: queryKeys.counts })
      qc.invalidateQueries({ queryKey: queryKeys.home })
      // El enriquecimiento corre tras mostrar la tarjeta, sin bloquear.
      if (input.kind === 'link') void enrichLinkRecorte(qc, recorte.id, input.url)
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
    // Optimista: archivar/restaurar mueve la captura de bucket al instante (sin
    // parpadeo entre filtros de estado), tanto en la lista cruda como en el feed
    // paginado; rollback a ambos snapshots si falla.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.recortes })
      await qc.cancelQueries({ queryKey: queryKeys.notasFeed })
      const prev = qc.getQueryData<Recorte[]>(queryKeys.recortes)
      if (prev) {
        qc.setQueryData<Recorte[]>(
          queryKeys.recortes,
          prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        )
      }
      const feedSnap = snapshotNotasFeed(qc)
      // Si cambia el estado, recalculamos membresía por cache; si no, en sitio.
      if (patch.status) applyRecorteStatusInFeed(qc, id, patch.status)
      else patchRecorteInFeed(qc, id, patch)
      return { prev, feedSnap }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.recortes, ctx.prev)
      if (ctx?.feedSnap) restoreNotasFeed(qc, ctx.feedSnap)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
    },
  })
}

export function useDeleteRecorte() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.removeRecorte(id),
    onSuccess: ({ deletedAt }, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
      if (deletedAt) {
        toast.show({
          message: 'Recorte eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreRecorte(id, deletedAt)
              qc.invalidateQueries({ queryKey: queryKeys.recortes })
              qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
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
    // Optimista: la captura pasa a 'promoted' con su destino al instante, así
    // sale de Pendientes y muestra «→ destino» sin esperar al servidor.
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: queryKeys.recortes })
      await qc.cancelQueries({ queryKey: queryKeys.notasFeed })
      const prev = qc.getQueryData<Recorte[]>(queryKeys.recortes)
      if (prev) {
        qc.setQueryData<Recorte[]>(
          queryKeys.recortes,
          prev.map((r) =>
            r.id === id ? { ...r, status: 'promoted', promotedTarget: input.target } : r,
          ),
        )
      }
      const feedSnap = snapshotNotasFeed(qc)
      applyRecorteStatusInFeed(qc, id, 'promoted', input.target)
      return { prev, feedSnap }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.recortes, ctx.prev)
      if (ctx?.feedSnap) restoreNotasFeed(qc, ctx.feedSnap)
    },
    onSuccess: (_data, { input }) => {
      const { target } = input
      qc.invalidateQueries({ queryKey: queryKeys.recortes })
      qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
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
