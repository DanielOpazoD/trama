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
import { ToastProvider } from './toast'
import { queryKeys } from './queryClient'
import {
  useAddEntity,
  useUpdateEntity,
  useDeleteEntity,
} from './useEntities'
import * as apiModule from '../api'
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
    vi.spyOn(apiModule.api, 'createEntity').mockRejectedValue(
      new Error('Server 500'),
    )

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

describe('useDeleteEntity — cascade', () => {
  it('borra de cache de entities + cascadea filter a relationships y quotes', async () => {
    vi.spyOn(apiModule.api, 'deleteEntity').mockResolvedValue({
      deletedAt: '2026-05-28T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof apiModule.api.deleteEntity>>)

    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [REAL_ENTITY])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [
      { id: 'r1', fromId: 'ent-real', toId: 'ent-other', type: 'asociado_con' } as Relationship,
      { id: 'r2', fromId: 'ent-other', toId: 'ent-foo', type: 'asociado_con' } as Relationship,
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
