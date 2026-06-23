/**
 * Tests del hook de Entidades. Cubre los flujos optimistic críticos:
 *   - useAddEntity: insert temp con rollback en error
 *   - useUpdateEntity: patch en cache + rollback
 *   - useDeleteEntity: filtro local + cascade a relaciones y citas
 *
 * Patrón espejo de useRelationships.test.tsx — mismo wrapper con
 * OfflineContext + ToastProvider + QueryClient.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider, useToast } from './toast'
import { queryKeys } from './queryClient'
import {
  useAddEntity,
  useEntitiesQuery,
  useUpdateEntity,
  useUpdateEntityType,
  useDeleteEntity,
  useVoiceOfEntity,
} from './useEntities'
import * as apiModule from '../api'
import * as demoModule from '../lib/demo'
import { storage } from '../storage'
import type { Entity, Relationship, Quote } from '../types'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrapWith(qc: QueryClient, offline = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

const REAL_ENTITY: Entity = {
  id: 'ent-real',
  name: 'Borges',
  type: 'escritor',
  year: 1899,
  description: undefined,
  origin: { kind: 'manual' },
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
} as Entity

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('useAddEntity — optimistic', () => {
  it('inserta una entidad temporal en cache antes del response', async () => {
    let resolveServer: (e: Entity) => void = () => {}
    const serverPromise = new Promise<Entity>((r) => (resolveServer = r))
    vi.spyOn(apiModule.api, 'createEntity').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])

    const { result } = renderHook(() => useAddEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({
        name: 'Borges',
        type: 'escritor',
      })
    })

    // Mientras el server no responde, debe haber 1 row temp.
    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toMatch(/^__optimistic_/)
      expect(list[0]!.name).toBe('Borges')
    })

    // Server responde con el real, y el temp se reemplaza.
    act(() => resolveServer(REAL_ENTITY))
    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toBe('ent-real')
    })
  })

  it('rollback al snapshot anterior si el server rechaza', async () => {
    const previous: Entity[] = [REAL_ENTITY]
    vi.spyOn(apiModule.api, 'createEntity').mockRejectedValue(new Error('Server 500'))

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, previous)

    const { result } = renderHook(() => useAddEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ name: 'nuevo', type: 'libro' })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list).toEqual(previous)
    })
  })
})

describe('useUpdateEntity — optimistic patch', () => {
  it('aplica el patch en cache inmediatamente; reemplaza por el real en éxito', async () => {
    let resolveServer: (e: Entity) => void = () => {}
    const serverPromise = new Promise<Entity>((r) => (resolveServer = r))
    vi.spyOn(apiModule.api, 'updateEntity').mockReturnValue(serverPromise)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => useUpdateEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'ent-real', patch: { name: 'Jorge Luis Borges' } })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list[0]!.name).toBe('Jorge Luis Borges')
    })

    const updated = { ...REAL_ENTITY, name: 'Jorge Luis Borges' }
    act(() => resolveServer(updated as Entity))
    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list[0]!.name).toBe('Jorge Luis Borges')
    })
  })

  it('rollback si el server rechaza el update', async () => {
    vi.spyOn(apiModule.api, 'updateEntity').mockRejectedValue(new Error('fail'))
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => useUpdateEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'ent-real', patch: { name: 'X' } })
    })
    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list[0]!.name).toBe('Borges') // rollback al original
    })
  })
})

describe('useUpdateEntityType — optimistic', () => {
  it('actualiza el type en cache tras el éxito del server', async () => {
    vi.spyOn(apiModule.api, 'updateEntityType').mockResolvedValue(undefined)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => useUpdateEntityType(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'ent-real', type: 'poeta' })
    })

    await waitFor(() => {
      const list = qc.getQueryData<Entity[]>(queryKeys.entities) ?? []
      expect(list[0]!.type).toBe('poeta')
    })
    expect(apiModule.api.updateEntityType).toHaveBeenCalledWith('ent-real', 'poeta')
  })
})

describe('useDeleteEntity — cascade', () => {
  it('borra de cache de entities + cascadea filter a relationships y quotes', async () => {
    vi.spyOn(apiModule.api, 'deleteEntity').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteEntity>>)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [
      {
        id: 'r1',
        fromId: 'ent-real',
        toId: 'ent-other',
        type: 'asociado_con',
      } as Relationship,
      {
        id: 'r2',
        fromId: 'ent-other',
        toId: 'ent-foo',
        type: 'asociado_con',
      } as Relationship,
    ])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [
      { id: 'q1', entityId: 'ent-real', text: 'cita 1' } as Quote,
      { id: 'q2', entityId: 'ent-other', text: 'cita 2' } as Quote,
    ])

    const { result } = renderHook(() => useDeleteEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate('ent-real')
    })

    await waitFor(() => {
      expect(qc.getQueryData<Entity[]>(queryKeys.entities)).toEqual([])
      expect(qc.getQueryData<Relationship[]>(queryKeys.relationships)).toHaveLength(1)
      expect(qc.getQueryData<Relationship[]>(queryKeys.relationships)![0]!.id).toBe('r2')
      expect(qc.getQueryData<Quote[]>(queryKeys.quotes)).toHaveLength(1)
      expect(qc.getQueryData<Quote[]>(queryKeys.quotes)![0]!.id).toBe('q2')
    })
  })
})

describe('invalidación de queries', () => {
  function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.map(([filters]) => filters?.queryKey)
  }

  it('useAddEntity invalida la superficie completa de creación', async () => {
    vi.spyOn(apiModule.api, 'createEntity').mockResolvedValue(REAL_ENTITY)
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])
    const invalidateSpy = vi
      .spyOn(qc, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve(undefined))

    const { result } = renderHook(() => useAddEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ name: 'Borges', type: 'escritor' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.entitiesInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
    ])
  })

  it('useUpdateEntity invalida lista infinita, home, atlas y cronología', async () => {
    vi.spyOn(apiModule.api, 'updateEntity').mockResolvedValue({
      ...REAL_ENTITY,
      name: 'Jorge Luis Borges',
    } as Entity)
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])
    const invalidateSpy = vi
      .spyOn(qc, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve(undefined))

    const { result } = renderHook(() => useUpdateEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'ent-real', patch: { name: 'Jorge Luis Borges' } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      queryKeys.entitiesInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
    ])
  })

  it('useDeleteEntity invalida la superficie cascadeada completa', async () => {
    vi.spyOn(apiModule.api, 'deleteEntity').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteEntity>>)
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])
    const invalidateSpy = vi
      .spyOn(qc, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve(undefined))

    const { result } = renderHook(() => useDeleteEntity(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 'ent-real', silent: true })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.entitiesInfinite,
      queryKeys.quotesInfinite,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
      queryKeys.momentosInfinite,
    ])
  })
})

describe('useDeleteEntity — undo toast', () => {
  it('muestra el toast "Deshacer" y al accionarlo restaura la entidad', async () => {
    vi.spyOn(apiModule.api, 'deleteEntity').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteEntity>>)
    const restoreSpy = vi
      .spyOn(apiModule.api, 'restoreEntity')
      .mockResolvedValue(undefined)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => ({ del: useDeleteEntity(), toast: useToast() }), {
      wrapper: wrapWith(qc),
    })
    act(() => {
      result.current.del.mutate('ent-real')
    })

    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    expect(result.current.toast.current!.action?.label).toBe('Deshacer')

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('ent-real', '2026-05-28T00:00:00Z')
  })

  it('no muestra toast cuando el delete es silent', async () => {
    vi.spyOn(apiModule.api, 'deleteEntity').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteEntity>>)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => ({ del: useDeleteEntity(), toast: useToast() }), {
      wrapper: wrapWith(qc),
    })
    act(() => {
      result.current.del.mutate({ id: 'ent-real', silent: true })
    })

    await waitFor(() => expect(result.current.del.isSuccess).toBe(true))
    expect(result.current.toast.current).toBeNull()
  })
})

describe('manejo de errores — offline', () => {
  it('useEntitiesQuery no devuelve localStorage ante error API fuera de modo demo', async () => {
    vi.spyOn(apiModule.api, 'listEntities').mockRejectedValue(new Error('server down'))
    vi.spyOn(demoModule, 'isDemoMode').mockReturnValue(false)
    const loadSpy = vi.spyOn(storage, 'loadEntities')
    const qc = makeQueryClient()

    const { result } = renderHook(() => useEntitiesQuery(), {
      wrapper: wrapWith(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('useEntitiesQuery permite localStorage solo en modo demo explícito', async () => {
    vi.spyOn(apiModule.api, 'listEntities').mockRejectedValue(
      new Error('demo backend miss'),
    )
    vi.spyOn(demoModule, 'isDemoMode').mockReturnValue(true)
    vi.spyOn(storage, 'loadEntities').mockReturnValue([REAL_ENTITY])
    const qc = makeQueryClient()

    const { result } = renderHook(() => useEntitiesQuery(), {
      wrapper: wrapWith(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([REAL_ENTITY])
  })

  it('useUpdateEntity rechaza pidiendo conexión y revierte el optimistic patch', async () => {
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])

    const { result } = renderHook(() => useUpdateEntity(), {
      wrapper: wrapWith(qc, true),
    })
    act(() => {
      result.current.mutate({ id: 'ent-real', patch: { name: 'X' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/conexión/i)
    // El onError revierte: la lista vuelve al nombre original.
    expect(qc.getQueryData<Entity[]>(queryKeys.entities)![0]!.name).toBe('Borges')
  })

  it('useVoiceOfEntity rechaza cuando offline (no llama al server)', async () => {
    const voiceSpy = vi.spyOn(apiModule.api, 'voiceOfEntity')
    const qc = makeQueryClient()

    const { result } = renderHook(() => useVoiceOfEntity(), {
      wrapper: wrapWith(qc, true),
    })
    act(() => {
      result.current.mutate({ id: 'ent-real', question: '¿qué dirías?' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/conexión/i)
    expect(voiceSpy).not.toHaveBeenCalled()
  })
})
