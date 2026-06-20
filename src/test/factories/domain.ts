import type { InfiniteData } from '@tanstack/react-query'
import type { NotasAttachment } from '../../api/notas-attachments'
import type { NotasFeedPage } from '../../api/notasFeed'
import type { Note, Recorte } from '../../api'
import type { Momento } from '../../types/momento'

export const TEST_TIMESTAMP = '2026-06-10T12:00:00.000Z'

export function buildNota(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n-test-1',
    content: 'nota de prueba',
    title: null,
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    source: null,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    hasImages: false,
    hasAudio: false,
    ...overrides,
  }
}

export function buildRecorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r-test-1',
    text: 'recorte de prueba',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'html',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  }
}

export function buildMomento(overrides: Partial<Momento> = {}): Momento {
  return {
    id: 'm-test-1',
    kind: 'nota',
    capturedAt: TEST_TIMESTAMP,
    payload: { bodyText: 'momento de prueba' },
    note: undefined,
    origin: { kind: 'manual' },
    entityIds: [],
    ownerUserId: undefined,
    ownerDisplayName: undefined,
    ownerEmail: undefined,
    accessRole: undefined,
    shared: undefined,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  }
}

export function buildNotaAttachment(
  overrides: Partial<NotasAttachment> = {},
): NotasAttachment {
  const storageKey = overrides.storageKey ?? 'user-test/notas/a-test-1.txt'
  return {
    id: 'a-test-1',
    ownerType: 'note',
    ownerId: 'n-test-1',
    fileName: 'nota.txt',
    mimeType: 'text/plain',
    byteSize: 42,
    storageKey,
    url: `/api/notas-attachments-file/${storageKey}`,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  }
}

export function buildNotasFeedPage(
  overrides: Partial<NotasFeedPage> = {},
): NotasFeedPage {
  return {
    items: [],
    nextCursor: null,
    ...overrides,
  }
}

export function buildNotasFeedData(
  pages: NotasFeedPage[] = [buildNotasFeedPage()],
): InfiniteData<NotasFeedPage> {
  return {
    pages,
    pageParams: pages.map((_, index) => (index === 0 ? null : `cursor-${index}`)),
  }
}
