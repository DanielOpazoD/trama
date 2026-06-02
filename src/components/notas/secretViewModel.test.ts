import { describe, expect, it } from 'vitest'
import type { Secret } from '../../api'
import { buildSecretViewModel, normalizeSecretDraft } from './secretViewModel'

const baseSecret: Secret = {
  id: 's1',
  label: 'OpenAI',
  kind: 'api_key',
  service: null,
  username: null,
  notes: null,
  favorite: false,
  critical: false,
  expiresAt: null,
  lastRotatedAt: null,
  copiedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

describe('secretViewModel', () => {
  it('calcula filtros, conteos y señales de riesgo sin exponer secretos', () => {
    const secrets: Secret[] = [
      { ...baseSecret, id: 's1', kind: 'api_key', critical: true },
      { ...baseSecret, id: 's2', kind: 'token', expiresAt: '2026-01-01' },
      { ...baseSecret, id: 's3', kind: 'pin', favorite: true },
    ]

    const model = buildSecretViewModel(secrets, 'token', new Date('2026-06-01'))

    expect(model.filtered.map((secret) => secret.id)).toEqual(['s2'])
    expect(model.counts.get('api_key')).toBe(1)
    expect(model.counts.get('token')).toBe(1)
    expect(model.stats).toEqual({
      total: 3,
      critical: 1,
      favorites: 1,
      expired: 1,
    })
  })

  it('normaliza el borrador antes de cifrar y guardar', () => {
    expect(
      normalizeSecretDraft({
        label: ' OpenAI ',
        secret: ' sk-test ',
        service: ' API ',
        username: ' ',
        notes: ' rotar ',
        expiresAt: '',
        critical: true,
      }),
    ).toEqual({
      label: 'OpenAI',
      secret: 'sk-test',
      service: 'API',
      username: null,
      notes: 'rotar',
      expiresAt: null,
      critical: true,
    })
  })
})
