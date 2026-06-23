import { describe, expect, it } from 'vitest'
import {
  buildCaptureReplyText,
  buildMediaReply,
  helpMessage,
  notLinkedMessage,
  openInTramaLine,
  parseInlineTags,
  welcomeMessage,
  type MediaReplyInput,
} from './webhook-replies.js'

/** Base de un input de media "guardó 1 recorte sin nada raro"; cada test
 *  sobreescribe lo que le interesa. */
function mediaInput(over: Partial<MediaReplyInput> = {}): MediaReplyInput {
  return {
    saved: 1,
    lastKind: 'recorte',
    appendedTotal: null,
    newImageCount: 1,
    momentoCount: 0,
    recorteCount: 0,
    explicitDateApplied: false,
    dateLabel: null,
    wantsDescription: false,
    skipped: new Set<string>(),
    ...over,
  }
}

describe('whatsapp webhook replies', () => {
  it('centralizes help and not-linked copy for the public webhook', () => {
    expect(helpMessage()).toContain('Trama')
    expect(helpMessage()).toContain('nota: <texto>')
    expect(notLinkedMessage()).toContain('vincular ABC123')
  })

  it('builds welcome messages with optional device labels', () => {
    expect(welcomeMessage('iPhone')).toContain('iPhone')
    expect(welcomeMessage()).toContain('Tu número quedó conectado')
  })

  it('keeps capture reply affordances consistent by variant', () => {
    expect(buildCaptureReplyText('Guardado', 'simple')).toContain('deshacer')
    expect(buildCaptureReplyText('Guardado', 'foto')).toContain('descripción')
    expect(buildCaptureReplyText('Guardado', 'ambiguous')).toContain('momento')
    expect(
      buildCaptureReplyText('Guardado', 'simple', {
        openUrl: 'https://trama.test/x',
      }),
    ).toContain('https://trama.test/x')
  })

  it('normalizes inline tags with dedupe and a hard limit', () => {
    expect(parseInlineTags('#work, ideas ideas\nviaje')).toEqual([
      'work',
      'ideas',
      'viaje',
    ])
    expect(parseInlineTags('a b c d e f g h i j k')).toHaveLength(10)
  })

  it('builds deep-link copy without duplicating URL wording in the handler', () => {
    expect(openInTramaLine('https://trama.test', 'note')).toContain('https://trama.test')
  })
})

describe('buildMediaReply (ensamblado del texto de respuesta de media)', () => {
  it('una sola captura confirma el destino legible y ofrece destino si es recorte', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 1, lastKind: 'recorte', recorteCount: 1 }),
    )
    expect(r.message).toBe('✅ Guardado en Recortes.')
    expect(r.offerDestino).toBe(true)
  })

  it('un momento foto no ofrece botones de destino', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 1, lastKind: 'momento', momentoCount: 1 }),
    )
    expect(r.message).toContain('Guardado en Momentos')
    expect(r.offerDestino).toBe(false)
  })

  it('varias fotos a momento → "N fotos guardadas en un momento"', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 3, lastKind: 'momento', momentoCount: 3, newImageCount: 3 }),
    )
    expect(r.message).toContain('3 fotos guardadas en un momento')
  })

  it('varias imágenes a recorte → "N imágenes guardadas como un evento en Recortes"', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 2, lastKind: 'recorte', recorteCount: 2, newImageCount: 2 }),
    )
    expect(r.message).toContain('2 imágenes guardadas como un evento en Recortes')
  })

  it('anexado de álbum (1 foto) → confirmación suave con el total y cómo separar', () => {
    const r = buildMediaReply(
      mediaInput({
        saved: 1,
        lastKind: 'momento',
        appendedTotal: 3,
        newImageCount: 1,
      }),
    )
    expect(r.message).toContain('+1 foto · tu momento ahora tiene 3')
    expect(r.message).toContain('Para separarla la próxima vez')
  })

  it('anexado a recorte-evento nombra el evento, no el momento', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 2, lastKind: 'recorte', appendedTotal: 5, newImageCount: 2 }),
    )
    expect(r.message).toContain('+2 fotos · tu evento en Recortes ahora tiene 5')
  })

  it('fecha explícita aplicada a un momento nuevo agrega la línea de fecha', () => {
    const r = buildMediaReply(
      mediaInput({
        saved: 1,
        lastKind: 'momento',
        momentoCount: 1,
        explicitDateApplied: true,
        dateLabel: '4 jul 2026',
      }),
    )
    expect(r.message).toContain('Fecha aplicada: 4 jul 2026')
  })

  it('no afirma fecha aplicada cuando solo anexó (appendedTotal != null)', () => {
    const r = buildMediaReply(
      mediaInput({
        saved: 1,
        lastKind: 'momento',
        appendedTotal: 2,
        explicitDateApplied: false,
        dateLabel: '4 jul 2026',
      }),
    )
    expect(r.message).toContain('+1 foto')
    expect(r.message).not.toContain('Fecha aplicada')
  })

  it('visión fallida con imagen guardada avisa que igual se guardó', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 1, lastKind: 'recorte', skipped: new Set(['vision']) }),
    )
    expect(r.message).toContain('No pude leer el texto')
  })

  it('foto sin pie suma la afordancia de descripción', () => {
    const r = buildMediaReply(
      mediaInput({ saved: 1, lastKind: 'recorte', wantsDescription: true }),
    )
    expect(r.message).toContain('Responde con una descripción')
  })

  it('formatos y tamaño no soportados emiten su aviso aunque no se guardara nada', () => {
    expect(
      buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['format']) })).message,
    ).toContain('Envía JPG, PNG, WEBP o GIF')
    expect(
      buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['toolarge']) })).message,
    ).toContain('pesa demasiado')
    expect(
      buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['video_format']) }))
        .message,
    ).toContain('MP4')
    expect(
      buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['audio_format']) }))
        .message,
    ).toContain('nota de voz')
    expect(
      buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['audio_ai']) })).message,
    ).toContain('No pude transcribir')
  })

  it('config faltante no filtra nombres de env vars', () => {
    const r = buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['config']) }))
    expect(r.message).toBe('No puedo procesar imágenes en este momento.')
    expect(r.message).not.toMatch(/TWILIO|SID|TOKEN/)
  })

  it('error de descarga sin nada guardado avisa reintentar', () => {
    const r = buildMediaReply(mediaInput({ saved: 0, skipped: new Set(['error']) }))
    expect(r.message).toContain('No pude descargar el archivo')
    expect(r.offerDestino).toBe(false)
  })

  it('sin resultado y sin razón conocida cae a un mensaje genérico', () => {
    const r = buildMediaReply(mediaInput({ saved: 0, skipped: new Set<string>() }))
    expect(r.message).toBe('Recibí el archivo, pero no pude procesarlo.')
  })
})
