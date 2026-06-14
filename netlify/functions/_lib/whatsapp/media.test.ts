import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  parseInboundMedia,
  isTwilioMediaUrl,
  mediaCategory,
  extFromMime,
  mediaTarget,
  downloadTwilioMedia,
} from './media'

describe('parseInboundMedia', () => {
  it('lee NumMedia + MediaUrl/MediaContentType', () => {
    const media = parseInboundMedia({
      NumMedia: '2',
      MediaUrl0: 'https://api.twilio.com/a',
      MediaContentType0: 'image/jpeg',
      MediaUrl1: 'https://api.twilio.com/b',
      MediaContentType1: 'audio/ogg',
    })
    expect(media).toEqual([
      { url: 'https://api.twilio.com/a', contentType: 'image/jpeg' },
      { url: 'https://api.twilio.com/b', contentType: 'audio/ogg' },
    ])
  })

  it('sin media → []', () => {
    expect(parseInboundMedia({})).toEqual([])
    expect(parseInboundMedia({ NumMedia: '0' })).toEqual([])
  })
})

describe('isTwilioMediaUrl', () => {
  it('acepta https de twilio, rechaza el resto', () => {
    expect(isTwilioMediaUrl('https://api.twilio.com/x')).toBe(true)
    expect(isTwilioMediaUrl('https://media.us1.twilio.com/x')).toBe(true)
    expect(isTwilioMediaUrl('http://api.twilio.com/x')).toBe(false) // no https
    expect(isTwilioMediaUrl('https://evil.com/x')).toBe(false)
    expect(isTwilioMediaUrl('https://api.twilio.com.evil.com/x')).toBe(false)
    expect(isTwilioMediaUrl('no-url')).toBe(false)
  })
})

describe('mediaCategory / extFromMime', () => {
  it('categoriza por MIME', () => {
    expect(mediaCategory('image/jpeg')).toBe('image')
    expect(mediaCategory('audio/ogg')).toBe('audio')
    expect(mediaCategory('video/mp4')).toBe('video')
    expect(mediaCategory('application/pdf')).toBe('other')
  })
  it('extensión por MIME (con parámetros)', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/png; charset=binary')).toBe('png')
    expect(extFromMime('application/zip')).toBe('bin')
  })
})

describe('mediaTarget', () => {
  it('default Recortes', () => {
    expect(mediaTarget('mirá esta foto')).toEqual({
      target: 'recorte',
      caption: 'mirá esta foto',
    })
  })
  it('override momento:', () => {
    expect(mediaTarget('momento: cumple de la abuela')).toEqual({
      target: 'momento',
      caption: 'cumple de la abuela',
    })
  })
  it('recorte: explícito', () => {
    expect(mediaTarget('recorte: para leer')).toEqual({
      target: 'recorte',
      caption: 'para leer',
    })
  })
})

describe('downloadTwilioMedia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rechaza URL que no es de Twilio (SSRF guard)', async () => {
    await expect(downloadTwilioMedia('https://evil.com/x', 'AC', 'tok')).rejects.toThrow(
      /Twilio/,
    )
  })

  it('baja con auth básica y devuelve buffer + contentType', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { buffer, contentType } = await downloadTwilioMedia(
      'https://api.twilio.com/Media/abc',
      'AC123',
      'tok',
    )
    expect(contentType).toBe('image/jpeg')
    expect(buffer.byteLength).toBe(8)
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
  })
})
