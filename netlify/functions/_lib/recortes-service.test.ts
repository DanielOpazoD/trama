import { describe, expect, it } from 'vitest'
import {
  buildRecorteCreateDraft,
  buildRecortePatchDraft,
  buildRecorteSuggestionResponse,
  recorteImageSourceKeys,
} from './recortes-service.js'

describe('recortes-service', () => {
  it('maps create input to stable database values', () => {
    expect(
      buildRecorteCreateDraft({
        text: 'texto',
        sourceUrl: 'https://example.com',
        sourceTitle: undefined,
        sourceAuthor: 'Autora',
        note: null,
        imageUrl: undefined,
        imageKey: 'u/img.webp',
        captureMode: 'image',
        capturedAt: undefined,
      }),
    ).toEqual({
      text: 'texto',
      sourceUrl: 'https://example.com',
      sourceTitle: null,
      sourceAuthor: 'Autora',
      note: null,
      imageUrl: null,
      imageKey: 'u/img.webp',
      captureMode: 'image',
      capturedAt: null,
    })
  })

  it('distinguishes omitted note from explicit null in patch input', () => {
    expect(buildRecortePatchDraft({ note: undefined, status: 'archived' })).toEqual({
      text: null,
      sourceTitle: null,
      sourceAuthor: null,
      imageUrl: null,
      note: null,
      noteProvided: false,
      status: 'archived',
    })
    expect(buildRecortePatchDraft({ note: null })).toMatchObject({
      note: null,
      noteProvided: true,
    })
  })

  it('prefers multi-image event keys before the legacy single image key', () => {
    expect(
      recorteImageSourceKeys({
        imageKey: 'legacy.webp',
        images: [{ storage_key: 'a.webp' }, { storage_key: 'b.webp' }],
      }),
    ).toEqual(['a.webp', 'b.webp'])
    expect(recorteImageSourceKeys({ imageKey: 'legacy.webp', images: [] })).toEqual([
      'legacy.webp',
    ])
  })

  it('attaches only suggested related entities that exist in the candidate set', () => {
    const response = buildRecorteSuggestionResponse(
      { target: 'entity', title: 'Borges', relatedEntityIds: ['e2', 'missing'] },
      [
        { id: 'e1', name: 'Kafka', type: 'persona' },
        { id: 'e2', name: 'Borges', type: 'persona' },
      ],
    )

    expect(response).toEqual({
      target: 'entity',
      title: 'Borges',
      relatedEntityIds: ['e2', 'missing'],
      relatedEntities: [{ id: 'e2', name: 'Borges', type: 'persona' }],
    })
  })
})
