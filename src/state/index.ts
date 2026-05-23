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
export { useNeighborsQuery } from './useNeighbors'
export {
  useEntitiesQuery,
  useInfiniteEntitiesQuery,
  useAddEntity,
  useUpdateEntityPosition,
  useUpdateEntityType,
  useUpdateEntity,
  useDeleteEntity,
} from './useEntities'
export { useReclassifyEntities } from './useReclassifyEntities'
export { useAISettingsQuery, useSetAITaskProvider } from './useAISettings'
export {
  useProactiveQuery,
  useGenerateProactive,
  useResolveProactive,
} from './useProactive'
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
} from './useQuotes'
export { useExtract, useExtractFromImage, useAsk } from './useExtract'
export { useSuggestRelationships } from './useSuggestRelationships'
export { useExport, useImport } from './useExportImport'
