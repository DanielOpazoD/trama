import { describe, expect, it } from 'vitest'
import { mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

import {
  checksumSha256,
  recordStorageAsset,
  softDeleteStorageAsset,
  storageKeyForLog,
} from './storage-assets'

const sql = setupMockSql().getSql()

describe('storage asset manifest', () => {
  it('registra metadata de archivos privados con owner, provider y checksum', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([{ id: 'asset-1' }])

    await recordStorageAsset(sql, {
      userId: 'user-a',
      domain: 'notas-attachments',
      ownerType: 'note',
      ownerId: 'note-1',
      provider: 'netlify-blobs',
      storageKey: 'user-a/private-note.txt',
      mimeType: 'text/plain',
      byteSize: 7,
      checksum: 'sha256:abc',
    })

    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO storage_assets/i.test(call.template),
    )
    expect(insert).toBeDefined()
    expect(insert?.template).toMatch(/ON CONFLICT \(provider, domain, storage_key\)/i)
    expect(insert?.values).toEqual(
      expect.arrayContaining([
        'user-a',
        'notas-attachments',
        'note',
        'note-1',
        'netlify-blobs',
        'user-a/private-note.txt',
        'text/plain',
        7,
        'sha256:abc',
      ]),
    )
  })

  it('soft-deletea el manifest scoped por usuario y storage key', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([{ id: 'asset-1' }])

    await softDeleteStorageAsset(sql, {
      userId: 'user-a',
      domain: 'notas-attachments',
      provider: 'netlify-blobs',
      storageKey: 'user-a/private-note.txt',
    })

    const update = mockSqlState.calls.find((call) =>
      /UPDATE storage_assets/i.test(call.template),
    )
    expect(update).toBeDefined()
    expect(update?.template).toMatch(/deleted_at = NOW\(\)/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.values).toEqual(
      expect.arrayContaining([
        'user-a',
        'notas-attachments',
        'netlify-blobs',
        'user-a/private-note.txt',
      ]),
    )
  })

  it('calcula checksums sin exponer storage keys crudas en logs', async () => {
    const checksum = await checksumSha256(new TextEncoder().encode('abc').buffer)

    expect(checksum).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(storageKeyForLog('user-a/private-note.txt')).toEqual({
      ownerPrefix: 'user-a',
      keyHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
  })
})
