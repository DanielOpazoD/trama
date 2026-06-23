/**
 * Public surface of the state layer.
 *
 * Components should import from here, not from individual files.
 * useTrama() — the historical aggregator — is gone; each component uses the
 * specific hook it needs. This avoids over-rendering when unrelated data changes.
 */

export { Provider } from './Provider'
export { useOffline } from './offline'
export { useToast, type Toast, type ToastAction } from './toast'
export { useGlobalStatus, type GlobalStatus } from './useGlobalStatus'
export {
  useHealthAlerts,
  acknowledgeHealthAlerts,
  type HealthAlertSummary,
} from './useHealthAlerts'
export { useCountsQuery } from './useCounts'
export { useHomeQuery } from './useHome'
export { useNeighborsQuery } from './useNeighbors'
export {
  useEntitiesQuery,
  useEntityRefsCountQuery,
  useInfiniteEntitiesQuery,
  useAddEntity,
  useUpdateEntityPosition,
  useUpdateEntityType,
  useUpdateEntity,
  useDeleteEntity,
  useMergeEntities,
  useVoiceOfEntity,
} from './useEntities'
export { useReclassifyEntities } from './useReclassifyEntities'
export { useAISettingsQuery, useSetAITaskProvider } from './useAISettings'
export {
  useProactiveQuery,
  useGenerateProactive,
  useResolveProactive,
} from './useProactive'
export {
  useBibliotecaList,
  flattenBibliotecaItems,
  useRenameLibraryItem,
  useSetLibraryItemDeleted,
  useSetLibraryItemTags,
  useSetLibraryItemPinned,
  useUploadLibraryFiles,
  useLibraryItemLinks,
  useAddLibraryItemLink,
  useRemoveLibraryItemLink,
  type BibliotecaListInput,
} from './useBiblioteca'
export {
  useInfiniteMomentosQuery,
  useAddMomento,
  useUpdateMomento,
  useDeleteMomento,
  useMergeMomentos,
  useMomentoShareInvitationsQuery,
  useMomentoShareAccessQuery,
  useCreateMomentoShareInvitation,
  useRevokeMomentoShareAccess,
  useUpdateMomentoShareAccessRole,
  useRespondMomentoShareInvitation,
  useMomentoFeedbackQuery,
  useCreateMomentoComment,
  useSetMomentoReaction,
  useDeleteMomentoReaction,
  useDeleteMomentoComment,
} from './useMomentos'
export {
  useChatThreadsQuery,
  useCreateChatThread,
  useDeleteChatThread,
  useChatMessagesQuery,
  useSendChatMessage,
} from './useChat'
export {
  useRelationshipsQuery,
  useInfiniteRelationshipsQuery,
  useAddRelationship,
  useUpdateRelationship,
  useDeleteRelationship,
} from './useRelationships'
export {
  useQuotesQuery,
  useInfiniteQuotesQuery,
  useAddQuote,
  useUpdateQuote,
  useReflectQuote,
  useDeleteQuote,
  useQuoteEchoes,
  type QuoteEcho,
} from './useQuotes'
export { useExtract, useExtractFromImage, useAsk } from './useExtract'
export { useCronicasQuery, useGenerateCronica } from './useCronicas'
export {
  useNotesQuery,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  usePromoteNote,
} from './useNotes'
export {
  useRecortesQuery,
  useCreateRecorte,
  useUpdateRecorte,
  useDeleteRecorte,
  usePromoteRecorte,
  useUnpromoteRecorte,
  useSuggestRecorte,
  type CaptureInput,
} from './useRecortes'
export { useFavoritosQuery, useUpdateFavorito, useDeleteFavorito } from './useFavoritos'
export {
  useNotasFeed,
  buildNotasFeed,
  type CaptureItem,
  type NotasFeedFilter,
  type NotasFeedSegment,
  type RecorteStatusFilter,
} from './useNotasFeed'
export {
  useReadingTablesQuery,
  useCreateReadingTable,
  useUpdateReadingTable,
  useDeleteReadingTable,
} from './useReadingTables'
export {
  useTasksQuery,
  useTasksRange,
  usePendingTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from './useTasks'
export {
  usePromptsQuery,
  useCreatePrompt,
  useUpdatePrompt,
  useDuplicatePrompt,
  useMarkPromptUsed,
  useDeletePrompt,
} from './usePrompts'
export {
  useSecretsQuery,
  useCreateSecret,
  useUpdateSecret,
  useRevealSecret,
  useMarkSecretCopied,
  useDeleteSecret,
} from './useSecrets'
export {
  useNotasAttachmentsQuery,
  useUploadNotasAttachment,
  useDeleteNotasAttachment,
} from './useNotasAttachments'
export { useMonthNoteQuery, useSaveMonthNote } from './useMonthNotes'
export {
  useUserPrefs,
  useSaveUserPrefs,
  readUserPrefsMirror,
  clearUserPrefsMirror,
} from './useUserPrefs'
export { useInfiniteCronologiaQuery } from './useCronologia'
export { useAtlasQuery, useGenerateAtlas } from './useAtlas'
export { useSuggestRelationships } from './useSuggestRelationships'
export { useExport, useImport } from './useExportImport'
export {
  useTwitterBookmarksQuery,
  useXStatusQuery,
  useDeleteBookmark,
  useClassifyBookmarks,
  useXCronicaQuery,
  useGenerateXCronica,
  useDeleteXCronica,
} from './useTwitter'
