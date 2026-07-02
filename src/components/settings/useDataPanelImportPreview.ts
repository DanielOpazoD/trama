import { useEffect, useMemo } from 'react'
import {
  useEntitiesQuery,
  useInfiniteMomentosQuery,
  useNotesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useTasksQuery,
} from '../../state'
import {
  buildExistingImportIdSets,
  buildPreview,
  type ImportPreview,
  type ParsedImportFile,
} from './dataImportPreviewModel'

export function useDataPanelImportPreview(
  parsed: ParsedImportFile | null,
): ImportPreview | null {
  const enabled = parsed !== null
  const entitiesQuery = useEntitiesQuery({ enabled })
  const quotesQuery = useQuotesQuery({ enabled })
  const relationshipsQuery = useRelationshipsQuery({ enabled })
  const momentosQuery = useInfiniteMomentosQuery({ enabled })
  const notesQuery = useNotesQuery({ enabled })
  const tasksQuery = useTasksQuery({ enabled })
  const {
    data: momentosPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: momentosPending,
  } = momentosQuery

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage) {
      return
    }
    void fetchNextPage()
  }, [enabled, fetchNextPage, hasNextPage, isFetchingNextPage])

  const existingMomentos = useMemo(
    () => momentosPages?.pages.flatMap((page) => page.items) ?? [],
    [momentosPages],
  )
  const previewDataPending =
    enabled &&
    ([entitiesQuery, quotesQuery, relationshipsQuery, notesQuery, tasksQuery].some(
      (query) => query.isPending,
    ) ||
      momentosPending ||
      hasNextPage ||
      isFetchingNextPage)

  const existingIds = useMemo(
    () =>
      buildExistingImportIdSets({
        entities: entitiesQuery.data ?? [],
        relationships: relationshipsQuery.data ?? [],
        quotes: quotesQuery.data ?? [],
        momentos: existingMomentos,
        notes: notesQuery.data ?? [],
        tasks: tasksQuery.data ?? [],
      }),
    [
      entitiesQuery.data,
      relationshipsQuery.data,
      quotesQuery.data,
      existingMomentos,
      notesQuery.data,
      tasksQuery.data,
    ],
  )

  return useMemo(() => {
    if (!parsed || previewDataPending) return null
    return buildPreview(
      parsed.payload,
      existingIds.entityIds,
      existingIds.relationshipIds,
      existingIds.quoteIds,
      existingIds.momentoIds,
      existingIds.noteIds,
      existingIds.taskIds,
    )
  }, [parsed, previewDataPending, existingIds])
}
