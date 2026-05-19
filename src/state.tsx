import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

const DEFAULT_ORIGIN: Origin = { kind: 'manual' }

export function StateProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const offlineRef = useRef(false)
  const positionSaveTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [e, r, q] = await Promise.all([
          api.listEntities(),
          api.listRelationships(),
          api.listQuotes(),
        ])
        if (cancelled) return
        setEntities(e)
        setRelationships(r)
        setQuotes(q)
      } catch {
        if (cancelled) return
        offlineRef.current = true
        setOffline(true)
        setEntities(storage.loadEntities())
        setRelationships(storage.loadRelationships())
        setQuotes(storage.loadQuotes())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (offlineRef.current) storage.saveEntities(entities)
  }, [entities])

  useEffect(() => {
    if (offlineRef.current) storage.saveRelationships(relationships)
  }, [relationships])

  useEffect(() => {
    if (offlineRef.current) storage.saveQuotes(quotes)
  }, [quotes])

  function reportError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Error desconocido')
  }

  const value: State = {
    entities,
    relationships,
    quotes,
    loading,
    error,
    offline,
    addEntity: async (data) => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
      if (offlineRef.current) {
        const created: Entity = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        setEntities((prev) => [created, ...prev])
        return created
      }
      try {
        const created = await api.createEntity(payload)
        setEntities((prev) => [created, ...prev])
        return created
      } catch (err) {
        reportError(err)
        return null
      }
    },
    updateEntityPosition: (id, x, y) => {
      // Optimistic local update.
      setEntities((prev) =>
        prev.map((entity) =>
          entity.id === id ? { ...entity, positionX: x, positionY: y } : entity,
        ),
      )
      // Debounced persist when online.
      if (!offlineRef.current) {
        if (positionSaveTimer.current !== null) {
          window.clearTimeout(positionSaveTimer.current)
        }
        positionSaveTimer.current = window.setTimeout(() => {
          api.updateEntityPosition(id, x, y).catch(reportError)
        }, 400)
      }
    },
    deleteEntity: async (id) => {
      const cascade = () => {
        setEntities((prev) => prev.filter((entity) => entity.id !== id))
        setRelationships((prev) =>
          prev.filter((rel) => rel.fromId !== id && rel.toId !== id),
        )
        setQuotes((prev) => prev.filter((quote) => quote.entityId !== id))
      }
      if (offlineRef.current) {
        cascade()
        return
      }
      try {
        await api.deleteEntity(id)
        cascade()
      } catch (err) {
        reportError(err)
      }
    },
    addRelationship: async (data) => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
      if (offlineRef.current) {
        const created: Relationship = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        setRelationships((prev) => [created, ...prev])
        return created
      }
      try {
        const created = await api.createRelationship(payload)
        setRelationships((prev) => [created, ...prev])
        return created
      } catch (err) {
        reportError(err)
        return null
      }
    },
    deleteRelationship: async (id) => {
      if (offlineRef.current) {
        setRelationships((prev) => prev.filter((rel) => rel.id !== id))
        return
      }
      try {
        await api.deleteRelationship(id)
        setRelationships((prev) => prev.filter((rel) => rel.id !== id))
      } catch (err) {
        reportError(err)
      }
    },
    addQuote: async (data) => {
      const origin = data.origin ?? DEFAULT_ORIGIN
      const payload = { ...data, origin }
      if (offlineRef.current) {
        const created: Quote = {
          ...payload,
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        setQuotes((prev) => [created, ...prev])
        return created
      }
      try {
        const created = await api.createQuote(payload)
        setQuotes((prev) => [created, ...prev])
        return created
      } catch (err) {
        reportError(err)
        return null
      }
    },
    deleteQuote: async (id) => {
      if (offlineRef.current) {
        setQuotes((prev) => prev.filter((quote) => quote.id !== id))
        return
      }
      try {
        await api.deleteQuote(id)
        setQuotes((prev) => prev.filter((quote) => quote.id !== id))
      } catch (err) {
        reportError(err)
      }
    },
    extract: async (text) => {
      if (offlineRef.current) {
        throw new Error(
          'La extracción por IA requiere conexión al backend. Estás en modo local.',
        )
      }
      return api.extract(text)
    },
    exportAll: async () => {
      if (offlineRef.current) {
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
      if (offlineRef.current) {
        // Merge by id: anything new gets added; existing is left untouched.
        const existingEntityIds = new Set(entities.map((e) => e.id))
        const existingRelIds = new Set(relationships.map((r) => r.id))
        const existingQuoteIds = new Set(quotes.map((q) => q.id))
        const newEntities = payload.entities.filter((e) => !existingEntityIds.has(e.id))
        const newRels = payload.relationships.filter((r) => !existingRelIds.has(r.id))
        const newQuotes = payload.quotes.filter((q) => !existingQuoteIds.has(q.id))
        setEntities((prev) => [...newEntities, ...prev])
        setRelationships((prev) => [...newRels, ...prev])
        setQuotes((prev) => [...newQuotes, ...prev])
        return newEntities.length + newRels.length + newQuotes.length
      }
      const result = await api.importAll(payload)
      // Refresh from server after import.
      const [e, r, q] = await Promise.all([
        api.listEntities(),
        api.listRelationships(),
        api.listQuotes(),
      ])
      setEntities(e)
      setRelationships(r)
      setQuotes(q)
      return result.imported
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrama(): State {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrama must be used inside StateProvider')
  return ctx
}
