import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { storage } from '../storage'
import type { Entity, ExportPayload, ImportResult, Quote, Relationship } from '../types'
import { queryKeys } from './queryClient'
import { useOffline } from './offline'

function nowIso(): string {
  return new Date().toISOString()
}

export function useExport(): () => Promise<ExportPayload> {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return async () => {
    if (offline) {
      const entities = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
      const relationships =
        queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
      const quotes = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []
      return {
        version: 1,
        exportedAt: nowIso(),
        entities,
        relationships,
        quotes,
      }
    }
    return api.exportAll()
  }
}

export function useImport(): (payload: ExportPayload) => Promise<ImportResult> {
  const queryClient = useQueryClient()
  const { offline } = useOffline()

  return async (payload) => {
    if (offline) {
      const entities = queryClient.getQueryData<Entity[]>(queryKeys.entities) ?? []
      const relationships =
        queryClient.getQueryData<Relationship[]>(queryKeys.relationships) ?? []
      const quotes = queryClient.getQueryData<Quote[]>(queryKeys.quotes) ?? []

      const existingEntityIds = new Set(entities.map((e) => e.id))
      const existingRelIds = new Set(relationships.map((r) => r.id))
      const existingQuoteIds = new Set(quotes.map((q) => q.id))
      const newEntities = payload.entities.filter((e) => !existingEntityIds.has(e.id))
      const newRels = payload.relationships.filter((r) => !existingRelIds.has(r.id))
      const newQuotes = payload.quotes.filter((q) => !existingQuoteIds.has(q.id))

      const updatedEntities = [...newEntities, ...entities]
      const updatedRels = [...newRels, ...relationships]
      const updatedQuotes = [...newQuotes, ...quotes]

      storage.saveEntities(updatedEntities)
      storage.saveRelationships(updatedRels)
      storage.saveQuotes(updatedQuotes)
      queryClient.setQueryData(queryKeys.entities, updatedEntities)
      queryClient.setQueryData(queryKeys.relationships, updatedRels)
      queryClient.setQueryData(queryKeys.quotes, updatedQuotes)
      return {
        imported: newEntities.length + newRels.length + newQuotes.length,
        skipped: 0,
        failed: [],
      }
    }

    const result = await api.importAll(payload)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.entities }),
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships }),
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes }),
    ])
    return result
  }
}
