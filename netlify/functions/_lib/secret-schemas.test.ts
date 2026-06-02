import { describe, expect, it } from 'vitest'
import { SecretCreateBody, SecretPatchBody } from './secret-schemas'

const encryptedEnvelope = JSON.stringify({
  v: 1,
  alg: 'AES-GCM',
  iv: 'AAAAAAAAAAAAAAAA',
  data: 'BBBBBBBBBBBBBBBB',
})

describe('secret schemas', () => {
  it('acepta solo sobres cifrados para crear claves', () => {
    expect(
      SecretCreateBody.safeParse({
        label: 'OpenAI',
        kind: 'api_key',
        secret: encryptedEnvelope,
      }).success,
    ).toBe(true)

    expect(
      SecretCreateBody.safeParse({
        label: 'OpenAI',
        kind: 'api_key',
        secret: 'sk-plain-text',
      }).success,
    ).toBe(false)
  })

  it('acepta solo sobres cifrados al actualizar el valor secreto', () => {
    expect(SecretPatchBody.safeParse({ secret: encryptedEnvelope }).success).toBe(true)
    expect(SecretPatchBody.safeParse({ secret: '123456' }).success).toBe(false)
  })

  it('acepta metadata sensible solo como sobre cifrado o null', () => {
    expect(
      SecretCreateBody.safeParse({
        label: 'OpenAI',
        kind: 'api_key',
        secret: encryptedEnvelope,
        service: encryptedEnvelope,
        username: encryptedEnvelope,
        notes: encryptedEnvelope,
      }).success,
    ).toBe(true)

    expect(
      SecretCreateBody.safeParse({
        label: 'OpenAI',
        kind: 'api_key',
        secret: encryptedEnvelope,
        service: null,
        username: null,
        notes: null,
      }).success,
    ).toBe(true)

    expect(
      SecretCreateBody.safeParse({
        label: 'OpenAI',
        kind: 'api_key',
        secret: encryptedEnvelope,
        service: 'OpenAI plaintext',
      }).success,
    ).toBe(false)
  })
})
