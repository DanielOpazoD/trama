import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '../../api'
import {
  useEntitiesQuery,
  useNotesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useTasksQuery,
} from '../../state'
import { queryKeys } from '../../state/queryClient'
import {
  buildExistingImportIdSets,
  buildPreview,
  type ImportPreview,
  type ParsedImportFile,
} from './dataImportPreviewModel'

const MOMENTOS_IMPORT_PREVIEW_PAGE_SIZE = 100

function useImportPreviewMomentosQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.momentosInfinite, 'import-preview-all'],
    enabled,
    queryFn: async () => {
      const items = []
      let cursor: string | null = null
      do {
        const page = await api.listMomentos({
          cursor,
          limit: MOMENTOS_IMPORT_PREVIEW_PAGE_SIZE,
        })
        items.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      return items
    },
  })
}

export function useDataPanelImportPreview(
  parsed: ParsedImportFile | null,
): ImportPreview | null {
  const enabled = parsed !== null
  const entitiesQuery = useEntitiesQuery({ enabled })
  const quotesQuery = useQuotesQuery({ enabled })
  const relationshipsQuery = useRelationshipsQuery({ enabled })
  const momentosQuery = useImportPreviewMomentosQuery(enabled)
  const notesQuery = useNotesQuery({ enabled })
  const tasksQuery = useTasksQuery({ enabled })

  const existingEntities = entitiesQuery.data ?? []
  const existingQuotes = quotesQuery.data ?? []
  const existingRelationships = relationshipsQuery.data ?? []
  const existingMomentos = momentosQuery.data ?? []
  const existingNotes = notesQuery.data ?? []
  const existingTasks = tasksQuery.data ?? []
  const previewDataPending =
    enabled &&
    [
      entitiesQuery,
      quotesQuery,
      relationshipsQuery,
      momentosQuery,
      notesQuery,
      tasksQuery,
    ].some((query) => query.isPending)

  const existingIds = useMemo(
    () =>
      buildExistingImportIdSets({
        entities: existingEntities,
        relationships: existingRelationships,
        quotes: existingQuotes,
        momentos: existingMomentos,
        notes: existingNotes,
        tasks: existingTasks,
      }),
    [
      existingEntities,
      existingRelationships,
      existingQuotes,
      existingMomentos,
      existingNotes,
      existingTasks,
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
