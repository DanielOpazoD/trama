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
