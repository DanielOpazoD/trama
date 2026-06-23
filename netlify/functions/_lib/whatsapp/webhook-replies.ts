import { captureDeepLink } from './deep-link.js'
import type { CaptureReplyVariant } from './interactive.js'

const HELP = [
  'Trama 📚 — tu segundo cerebro, ahora desde WhatsApp.',
  '',
  'Captura al instante:',
  '• nota: <texto>',
  '• cita: <frase> — <autor>',
  '• entidad: <nombre> (tipo)',
  '• momento: <qué pasó>',
  '• tarea: <qué hacer> — <detalle>',
  'O escribe libremente y yo lo clasifico por ti.',
  '',
  '📷 Fotos: la imagen va a Recortes. Con «cita:» o «nota:» leo el texto (OCR).',
  '🎤 Notas de voz: las transcribo y las guardo como Nota.',
  '🔎 Pregunta: «buscar: <tema>» o «? <pregunta>» para consultar tu Trama.',
  '',
  'Después de guardar puedes responder:',
  '• «título <texto>» para nombrarlo',
  '• «etiqueta <palabras>» para clasificarlo',
  '• «nota», «momento» o «entidad» para reclasificarlo',
  '',
  'Atajos: «deshacer» revierte lo último · «estado» muestra tu resumen.',
].join('\n')

const NOT_LINKED = [
  'Tu número todavía no está conectado a Trama.',
  'Abre Trama → Configuración → WhatsApp, genera un código y envíalo así:',
  'vincular ABC123',
].join('\n')

export function helpMessage(): string {
  return HELP
}

export function notLinkedMessage(): string {
  return NOT_LINKED
}

export function openLinkText(url: string): string {
  return `🔗 Ábrelo en Trama: ${url}`
}

export function openInTramaLine(origin: string, kind: string): string {
  return openLinkText(captureDeepLink(origin, kind))
}

export function welcomeMessage(label?: string): string {
  const head = label
    ? `✅ ¡Listo! Conecté este dispositivo como «${label}».`
    : '✅ ¡Listo! Tu número quedó conectado a Trama.'
  return [
    head,
    '',
    'Pruébalo ahora mismo:',
    '• nota: comprar pan',
    '• cita: el tiempo es relativo — Einstein',
    '• momento: hoy empecé algo nuevo',
    '',
    'Escribe «ayuda» cuando quieras ver todo lo que puedo hacer.',
  ].join('\n')
}

export function captureReplyFix(variant: CaptureReplyVariant): string {
  if (variant === 'foto') {
    return '↩️ Responde con una descripción, o «deshacer» · «momento» · «nota».'
  }
  if (variant === 'ambiguous') {
    return '↩️ ¿No era así? Responde «deshacer», o reclasifícalo: nota · momento · tarea · entidad.'
  }
  return '↩️ ¿No era así? Responde «deshacer».'
}

export function buildCaptureReplyText(
  body: string,
  variant: CaptureReplyVariant,
  opts: { openUrl?: string } = {},
): string {
  const bodyWithLink = opts.openUrl ? `${body}\n${openLinkText(opts.openUrl)}` : body
  return `${bodyWithLink}\n${captureReplyFix(variant)}`
}

export function parseInlineTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]+|\s+/)
        .map((tag) => tag.trim().replace(/^#/, '').slice(0, 40))
        .filter((tag) => tag.length > 0),
    ),
  ].slice(0, 10)
}

const DEST_BY_KIND: Record<string, string> = {
  momento: 'Momentos',
  recorte: 'Recortes',
  quote: 'Citas',
  note: 'Notas',
}

/** Datos que el orquestador de media calculó y que el copy necesita para
 *  ensamblar el texto de respuesta. Sin efectos: solo describe el resultado. */
export type MediaReplyInput = {
  /** Cuántas piezas se guardaron en total (0 = nada se guardó). */
  saved: number
  /** Kind de la última captura guardada (decide el destino legible). */
  lastKind: string
  /** Total de fotos tras un anexado de álbum, o `null` si no fue un anexado. */
  appendedTotal: number | null
  /** Fotos NUEVAS de este mensaje (para el conteo del anexado). */
  newImageCount: number
  /** Cuántas fotos del route 'momento' se agruparon en este mensaje. */
  momentoCount: number
  /** Cuántas imágenes del route 'recorte' se agruparon en este mensaje. */
  recorteCount: number
  /** ¿Se aplicó una fecha explícita (`Fecha:`) a un momento recién creado? */
  explicitDateApplied: boolean
  /** Etiqueta humana de la fecha explícita, si vino. */
  dateLabel: string | null
  /** ¿La foto quedó sin pie y por eso ofrecemos describirla? */
  wantsDescription: boolean
  /** Razones de descarte acumuladas durante el procesamiento. */
  skipped: ReadonlySet<string>
}

/** Resultado del ensamblado: el texto a responder y si ofrecer botones de
 *  destino (Momento/Nota) además de Deshacer. */
export type MediaReply = {
  message: string
  offerDestino: boolean
}

/**
 * Ensambla el texto de respuesta a un mensaje con adjuntos: confirma lo
 * guardado (captura simple, episodio foto, recorte-evento o anexado de álbum),
 * agrega la nota de fecha aplicada, los avisos de formatos/tamaños no
 * soportados y la afordancia de descripción. Es copy PURO: el orquestador le
 * pasa los datos ya calculados y recibe el texto + si ofrecer destino.
 */
export function buildMediaReply(input: MediaReplyInput): MediaReply {
  const {
    saved,
    lastKind,
    appendedTotal,
    newImageCount,
    momentoCount,
    recorteCount,
    explicitDateApplied,
    dateLabel,
    wantsDescription,
    skipped,
  } = input
  const lines: string[] = []
  if (saved > 0) {
    const dest = DEST_BY_KIND[lastKind] ?? 'Trama'
    if (appendedTotal !== null) {
      const noun = lastKind === 'momento' ? 'tu momento' : 'tu evento en Recortes'
      lines.push(
        newImageCount === 1
          ? `📸 +1 foto · ${noun} ahora tiene ${appendedTotal}.`
          : `📸 +${newImageCount} fotos · ${noun} ahora tiene ${appendedTotal}.`,
      )
      lines.push('Para separarla la próxima vez, escribe “nuevo” o “no juntar”.')
    } else {
      const isPhotoEpisode =
        lastKind === 'momento' && momentoCount > 1 && saved === momentoCount
      const isRecorteEvent =
        lastKind === 'recorte' && recorteCount > 1 && saved === recorteCount
      lines.push(
        saved === 1
          ? `✅ Guardado en ${dest}.`
          : isPhotoEpisode
            ? `✅ ${saved} fotos guardadas en un momento.`
            : isRecorteEvent
              ? `✅ ${saved} imágenes guardadas como un evento en Recortes.`
              : `✅ ${saved} elementos guardados.`,
      )
    }
    if (dateLabel && explicitDateApplied) {
      lines.push(`📅 Fecha aplicada: ${dateLabel}.`)
    }
    if (skipped.has('vision')) {
      lines.push('(No pude leer el texto; guardé la imagen igual.)')
    }
    if (wantsDescription) {
      lines.push('✍️ Responde con una descripción y se la agrego.')
    }
  }
  if (skipped.has('video_format')) {
    lines.push('🎬 Ese formato de video no lo soporto aún. Envía MP4, WEBM o MOV.')
  }
  if (skipped.has('audio_format')) {
    lines.push(
      '🎤 Ese formato de audio no lo puedo transcribir (manda una nota de voz normal).',
    )
  }
  if (skipped.has('audio_ai')) {
    lines.push(
      '🎤 No pude transcribir la nota de voz ahora (quizá se agotó el presupuesto de IA).',
    )
  }
  if (skipped.has('format')) {
    lines.push('🖼️ Ese formato no lo soporto aún. Envía JPG, PNG, WEBP o GIF.')
  }
  if (skipped.has('toolarge')) {
    lines.push('📦 La imagen pesa demasiado (máximo 16 MB). Envíala más liviana.')
  }
  if (skipped.has('config')) {
    // Falta config del servidor: no filtramos nombres de env vars al usuario.
    lines.push('No puedo procesar imágenes en este momento.')
  }
  if (saved === 0 && skipped.has('error')) {
    lines.push('No pude descargar el archivo. Prueba de nuevo en un momento.')
  }
  if (lines.length === 0) lines.push('Recibí el archivo, pero no pude procesarlo.')
  // Una captura de imagen guardada como Recorte (default) puede redirigirse sin
  // pérdida a Momento o Nota con sus imágenes: ofrecemos esos botones de destino
  // (además de Deshacer). Las fotos que ya fueron a Momentos no necesitan botón.
  const offerDestino = saved > 0 && lastKind === 'recorte'
  return { message: lines.join('\n'), offerDestino }
}
