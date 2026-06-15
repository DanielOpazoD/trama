import { describe, it, expect } from 'vitest'
import { youtubeThumb, youtubeThumbUrl, youtubeVideoId } from './youtubeThumb'

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

describe('youtubeThumb', () => {
  it('extrae el id de las formas de URL de YouTube', () => {
    expect(youtubeThumb('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://youtu.be/dQw4w9WgXcQ')).toBe(thumb('dQw4w9WgXcQ'))
    expect(youtubeThumb('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
  })

  it('sigue los links intermedios attribution_link', () => {
    expect(
      youtubeThumb(
        'https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3DdQw4w9WgXcQ',
      ),
    ).toBe(thumb('dQw4w9WgXcQ'))
  })

  it('ignora parámetros extra alrededor del id', () => {
    expect(
      youtubeThumb('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123'),
    ).toBe(thumb('dQw4w9WgXcQ'))
    expect(youtubeThumb('https://youtu.be/dQw4w9WgXcQ?si=abc123')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
  })

  it('devuelve null para páginas de YouTube que no son videos', () => {
    expect(youtubeThumb('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(youtubeThumb('https://www.youtube.com/')).toBeNull()
  })

  it('devuelve null para URLs que no son de YouTube', () => {
    expect(youtubeThumb('https://www.gutenberg.org/')).toBeNull()
    expect(youtubeThumb('https://vimeo.com/123456789')).toBeNull()
  })

  it('devuelve null para strings que no son URL', () => {
    expect(youtubeThumb('no es una url')).toBeNull()
    expect(youtubeThumb('')).toBeNull()
  })
})

describe('youtubeVideoId (helper puro compartido cliente/servidor)', () => {
  it('extrae el id de las formas de URL de YouTube', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  it('devuelve null para lo que no es un video', () => {
    expect(youtubeVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(youtubeVideoId('https://vimeo.com/123456789')).toBeNull()
    expect(youtubeVideoId('no es una url')).toBeNull()
  })

  it('youtubeThumbUrl construye la URL hqdefault del id', () => {
    expect(youtubeThumbUrl('dQw4w9WgXcQ')).toBe(thumb('dQw4w9WgXcQ'))
  })

  it('youtubeThumb y youtubeThumbUrl(youtubeVideoId) coinciden', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const id = youtubeVideoId(url)
    expect(id).not.toBeNull()
    expect(youtubeThumbUrl(id!)).toBe(youtubeThumb(url))
  })
})
