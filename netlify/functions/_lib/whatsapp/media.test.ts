import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  parseInboundMedia,
  isTwilioMediaUrl,
  mediaCategory,
  extFromMime,
  mediaRoute,
  isMomentoCaption,
  isVisionRoute,
  downloadTwilioMedia,
  isAllowedImageMime,
  isTranscribableAudioMime,
  audioExtFromMime,
  MEDIA_TOO_LARGE,
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

describe('mediaRoute', () => {
  it('default Recortes', () => {
    expect(mediaRoute('mirá esta foto')).toEqual({
      route: 'recorte',
      caption: 'mirá esta foto',
    })
  })
  it('override momento:', () => {
    expect(mediaRoute('momento: cumple de la abuela')).toEqual({
      route: 'momento',
      caption: 'cumple de la abuela',
    })
  })
  it('recorte: explícito', () => {
    expect(mediaRoute('recorte: para leer')).toEqual({
      route: 'recorte',
      caption: 'para leer',
    })
  })
  it('cita: → ruta de visión quote', () => {
    expect(mediaRoute('cita: sobre el tiempo')).toEqual({
      route: 'quote',
      caption: 'sobre el tiempo',
    })
  })
  it('nota:/texto:/ocr: → ruta de visión note', () => {
    expect(mediaRoute('nota: apuntes').route).toBe('note')
    expect(mediaRoute('texto:').route).toBe('note')
    expect(mediaRoute('ocr: la pizarra').route).toBe('note')
  })

  it('lenguaje natural "subir a momentos" → Momento (sin caption)', () => {
    expect(mediaRoute('Subir a momentos')).toEqual({ route: 'momento', caption: '' })
  })

  it('otras frases naturales de Momentos enrutan a momento', () => {
    for (const phrase of [
      'a momentos',
      'guardar en momentos',
      'guárdala en momentos',
      'mandar a momentos',
      'súbela a momentos',
      'para momentos',
      'en momentos',
      'momentos',
      'momento',
    ]) {
      expect(mediaRoute(phrase).route).toBe('momento')
    }
  })

  it('directiva con texto descriptivo después también enruta a momento', () => {
    // El caso del screenshot: «A momentos ambas imágenes» debe ir a Momentos.
    expect(mediaRoute('A momentos ambas imágenes').route).toBe('momento')
    expect(mediaRoute('subir a momentos las del torneo').route).toBe('momento')
    expect(mediaRoute('guardar en momentos esto').route).toBe('momento')
  })

  it('caption descriptivo que solo menciona la palabra queda en Recorte', () => {
    expect(mediaRoute('momentos felices del viaje').route).toBe('recorte')
    expect(mediaRoute('un momento inolvidable').route).toBe('recorte')
    expect(mediaRoute('mirá esta foto').route).toBe('recorte')
  })

  it('el prefijo explícito gana sobre el lenguaje natural', () => {
    // `recorte:` fuerza Recorte aunque el texto diga "a momentos".
    expect(mediaRoute('recorte: a momentos')).toEqual({
      route: 'recorte',
      caption: 'a momentos',
    })
    // `momento:` conserva su caption descriptivo.
    expect(mediaRoute('momento: cumple')).toEqual({
      route: 'momento',
      caption: 'cumple',
    })
  })
})

describe('isMomentoCaption', () => {
  it('detecta intención de Momentos en lenguaje natural (tolerante a acentos)', () => {
    expect(isMomentoCaption('Subir a Momentos')).toBe(true)
    expect(isMomentoCaption('guardar en momentos')).toBe(true)
    expect(isMomentoCaption('a momentos')).toBe(true)
    expect(isMomentoCaption('momentos')).toBe(true)
  })

  it('acepta texto después de la directiva', () => {
    expect(isMomentoCaption('a momentos ambas imágenes')).toBe(true)
    expect(isMomentoCaption('subir a momentos las fotos')).toBe(true)
  })

  it('no matchea captions descriptivos', () => {
    expect(isMomentoCaption('momentos felices')).toBe(false)
    expect(isMomentoCaption('momentos felices del viaje')).toBe(false)
    expect(isMomentoCaption('mirá esta foto')).toBe(false)
    expect(isMomentoCaption('')).toBe(false)
  })
})

describe('isVisionRoute', () => {
  it('quote y note requieren visión; momento y recorte no', () => {
    expect(isVisionRoute('quote')).toBe(true)
    expect(isVisionRoute('note')).toBe(true)
    expect(isVisionRoute('momento')).toBe(false)
    expect(isVisionRoute('recorte')).toBe(false)
  })
})

describe('audio transcribible', () => {
  it('acepta los formatos que Whisper transcribe (ogg/opus de WhatsApp, etc.)', () => {
    expect(isTranscribableAudioMime('audio/ogg; codecs=opus')).toBe(true)
    expect(isTranscribableAudioMime('audio/mpeg')).toBe(true)
    expect(isTranscribableAudioMime('audio/mp4')).toBe(true)
    // AMR/3gpp NO los acepta OpenAI → fuera.
    expect(isTranscribableAudioMime('audio/amr')).toBe(false)
    expect(isTranscribableAudioMime('audio/3gpp')).toBe(false)
  })

  it('mapea el MIME a una extensión que OpenAI olfatea', () => {
    expect(audioExtFromMime('audio/ogg; codecs=opus')).toBe('ogg')
    expect(audioExtFromMime('audio/mpeg')).toBe('mp3')
    expect(audioExtFromMime('audio/desconocido')).toBe('ogg')
  })
})

describe('isAllowedImageMime', () => {
  it('acepta los formatos soportados, rechaza el resto', () => {
    expect(isAllowedImageMime('image/jpeg')).toBe(true)
    expect(isAllowedImageMime('image/png; charset=binary')).toBe(true)
    expect(isAllowedImageMime('IMAGE/WEBP')).toBe(true)
    expect(isAllowedImageMime('image/heic')).toBe(false)
    expect(isAllowedImageMime('application/pdf')).toBe(false)
  })
})

describe('downloadTwilioMedia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rechaza URL que no es de Twilio (SSRF guard)', async () => {
    await expect(downloadTwilioMedia('https://evil.com/x', 'AC', 'tok')).rejects.toThrow(
      /Twilio/,
    )
  })

  it('aborta por Content-Length declarado mayor al tope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (k: string) => (k === 'content-length' ? '99999999' : 'image/jpeg'),
        },
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    )
    await expect(
      downloadTwilioMedia('https://api.twilio.com/x', 'AC', 'tok', { maxBytes: 1024 }),
    ).rejects.toThrow(MEDIA_TOO_LARGE)
  })

  it('aborta si el buffer real supera el tope (sin Content-Length)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(2048),
      }),
    )
    await expect(
      downloadTwilioMedia('https://api.twilio.com/x', 'AC', 'tok', { maxBytes: 1024 }),
    ).rejects.toThrow(MEDIA_TOO_LARGE)
  })

  it('reintenta en 5xx y termina bajando (con backoff inyectado)', async () => {
    const onRetry = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new ArrayBuffer(8),
      })
    vi.stubGlobal('fetch', fetchMock)
    const { buffer } = await downloadTwilioMedia(
      'https://api.twilio.com/x',
      'AC',
      'tok',
      {
        retryDelaysMs: [0, 0],
        onRetry,
      },
    )
    expect(buffer.byteLength).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('reintenta ante error de red y se rinde tras agotar intentos', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadTwilioMedia('https://api.twilio.com/x', 'AC', 'tok', {
        retryDelaysMs: [0, 0],
      }),
    ).rejects.toThrow(/network down/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('NO reintenta en 4xx (permanente)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadTwilioMedia('https://api.twilio.com/x', 'AC', 'tok', {
        retryDelaysMs: [0, 0],
      }),
    ).rejects.toThrow(/404/)
    expect(fetchMock).toHaveBeenCalledOnce()
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
