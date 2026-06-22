import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import type {
  BibliotecaListParams,
  BibliotecaListResult,
  LibraryItem,
  LibraryItemKind,
  LibraryItemLink,
  LibraryLinkTargetKind,
} from '../types/biblioteca'
import { queryKeys } from './queryClient'
import { invalidateBibliotecaSurface } from './cacheInvalidation'
import { snapshotQueries, restoreQueriesSnapshot } from './cacheOptimistic'
import { useToast } from './toast'

/**
 * Hook de TanStack Query para la Biblioteca — el read-model unificado de
 * archivos (adjuntos, fotos, recortes, PDFs…). Espeja el patrón de
 * {@link useInfiniteMomentosQuery}: paginación por cursor (offset opaco),
 * una queryKey que incluye los filtros (tab/q/orden) para que cada
 * combinación tenga su propia cache + paginación.
 *
 * Los filtros que viajan a la URL/servidor son `tab`, `q`, `orden` y —desde
 * PR3, vía el popover— `tipo` (familia de archivo) y `fuente` (procedencia).
 */
const BIBLIOTECA_INFINITE = queryKeys.bibliotecaInfinite

/**
 * Filtros que controla la vista (pestaña, búsqueda, orden, popover y papelera).
 * `incluyeEliminados` activa la vista "Eliminados recientemente" (PR4): pide al
 * read-model los items ocultos a nivel Biblioteca en vez de los visibles.
 */
export type BibliotecaListInput = Pick<
  BibliotecaListParams,
  'tab' | 'q' | 'orden' | 'tipo' | 'fuente' | 'tag' | 'incluyeEliminados'
>

export function useBibliotecaList(input: BibliotecaListInput) {
  const { tab, q, orden, tipo, fuente, tag, incluyeEliminados } = input
  return useInfiniteQuery<BibliotecaListResult>({
    // El prefijo `biblioteca` invalida todas las variantes de filtro; los
    // segmentos siguientes separan cada combinación de filtros en su cache
    // (la papelera entra como segmento para no mezclar con la lista normal).
    queryKey: [
      ...BIBLIOTECA_INFINITE,
      tab ?? 'todo',
      q ?? '',
      orden ?? 'modificado-desc',
      tipo ?? '',
      fuente ?? '',
      tag ?? '',
      incluyeEliminados ? 'eliminados' : 'activos',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.biblioteca.list({
        tab,
        q,
        orden,
        tipo,
        fuente,
        tag,
        incluyeEliminados,
        cursor: pageParam as string | undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/** Aplana las páginas de la query infinita a una lista única de items. */
export function flattenBibliotecaItems(
  data: { pages: BibliotecaListResult[] } | undefined,
): LibraryItem[] {
  return data?.pages.flatMap((p) => p.items) ?? []
}

// ---------------------------------------------------------------------------
// Mutaciones (PR4): renombrar, eliminar (papelera) y restaurar.
//
// Optimistas sobre TODAS las variantes de filtro de la query infinita (prefijo
// `['biblioteca', 'infinite']`), porque la combinación de filtros activa es
// dinámica. Tras conciliar con el servidor invalidamos la misma superficie.
// Patrón espejo de `useDeleteMomento` (delete + toast Deshacer que restaura).
// ---------------------------------------------------------------------------

/** Forma cacheada de la query infinita (lo que toca el optimistic update). */
type BibliotecaInfiniteData = {
  pages: BibliotecaListResult[]
  pageParams: unknown[]
}

const BIBLIOTECA_PREFIX = { queryKey: BIBLIOTECA_INFINITE }

/** Identidad estable de un item dentro de la cache. */
function sameItem(a: LibraryItem, kind: LibraryItemKind, itemId: string): boolean {
  return a.kind === kind && a.itemId === itemId
}

/** Reescribe los items de cada página de cada query cacheada con `mapPages`. */
function patchBibliotecaPages(
  data: BibliotecaInfiniteData | undefined,
  mapItems: (items: LibraryItem[]) => LibraryItem[],
): BibliotecaInfiniteData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: mapItems(page.items) })),
  }
}

export function useRenameLibraryItem() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: {
      kind: LibraryItemKind
      itemId: string
      displayTitle: string
    }) => api.biblioteca.rename(input.kind, input.itemId, input.displayTitle),
    onMutate: async ({ kind, itemId, displayTitle }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      const title = displayTitle.trim()
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.map((item) => (sameItem(item, kind, itemId) ? { ...item, title } : item)),
        ),
      )
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo renombrar',
        tone: 'error',
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

export function useSetLibraryItemDeleted() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { kind: LibraryItemKind; itemId: string; deleted: boolean }) =>
      api.biblioteca.setDeleted(input.kind, input.itemId, input.deleted),
    onMutate: async ({ kind, itemId, deleted }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      // Optimista: al eliminar/restaurar el item desaparece de la vista actual
      // (la lista normal lo oculta al eliminar; la papelera al restaurar). En
      // ambos casos lo sacamos de todas las páginas cacheadas; la invalidación
      // posterior lo reubica en la vista correcta.
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.filter((item) => !sameItem(item, kind, itemId)),
        ),
      )
      return { snapshot, deleted }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo completar la acción',
        tone: 'error',
      })
    },
    onSuccess: (_data, { kind, itemId, deleted }) => {
      // Confirmar-por-deshacer: solo al ELIMINAR ofrecemos restaurar (el
      // restore desde la papelera no necesita su propio undo).
      if (!deleted) return
      toast.show({
        message: 'Archivo eliminado',
        tone: 'success',
        durationMs: 10_000,
        action: {
          label: 'Deshacer',
          onAction: async () => {
            await api.biblioteca.setDeleted(kind, itemId, false)
            invalidateBibliotecaSurface(queryClient)
          },
        },
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

/** Reemplaza las etiquetas de un item (optimista sobre `item.tags`). */
export function useSetLibraryItemTags() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { kind: LibraryItemKind; itemId: string; tags: string[] }) =>
      api.biblioteca.setTags(input.kind, input.itemId, input.tags),
    onMutate: async ({ kind, itemId, tags }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.map((item) => (sameItem(item, kind, itemId) ? { ...item, tags } : item)),
        ),
      )
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message:
          err instanceof Error ? err.message : 'No se pudieron guardar las etiquetas',
        tone: 'error',
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

/**
 * Fija o suelta un item (optimista sobre `item.pinned`). El reordenamiento
 * fijados-primero lo hace el servidor; la invalidación reconcilia el orden.
 */
export function useSetLibraryItemPinned() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { kind: LibraryItemKind; itemId: string; pinned: boolean }) =>
      api.biblioteca.setPinned(input.kind, input.itemId, input.pinned),
    onMutate: async ({ kind, itemId, pinned }) => {
      await queryClient.cancelQueries(BIBLIOTECA_PREFIX)
      const snapshot = snapshotQueries<BibliotecaInfiniteData>(
        queryClient,
        BIBLIOTECA_PREFIX,
      )
      queryClient.setQueriesData<BibliotecaInfiniteData>(BIBLIOTECA_PREFIX, (data) =>
        patchBibliotecaPages(data, (items) =>
          items.map((item) =>
            sameItem(item, kind, itemId) ? { ...item, pinned } : item,
          ),
        ),
      )
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) restoreQueriesSnapshot(queryClient, context.snapshot)
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo fijar',
        tone: 'error',
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

// ---------------------------------------------------------------------------
// Subida (PR1 de subida): sube uno o varios archivos directo a la Biblioteca.
// No es optimista (no conocemos el id ni la miniatura hasta que el servidor
// responde); al asentar invalidamos la superficie para que la lista los traiga.
// ---------------------------------------------------------------------------

/** Sube archivos a la Biblioteca y refresca la lista. Toast en éxito/error. */
export function useUploadLibraryFiles() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (files: { file: File; takenAt?: string }[]) =>
      api.biblioteca.upload(files),
    onSuccess: ({ items, failed }) => {
      const count = items.length
      if (count > 0) {
        toast.show({
          message: count === 1 ? 'Archivo subido' : `${count} archivos subidos`,
          tone: 'success',
        })
      }
      // Éxito parcial: avisamos de los que no entraron (el cliente puede
      // reintentar solo esos, sin duplicar los que sí subieron).
      if (failed.length > 0) {
        toast.show({
          message:
            failed.length === 1
              ? `No se pudo subir "${failed[0]!.name}"`
              : `${failed.length} archivos no se pudieron subir`,
          tone: 'error',
        })
      }
    },
    onError: (err) => {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudieron subir los archivos',
        tone: 'error',
      })
    },
    onSettled: () => invalidateBibliotecaSurface(queryClient),
  })
}

// ---------------------------------------------------------------------------
// Conexiones (PR-C): listar / agregar / quitar vínculos de un item con objetos
// de dominio (entidad, nota, momento). Query por item; las mutaciones invalidan
// esa query (lista chica, refetch barato).
// ---------------------------------------------------------------------------

/** Conexiones ("aparece en") de un item; deshabilitable mientras no haya item. */
export function useLibraryItemLinks(
  kind: LibraryItemKind | null,
  itemId: string | null,
  enabled = true,
) {
  return useQuery<LibraryItemLink[]>({
    queryKey: queryKeys.bibliotecaLinks(kind ?? '', itemId ?? ''),
    queryFn: () => api.biblioteca.listLinks(kind as LibraryItemKind, itemId as string),
    enabled: enabled && kind !== null && itemId !== null,
  })
}

type LinkMutationInput = {
  kind: LibraryItemKind
  itemId: string
  targetKind: LibraryLinkTargetKind
  targetId: string
}

export function useAddLibraryItemLink() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: LinkMutationInput) =>
      api.biblioteca.addLink(input.kind, input.itemId, input.targetKind, input.targetId),
    onError: (err) => {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo conectar',
        tone: 'error',
      })
    },
    onSettled: (_d, _e, { kind, itemId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bibliotecaLinks(kind, itemId) })
    },
  })
}

export function useRemoveLibraryItemLink() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: LinkMutationInput) =>
      api.biblioteca.removeLink(
        input.kind,
        input.itemId,
        input.targetKind,
        input.targetId,
      ),
    onError: (err) => {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo quitar la conexión',
        tone: 'error',
      })
    },
    onSettled: (_d, _e, { kind, itemId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bibliotecaLinks(kind, itemId) })
    },
  })
}
