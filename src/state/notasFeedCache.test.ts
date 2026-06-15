import { describe, it, expect } from 'vitest'
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { applyRecorteStatusInFeed, recorteInCache } from './notasFeedCache'
import { queryKeys } from './queryClient'
import type { Recorte, CaptureItem } from '../api'
import type { NotasFeedPage } from '../api/notasFeed'

describe('recorteInCache (membresía por filtro)', () => {
  it('el segmento escritas nunca lleva recortes', () => {
    expect(recorteInCache('pending', 'escritas', '')).toBe(false)
    expect(recorteInCache('promoted', 'escritas', 'all')).toBe(false)
  })

  it("default ('') muestra pendientes + curados, oculta archivados", () => {
    expect(recorteInCache('pending', 'todo', '')).toBe(true)
    expect(recorteInCache('promoted', 'todo', '')).toBe(true)
    expect(recorteInCache('archived', 'todo', '')).toBe(false)
  })

  it("'all' incluye los tres estados", () => {
    expect(recorteInCache('pending', 'capturas', 'all')).toBe(true)
    expect(recorteInCache('promoted', 'capturas', 'all')).toBe(true)
    expect(recorteInCache('archived', 'capturas', 'all')).toBe(true)
  })

  it('un estado explícito filtra a ese estado', () => {
    expect(recorteInCache('pending', 'capturas', 'pending')).toBe(true)
    expect(recorteInCache('promoted', 'capturas', 'pending')).toBe(false)
    expect(recorteInCache('archived', 'capturas', 'archived')).toBe(true)
  })
})

function recorteItem(id: string, status: Recorte['status']): CaptureItem {
  return {
    type: 'recorte',
    id,
    createdAt: '2026-06-10T12:00:00.000Z',
    recorte: { id, status } as unknown as Recorte,
  }
}

function seedFeed(qc: QueryClient, recorteStatus: string, item: CaptureItem) {
  const key = queryKeys.notasFeedFiltered(
    JSON.stringify({ segment: 'capturas', query: '', tag: '', day: '', recorteStatus }),
  )
  const data: InfiniteData<NotasFeedPage> = {
    pageParams: [null],
    pages: [{ items: [item], nextCursor: null }],
  }
  qc.setQueryData(key, data)
  return key
}

describe('applyRecorteStatusInFeed (optimismo de triage)', () => {
  it('quita el recorte de una cache cuyo filtro ya no lo incluye', () => {
    const qc = new QueryClient()
    const pendingKey = seedFeed(qc, 'pending', recorteItem('r1', 'pending'))

    applyRecorteStatusInFeed(qc, 'r1', 'archived')

    const data = qc.getQueryData<InfiniteData<NotasFeedPage>>(pendingKey)
    expect(data?.pages[0]?.items).toHaveLength(0)
  })

  it('actualiza en sitio el recorte donde el filtro lo sigue incluyendo', () => {
    const qc = new QueryClient()
    const allKey = seedFeed(qc, 'all', recorteItem('r1', 'pending'))

    applyRecorteStatusInFeed(qc, 'r1', 'promoted', 'quote')

    const item = qc.getQueryData<InfiniteData<NotasFeedPage>>(allKey)?.pages[0]?.items[0]
    expect(item?.type).toBe('recorte')
    if (item?.type === 'recorte') {
      expect(item.recorte.status).toBe('promoted')
      expect(item.recorte.promotedTarget).toBe('quote')
    }
  })
})
