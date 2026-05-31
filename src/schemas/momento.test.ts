import { describe, expect, it } from 'vitest'
import {
  MomentoFotoPayloadSchema,
  MomentoKindSchema,
  MomentoNotaPayloadSchema,
  MomentoRecortePayloadSchema,
  validateMomentoPayload,
} from './momento'

describe('momento schemas', () => {
  it('valida kinds y trim de nota', () => {
    expect(MomentoKindSchema.safeParse('nota').success).toBe(true)
    expect(MomentoKindSchema.safeParse('audio').success).toBe(false)
    expect(MomentoNotaPayloadSchema.parse({ bodyText: '  hola  ' })).toEqual({
      bodyText: 'hola',
    })
    expect(validateMomentoPayload('nota', { bodyText: ' ' })).toBe(
      'kind=nota requiere payload.bodyText no vacío',
    )
  })

  it('exige contenido mínimo para recorte', () => {
    expect(
      MomentoRecortePayloadSchema.parse({
        url: ' https://example.com ',
        title: ' ',
        bodyText: ' ',
      }),
    ).toMatchObject({ url: 'https://example.com', title: '', bodyText: '' })
    expect(validateMomentoPayload('recorte', {})).toBe(
      'kind=recorte requiere al menos url, title o bodyText',
    )
  })

  it('acepta foto por items o storageKey legacy', () => {
    expect(
      MomentoFotoPayloadSchema.safeParse({ items: [{ storageKey: ' foto.jpg ' }] })
        .success,
    ).toBe(true)
    expect(MomentoFotoPayloadSchema.safeParse({ storageKey: 'legacy.jpg' }).success).toBe(
      true,
    )
    expect(validateMomentoPayload('foto', { storageKey: 42 })).toBe(
      'kind=foto requiere payload.storageKey o payload.items[]',
    )
  })
})
