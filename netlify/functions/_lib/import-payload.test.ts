import { describe, expect, it } from 'vitest'

import { parseIncomingImportPayload } from './import-payload'

describe('import payload normalization', () => {
  it('normaliza items válidos y conserva inválidos como null por colección', () => {
    const parsed = parseIncomingImportPayload({
      entities: [null, { id: 'e1', type: 'persona', name: 'Ada', year: 1815 }],
      tasks: [
        { id: 't1', title: 'hacer backup', priority: 'urgente', tags: ['ops', 42] },
      ],
      secretos: [{ id: 'ignored' }],
      secrets: [
        {
          id: 's1',
          label: 'OpenAI',
          encryptedSecret:
            '{"v":1,"alg":"AES-GCM","iv":"AAAAAAAAAAAAAAAA","data":"BBBBBBBBBBBBBBBB"}',
          kind: 'api_key',
          service: 'plain text legacy',
          username:
            '{"v":1,"alg":"AES-GCM","iv":"CCCCCCCCCCCCCCCC","data":"DDDDDDDDDDDDDDDD"}',
        },
      ],
    })

    expect(parsed.entities).toEqual([
      null,
      {
        id: 'e1',
        type: 'persona',
        name: 'Ada',
        year: 1815,
        description: null,
        essay: null,
        positionX: null,
        positionY: null,
        spotifyUrl: null,
        wikipediaUrl: null,
        grokipediaUrl: null,
        origin: undefined,
      },
    ])
    expect(parsed.tasks).toEqual([
      {
        id: 't1',
        title: 'hacer backup',
        detail: null,
        done: false,
        dueDate: null,
        priority: null,
        weekStart: null,
        completedAt: null,
        tags: ['ops'],
        origin: undefined,
      },
    ])
    expect(parsed.secrets).toEqual([
      {
        id: 's1',
        label: 'OpenAI',
        encryptedSecret:
          '{"v":1,"alg":"AES-GCM","iv":"AAAAAAAAAAAAAAAA","data":"BBBBBBBBBBBBBBBB"}',
        kind: 'api_key',
        encryptedService: null,
        encryptedUsername:
          '{"v":1,"alg":"AES-GCM","iv":"CCCCCCCCCCCCCCCC","data":"DDDDDDDDDDDDDDDD"}',
        encryptedNotes: null,
        favorite: false,
        critical: false,
        expiresAt: null,
        lastRotatedAt: null,
        origin: undefined,
      },
    ])
    expect(parsed.relationships).toEqual([])
    expect(parsed.quotes).toEqual([])
    expect(parsed.momentos).toEqual([])
    expect(parsed.notes).toEqual([])
    expect(parsed.prompts).toEqual([])
  })
})
