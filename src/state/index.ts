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
  useDeleteEntity,
} from './useEntities'
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
export { useExport, useImport } from './useExportImport'
