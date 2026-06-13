import { describe, it, expect } from 'vitest'
import { generateToken, hashToken, isPersonalToken, PAT_PREFIX } from './personal-tokens'
import { RecorteCreateBody, RecortePromoteBody } from './recorte-schemas'

describe('personal tokens', () => {
  it('genera tokens con prefijo y hash sha256 consistente', () => {
    const { token, hash } = generateToken()
    expect(token.startsWith(PAT_PREFIX)).toBe(true)
    expect(token.length).toBeGreaterThan(PAT_PREFIX.length + 20)
    expect(hash).toBe(hashToken(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('dos tokens nunca coinciden', () => {
    expect(generateToken().token).not.toBe(generateToken().token)
  })

  it('distingue PATs de JWTs de Clerk', () => {
    expect(isPersonalToken(`${PAT_PREFIX}abc`)).toBe(true)
    expect(isPersonalToken('eyJhbGciOiJSUzI1NiJ9.x.y')).toBe(false)
  })
})

describe('recorte schemas', () => {
  it('acepta una captura mínima válida', () => {
    const parsed = RecorteCreateBody.safeParse({
      text: 'Un párrafo que me llegó.',
      sourceUrl: 'https://example.com/articulo',
      sourceTitle: 'Un artículo',
      capturedAt: '2026-06-12T10:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza texto vacío y URLs inválidas', () => {
    expect(RecorteCreateBody.safeParse({ text: '   ' }).success).toBe(false)
    expect(
      RecorteCreateBody.safeParse({ text: 'ok', sourceUrl: 'no-es-url' }).success,
    ).toBe(false)
  })

  it('la promoción exige target válido y payload del destino', () => {
    expect(
      RecortePromoteBody.safeParse({
        target: 'quote',
        quote: { entityId: 'no-uuid', text: 'x' },
      }).success,
    ).toBe(false)
    expect(
      RecortePromoteBody.safeParse({
        target: 'quote',
        quote: {
          entityId: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
          text: 'Un párrafo que me llegó.',
        },
      }).success,
    ).toBe(true)
  })
})
