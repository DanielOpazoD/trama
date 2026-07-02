import { useMemo } from 'react'
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
  const { data: existingEntities = [] } = useEntitiesQuery()
  const { data: existingQuotes = [] } = useQuotesQuery()
  const { data: existingRelationships = [] } = useRelationshipsQuery()
  const { data: existingMomentosPages } = useInfiniteMomentosQuery()
  const { data: existingNotes = [] } = useNotesQuery()
  const { data: existingTasks = [] } = useTasksQuery()

  const existingMomentos = useMemo(
    () => existingMomentosPages?.pages.flatMap((page) => page.items) ?? [],
    [existingMomentosPages],
  )

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
    if (!parsed) return null
    return buildPreview(
      parsed.payload,
      existingIds.entityIds,
      existingIds.relationshipIds,
      existingIds.quoteIds,
      existingIds.momentoIds,
      existingIds.noteIds,
      existingIds.taskIds,
    )
  }, [parsed, existingIds])
}
