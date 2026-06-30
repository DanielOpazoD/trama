import { describe, expect, it } from 'vitest'
import type { ErrorLogEntry } from '../../api'
import { dedupErrorEntries } from './settingsLogsModel'

function errorEntry(overrides: Partial<ErrorLogEntry>): ErrorLogEntry {
  return {
    id: 'err',
    functionName: 'extract',
    httpMethod: 'POST',
    httpPath: '/api/extract',
    statusCode: 500,
    message: 'boom',
    stack: null,
    context: null,
    createdAt: '2026-05-28T10:00:00Z',
    ...overrides,
  }
}

describe('settingsLogsModel', () => {
  it('agrupa errores por funcion, status y prefijo de mensaje', () => {
    expect(
      dedupErrorEntries([
        errorEntry({ id: 'old', createdAt: '2026-05-28T10:00:00Z' }),
        errorEntry({ id: 'new', createdAt: '2026-05-28T11:00:00Z' }),
        errorEntry({
          id: 'other',
          functionName: 'ask',
          createdAt: '2026-05-28T12:00:00Z',
        }),
      ]),
    ).toEqual([
      {
        representative: errorEntry({
          id: 'other',
          functionName: 'ask',
          createdAt: '2026-05-28T12:00:00Z',
        }),
        count: 1,
      },
      {
        representative: errorEntry({ id: 'new', createdAt: '2026-05-28T11:00:00Z' }),
        count: 2,
      },
    ])
  })
})
