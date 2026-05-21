/**
 * Public surface of the state layer.
 *
 * Components should import from here, not from individual files.
 * useTrama() — the historical aggregator — is gone; each component uses the
 * specific hook it needs. This avoids over-rendering when unrelated data changes.
 */

export { Provider } from './Provider'
export { useOffline } from './offline'
export {
  useEntitiesQuery,
  useAddEntity,
  useUpdateEntityPosition,
  useUpdateEntityType,
  useDeleteEntity,
} from './useEntities'
export { useReclassifyEntities } from './useReclassifyEntities'
export {
  useRelationshipsQuery,
  useAddRelationship,
  useDeleteRelationship,
} from './useRelationships'
export {
  useQuotesQuery,
  useAddQuote,
  useDeleteQuote,
} from './useQuotes'
export { useExtract } from './useExtract'
export { useSuggestRelationships } from './useSuggestRelationships'
export { useExport, useImport } from './useExportImport'
