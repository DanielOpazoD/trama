import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { NotasFeedPage } from '../../api/notasFeed'
import {
  buildMomento,
  buildNota,
  buildNotaAttachment,
  buildNotasFeedData,
  buildNotasFeedPage,
  buildRecorte,
} from './domain'

describe('domain test factories', () => {
  it('builds valid notas with explicit overrides and stable timestamps', () => {
    const nota = buildNota({ id: 'n-custom', title: 'Título', hasImages: true })

    expect(nota).toMatchObject({
      id: 'n-custom',
      title: 'Título',
      content: 'nota de prueba',
      tags: [],
      pinned: false,
      hasImages: true,
      hasAudio: false,
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    })
  })

  it('builds valid recortes without hiding image and promotion defaults', () => {
    const recorte = buildRecorte({
      id: 'r-custom',
      text: 'captura',
      imageKey: 'user-a/captura.webp',
      images: [{ storageKey: 'user-a/captura.webp' }],
    })

    expect(recorte).toMatchObject({
      id: 'r-custom',
      text: 'captura',
      captureMode: 'html',
      status: 'pending',
      promotedTarget: null,
      promotedId: null,
      imageKey: 'user-a/captura.webp',
      images: [{ storageKey: 'user-a/captura.webp' }],
    })
  })

  it('builds momentos and attachments with owner-related fields visible', () => {
    const momento = buildMomento({
      id: 'm-custom',
      ownerUserId: 'user-a',
      shared: true,
      accessRole: 'viewer',
    })
    const attachment = buildNotaAttachment({
      id: 'a-custom',
      ownerId: 'n-custom',
      storageKey: 'user-a/notas/a-custom.png',
    })

    expect(momento).toMatchObject({
      id: 'm-custom',
      kind: 'nota',
      payload: { bodyText: 'momento de prueba' },
      ownerUserId: 'user-a',
      shared: true,
      accessRole: 'viewer',
    })
    expect(attachment).toMatchObject({
      id: 'a-custom',
      ownerType: 'note',
      ownerId: 'n-custom',
      storageKey: 'user-a/notas/a-custom.png',
      url: '/api/notas-attachments-file/user-a/notas/a-custom.png',
    })
  })

  it('builds typed feed pages and InfiniteData without snapshots', () => {
    const nota = buildNota({ id: 'n-feed' })
    const recorte = buildRecorte({ id: 'r-feed' })
    const page = buildNotasFeedPage({
      items: [
        { type: 'note', id: nota.id, createdAt: nota.createdAt, note: nota },
        { type: 'recorte', id: recorte.id, createdAt: recorte.createdAt, recorte },
      ],
      nextCursor: 'cursor-2',
    })
    const data = buildNotasFeedData([page])

    expect(page).toSatisfy((value: NotasFeedPage) => value.items.length === 2)
    expect(data).toSatisfy(
      (value: InfiniteData<NotasFeedPage>) =>
        value.pages[0]?.nextCursor === 'cursor-2' && value.pageParams[0] === null,
    )
  })
})
