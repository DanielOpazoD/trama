import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Entity, Quote, Relationship } from './types'
import { api } from './api'
import { storage } from './storage'

type State = {
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
  loading: boolean
  error: string | null
  offline: boolean
  addEntity: (data: Omit<Entity, 'id' | 'createdAt'>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>
  addRelationship: (data: Omit<Relationship, 'id' | 'createdAt'>) => Promise<void>
  deleteRelationship: (id: string) => Promise<void>
  addQuote: (data: Omit<Quote, 'id' | 'createdAt'>) => Promise<void>
  deleteQuote: (id: string) => Promise<void>
}

const Ctx = createContext<State | null>(null)

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function StateProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const offlineRef = useRef(false)

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
      if (offlineRef.current) {
        const created: Entity = { ...data, id: newId(), createdAt: nowIso() }
        setEntities((prev) => [created, ...prev])
        return
      }
      try {
        const created = await api.createEntity(data)
        setEntities((prev) => [created, ...prev])
      } catch (err) {
        reportError(err)
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
      if (offlineRef.current) {
        const created: Relationship = { ...data, id: newId(), createdAt: nowIso() }
        setRelationships((prev) => [created, ...prev])
        return
      }
      try {
        const created = await api.createRelationship(data)
        setRelationships((prev) => [created, ...prev])
      } catch (err) {
        reportError(err)
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
      if (offlineRef.current) {
        const created: Quote = { ...data, id: newId(), createdAt: nowIso() }
        setQuotes((prev) => [created, ...prev])
        return
      }
      try {
        const created = await api.createQuote(data)
        setQuotes((prev) => [created, ...prev])
      } catch (err) {
        reportError(err)
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
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrama(): State {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrama must be used inside StateProvider')
  return ctx
}
