/**
 * U-3: Postales — exporta una cita como imagen 1080×1080 PNG con
 * tipografía editorial (Spectral italic + paper + accent-rule + atribución).
 *
 * Filosofía:
 *   - **Siempre tema día (paper claro)**, no importa qué tema esté
 *     usando el usuario. Las postales se ven sobre fondos arbitrarios
 *     (Instagram, mensajes, mail) y el paper-claro es el más legible.
 *   - **Atribución en serif**, no en italic — distingue voz del autor
 *     de voz de la cita.
 *   - **Sin watermark "Trama"** ni branding agresivo. Es un objeto
 *     que el usuario hace suyo cuando lo exporta. El producto desaparece.
 *
 * Implementación: Canvas 2D API nativa, sin deps. Wrappea texto a mano
 * para soportar Spectral cargado (Google Fonts vía @import en index.css).
 * Antes de dibujar esperamos `document.fonts.ready` para que la fuente
 * esté disponible — en el peor caso cae al serif default del browser.
 */

const POSTAL_SIZE = 1080
const PADDING_X = 100
const MAX_TEXT_WIDTH = POSTAL_SIZE - PADDING_X * 2

// Colores del tema "paper" (light), hardcodeados — la postal NO hereda
// el tema actual del usuario (ver comentario arriba).
const COLOR_PAPER = '#ffffff'
const COLOR_INK = '#18181b'
const COLOR_INK_MUTED = '#52525b'
const COLOR_GOLD = '#a07900'

export type PostalInput = {
  text: string
  attribution: string // nombre de la entidad
  source?: string | null // libro, año, etc. — opcional
}

/**
 * Genera la postal como Blob PNG. La función espera fuentes cargadas
 * antes de pintar, así que puede tardar 200-500ms la primera vez si
 * Spectral todavía no se descargó.
 */
export async function generatePostalBlob(input: PostalInput): Promise<Blob> {
  // Esperar fuentes — Spectral viene de Google Fonts vía @import.
  // document.fonts.load() resuelve cuando la fuente está disponible
  // (o falla gracefully al timeout interno del browser).
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('italic 400 56px Spectral'),
        document.fonts.load('400 24px Spectral'),
        document.fonts.load('500 18px Inter'),
      ])
    } catch {
      /* fonts may not be available in test env — proceed with fallback */
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = POSTAL_SIZE
  canvas.height = POSTAL_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible en este browser')

  // Fondo paper
  ctx.fillStyle = COLOR_PAPER
  ctx.fillRect(0, 0, POSTAL_SIZE, POSTAL_SIZE)

  // Eyebrow superior — uppercase con letter-spacing emulado (canvas no
  // soporta letter-spacing nativo, lo hacemos manual con espacios).
  ctx.textAlign = 'center'
  ctx.fillStyle = COLOR_GOLD
  ctx.font = '500 18px Inter, sans-serif'
  const eyebrow = spreadLetters('TRAMA', 0.3) // tracking-shout
  ctx.fillText(eyebrow, POSTAL_SIZE / 2, 140)

  // Cita — serif italic, centrada y wrapped
  ctx.fillStyle = COLOR_INK
  ctx.font = 'italic 400 56px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
  const lineHeight = 76
  const lines = wrapText(ctx, input.text, MAX_TEXT_WIDTH)
  // Limitamos a 8 líneas — si la cita es más larga, se trunca con elipsis.
  // (la postal es un fragmento; quien quiera el texto entero, va a la app)
  const visibleLines = lines.slice(0, 8)
  if (lines.length > 8)
    visibleLines[7] = (visibleLines[7] ?? '').replace(/[.,;:]?\s*$/, '') + '…'

  // Calculamos altura total para centrar verticalmente el bloque
  const totalQuoteHeight = visibleLines.length * lineHeight
  const quoteStartY = (POSTAL_SIZE - totalQuoteHeight) / 2 + 24 // +24 ajuste óptico para no quedar 100% centrado
  visibleLines.forEach((line, i) => {
    ctx.fillText(line, POSTAL_SIZE / 2, quoteStartY + i * lineHeight)
  })

  // Accent-rule (línea gold de 32×2px, centrada)
  const ruleY = quoteStartY + totalQuoteHeight + 36
  ctx.fillStyle = COLOR_GOLD
  ctx.globalAlpha = 0.7
  ctx.fillRect(POSTAL_SIZE / 2 - 24, ruleY, 48, 3)
  ctx.globalAlpha = 1

  // Atribución — serif regular, ink-500. Opcionalmente "— Nombre · fuente"
  ctx.fillStyle = COLOR_INK_MUTED
  ctx.font = '400 24px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
  const attribution = input.source
    ? `— ${input.attribution} · ${input.source}`
    : `— ${input.attribution}`
  ctx.fillText(attribution, POSTAL_SIZE / 2, ruleY + 50)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen'))
    }, 'image/png')
  })
}

/**
 * Disparar descarga de la postal. Crea un anchor con `download` y lo
 * clickea programáticamente.
 */
export async function downloadPostal(input: PostalInput): Promise<void> {
  const blob = await generatePostalBlob(input)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `postal-${slugify(input.attribution)}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Liberamos el objectURL tras el click — el browser ya descargó.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Wrappea texto a líneas que entren en maxWidth, midiendo cada palabra
 * con el ctx actual. Respeta saltos de línea explícitos (\n).
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n+/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let currentLine = ''
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      const width = ctx.measureText(candidate).width
      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = candidate
      }
    }
    if (currentLine) lines.push(currentLine)
  }
  return lines
}

/**
 * Emula letter-spacing en Canvas insertando espacios entre caracteres.
 * No es exacto a CSS pero pasa para eyebrows cortos en uppercase.
 */
function spreadLetters(text: string, _em: number): string {
  // 0.3em ≈ 1 espacio extra en uppercase 18px. Aproximación visual.
  return text.split('').join(' ')
}

/** slug para nombre de archivo. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
