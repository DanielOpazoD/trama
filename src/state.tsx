import { useMemo, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type {
  Entity,
  ExportPayload,
  ExtractionProposal,
  Origin,
  Quote,
  Relationship,
} from './types'
import { api } from './api'
import { storage } from './storage'
import { queryClient } from './state/queryClient'
import { OfflineContext } from './state/offline'
import { useEntitiesQuery, useAddEntity, useUpdateEntityPosition, useDeleteEntity } from './state/useEntities'
import { useRelationshipsQuery, useAddRelationship, useDeleteRelationship } from './state/useRelationships'
import { useQuotesQuery, useAddQuote, useDeleteQuote } from './state/useQuotes'
import { createContext, useContext } from 'react'

type EntityInput = Omit<Entity, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
}
type RelationshipInput = Omit<Relationship, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
}
type QuoteInput = Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & {
  origin?: Origin
}

type State = {
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
  loading: boolean
  error: string | null
  offline: boolean
  addEntity: (data: EntityInput) => Promise<Entity | null>
  updateEntityPosition: (id: string, x: number, y: number) => void
  deleteEntity: (id: string) => Promise<void>
  addRelationship: (data: RelationshipInput) => Promise<Relationship | null>
  deleteRelationship: (id: string) => Promise<void>
  addQuote: (data: QuoteInput) => Promise<Quote | null>
  deleteQuote: (id: string) => Promise<void>
  extract: (text: string) => Promise<ExtractionProposal>
  exportAll: () => Promise<ExportPayload>
  importAll: (payload: ExportPayload) => Promise<number>
}

const Ctx = createContext<State | null>(null)

function nowIso(): string {
  return new Date().toISOString()
}

function InnerProvider({ children }: { children: ReactNode }) {
  const entitiesQuery = useEntitiesQuery()
  const relationshipsQuery = useRelationshipsQuery()
  const quotesQuery = useQuotesQuery()

  const addEntity = useAddEntity()
  const updateEntityPosition = useUpdateEntityPosition()
  const deleteEntityMut = useDeleteEntity()

  const addRelationshipMut = useAddRelationship()
  const deleteRelationshipMut = useDeleteRelationship()

  const addQuoteMut = useAddQuote()
  const deleteQuoteMut = useDeleteQuote()

  const entities = entitiesQuery.data ?? []
  const relationships = relationshipsQuery.data ?? []
  const quotes = quotesQuery.data ?? []
  const loading = entitiesQuery.isLoading || relationshipsQuery.isLoading || quotesQuery.isLoading
  const error =
    addEntity.error?.message ??
    deleteEntityMut.error?.message ??
    addRelationshipMut.error?.message ??
    deleteRelationshipMut.error?.message ??
    addQuoteMut.error?.message ??
    deleteQuoteMut.error?.message ??
    null

  const { offline } = useContext(OfflineContext)

  const value = useMemo<State>(
    () => ({
      entities,
      relationships,
      quotes,
      loading,
      error,
      offline,
      addEntity: async (data) => {
        try {
          return await addEntity.mutateAsync(data)
        } catch {
          return null
        }
      },
      updateEntityPosition,
      deleteEntity: async (id) => {
        await deleteEntityMut.mutateAsync(id).catch(() => undefined)
      },
      addRelationship: async (data) => {
        try {
          return await addRelationshipMut.mutateAsync(data)
        } catch {
          return null
        }
      },
      deleteRelationship: async (id) => {
        await deleteRelationshipMut.mutateAsync(id).catch(() => undefined)
      },
      addQuote: async (data) => {
        try {
          return await addQuoteMut.mutateAsync(data)
        } catch {
          return null
        }
      },
      deleteQuote: async (id) => {
        await deleteQuoteMut.mutateAsync(id).catch(() => undefined)
      },
      extract: async (text) => {
        if (offline) {
          throw new Error(
            'La extracción por IA requiere conexión al backend. Estás en modo local.',
          )
        }
        return api.extract(text)
      },
      exportAll: async () => {
        if (offline) {
          return {
            version: 1,
            exportedAt: nowIso(),
            entities,
            relationships,
            quotes,
          }
        }
        return api.exportAll()
      },
      importAll: async (payload) => {
        if (offline) {
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
          queryClient.setQueryData(['entities'], updatedEntities)
          queryClient.setQueryData(['relationships'], updatedRels)
          queryClient.setQueryData(['quotes'], updatedQuotes)
          return newEntities.length + newRels.length + newQuotes.length
        }
        const result = await api.importAll(payload)
        await Promise.all([
          entitiesQuery.refetch(),
          relationshipsQuery.refetch(),
          quotesQuery.refetch(),
        ])
        return result.imported
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entities, relationships, quotes, loading, error, offline],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function StateProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false)
  const offlineCtxValue = useMemo(() => ({ offline, setOffline }), [offline])

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineContext.Provider value={offlineCtxValue}>
        <InnerProvider>{children}</InnerProvider>
      </OfflineContext.Provider>
    </QueryClientProvider>
  )
}

export function useTrama(): State {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrama must be used inside StateProvider')
  return ctx
}
