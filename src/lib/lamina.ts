/**
 * Lámina — exporta una cita como imagen tipografiada 1080×1350 PNG
 * (4:5, el formato que las redes muestran completo). Evolución de la
 * Postal (U-3): ahora con los TRES fondos de la casa, la marginalia
 * manuscrita opcional y vista previa en modal antes de exportar.
 *
 * Filosofía:
 *   - Tres temas (papel/noche/vela) elegibles al exportar — la lámina
 *     no hereda el tema activo: el usuario elige el fondo del objeto.
 *   - **Atribución en serif**, no en italic — distingue voz del autor
 *     de voz de la cita.
 *   - La marginalia (tu reflexión) sale en Caveat, levemente girada,
 *     como nota a lápiz sobre la lámina. Opcional.
 *   - **Sin watermark "Trama"** ni branding agresivo. Es un objeto
 *     que el usuario hace suyo cuando lo exporta.
 *
 * Implementación: Canvas 2D API nativa, sin deps. Wrappea texto a mano.
 * Antes de dibujar esperamos las fuentes (Spectral/Inter/Caveat) — en
 * el peor caso cae al serif/cursive default del browser.
 */

const LAMINA_W = 1080
const LAMINA_H = 1350
const PADDING_X = 100
const MAX_TEXT_WIDTH = LAMINA_W - PADDING_X * 2

export type LaminaTheme = 'paper' | 'night' | 'vela'

/** Copia literal de los tokens de index.css (:root / html.dark /
 *  html.dark.theme-vela) — misma excepción deliberada que las tarjetas
 *  de tema en Apariencia: si esos tokens cambian, actualizar acá. */
const PALETTES: Record<
  LaminaTheme,
  { paper: string; ink: string; inkMuted: string; gold: string }
> = {
  paper: { paper: '#ffffff', ink: '#18181b', inkMuted: '#52525b', gold: '#a07900' },
  night: { paper: '#09090b', ink: '#fafafa', inkMuted: '#9d9da6', gold: '#c9a763' },
  vela: { paper: '#1a140e', ink: '#f7eedc', inkMuted: '#b3a285', gold: '#e0b863' },
}

export type LaminaInput = {
  text: string
  attribution: string // nombre de la entidad
  source?: string | null // libro, año, etc. — opcional
  /** Tu reflexión (userReflection) — manuscrita en Caveat. Opcional. */
  marginalia?: string | null
}

/**
 * Genera la lámina como Blob PNG. Espera fuentes cargadas antes de
 * pintar, así que puede tardar 200-500ms la primera vez.
 */
export async function generateLaminaBlob(
  input: LaminaInput,
  theme: LaminaTheme = 'paper',
): Promise<Blob> {
  await loadFonts()
  const canvas = document.createElement('canvas')
  canvas.width = LAMINA_W
  canvas.height = LAMINA_H
  drawLamina(canvas, input, theme)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen'))
    }, 'image/png')
  })
}

/**
 * Genera la lámina como data URL — para la vista previa del modal
 * (mismo dibujo exacto que el blob exportado: lo que ves es lo que sale).
 */
export async function generateLaminaPreview(
  input: LaminaInput,
  theme: LaminaTheme = 'paper',
): Promise<string> {
  await loadFonts()
  const canvas = document.createElement('canvas')
  canvas.width = LAMINA_W
  canvas.height = LAMINA_H
  drawLamina(canvas, input, theme)
  return canvas.toDataURL('image/png')
}

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await Promise.all([
      document.fonts.load('italic 400 56px Spectral'),
      document.fonts.load('400 24px Spectral'),
      document.fonts.load('500 18px Inter'),
      document.fonts.load('400 34px Caveat'),
    ])
  } catch {
    /* fonts may not be available in test env — proceed with fallback */
  }
}

function drawLamina(
  canvas: HTMLCanvasElement,
  input: LaminaInput,
  theme: LaminaTheme,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible en este browser')
  const pal = PALETTES[theme]

  // Fondo del tema elegido
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, LAMINA_W, LAMINA_H)

  // Eyebrow superior — uppercase con letter-spacing emulado (canvas no
  // soporta letter-spacing nativo, lo hacemos manual con espacios).
  ctx.textAlign = 'center'
  ctx.fillStyle = pal.gold
  ctx.font = '500 18px Inter, sans-serif'
  ctx.fillText(spreadLetters('LÁMINA'), LAMINA_W / 2, 150)

  // Cita — serif italic, centrada y wrapped
  ctx.fillStyle = pal.ink
  ctx.font = 'italic 400 56px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
  const lineHeight = 76
  const lines = wrapText(ctx, `«${input.text}»`, MAX_TEXT_WIDTH)
  // Limitamos a 10 líneas — si la cita es más larga, se trunca con elipsis.
  // (la lámina es un fragmento; quien quiera el texto entero, va a la app)
  const MAX_LINES = 10
  const visibleLines = lines.slice(0, MAX_LINES)
  if (lines.length > MAX_LINES) {
    visibleLines[MAX_LINES - 1] =
      (visibleLines[MAX_LINES - 1] ?? '').replace(/[.,;:]?\s*$/, '') + '…»'
  }

  // Centramos verticalmente el bloque completo (cita + atribución +
  // marginalia si la hay), con un leve ajuste óptico hacia arriba.
  const marginaliaLines = input.marginalia ? measureMarginalia(ctx, input.marginalia) : []
  const quoteH = visibleLines.length * lineHeight
  const attributionH = 36 + 50 // rule + línea de atribución
  const marginaliaH = marginaliaLines.length > 0 ? 60 + marginaliaLines.length * 44 : 0
  const blockH = quoteH + attributionH + marginaliaH
  const quoteStartY = Math.max(220, (LAMINA_H - blockH) / 2)

  ctx.font = 'italic 400 56px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
  visibleLines.forEach((line, i) => {
    ctx.fillText(line, LAMINA_W / 2, quoteStartY + i * lineHeight)
  })

  // Accent-rule (línea gold corta, centrada)
  const ruleY = quoteStartY + quoteH + 36
  ctx.fillStyle = pal.gold
  ctx.globalAlpha = 0.7
  ctx.fillRect(LAMINA_W / 2 - 24, ruleY, 48, 3)
  ctx.globalAlpha = 1

  // Atribución — serif regular. Opcionalmente "— Nombre · fuente"
  ctx.fillStyle = pal.inkMuted
  ctx.font = '400 24px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
  const attribution = input.source
    ? `— ${input.attribution} · ${input.source}`
    : `— ${input.attribution}`
  ctx.fillText(attribution, LAMINA_W / 2, ruleY + 50)

  // Marginalia manuscrita — Caveat, levemente girada, bajo la atribución.
  if (marginaliaLines.length > 0) {
    ctx.save()
    ctx.translate(LAMINA_W / 2, ruleY + 50 + 60)
    ctx.rotate(-0.022) // ≈ -1.3°: nota a lápiz, no texto compuesto
    ctx.fillStyle = pal.inkMuted
    ctx.globalAlpha = 0.92
    ctx.font = '400 34px "Caveat", "Bradley Hand", "Segoe Script", cursive'
    marginaliaLines.forEach((line, i) => {
      ctx.fillText(line, 0, i * 44)
    })
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

/** Wrappea la marginalia con la fuente Caveat (máx 3 líneas + elipsis). */
function measureMarginalia(ctx: CanvasRenderingContext2D, text: string): string[] {
  const prevFont = ctx.font
  ctx.font = '400 34px "Caveat", "Bradley Hand", "Segoe Script", cursive'
  const lines = wrapText(ctx, text, MAX_TEXT_WIDTH - 120)
  ctx.font = prevFont
  const MAX = 3
  const visible = lines.slice(0, MAX)
  if (lines.length > MAX) {
    visible[MAX - 1] = (visible[MAX - 1] ?? '').replace(/[.,;:]?\s*$/, '') + '…'
  }
  return visible
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
function spreadLetters(text: string): string {
  return text.split('').join(' ')
}

export type CareoLaminaInput = {
  left: { name: string; text: string }
  right: { name: string; text: string }
  /** Relación declarada entre ambos (si la trama la registró). */
  relation?: string | null
}

/**
 * Lámina del CAREO: dos voces frente a frente en una sola imagen —
 * columna izquierda y derecha con nombre en versalitas y una cita cada
 * una, separadas por una canaleta con filete y rombo, como la doble
 * página del careo en la app.
 */
export async function generateCareoLaminaBlob(
  input: CareoLaminaInput,
  theme: LaminaTheme = 'paper',
): Promise<Blob> {
  await loadFonts()
  const canvas = document.createElement('canvas')
  canvas.width = LAMINA_W
  canvas.height = LAMINA_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible en este browser')
  const pal = PALETTES[theme]

  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, LAMINA_W, LAMINA_H)

  ctx.textAlign = 'center'
  ctx.fillStyle = pal.gold
  ctx.font = '500 18px Inter, sans-serif'
  ctx.fillText(spreadLetters('CAREO'), LAMINA_W / 2, 130)

  if (input.relation) {
    ctx.fillStyle = pal.inkMuted
    ctx.font = '400 20px "Spectral", Georgia, serif'
    ctx.fillText(input.relation, LAMINA_W / 2, 175)
  }

  // Canaleta central: filete + rombo, el pliegue de la doble página.
  ctx.strokeStyle = pal.inkMuted
  ctx.globalAlpha = 0.3
  ctx.beginPath()
  ctx.moveTo(LAMINA_W / 2, 240)
  ctx.lineTo(LAMINA_W / 2, LAMINA_H - 160)
  ctx.stroke()
  ctx.globalAlpha = 0.8
  ctx.save()
  ctx.translate(LAMINA_W / 2, LAMINA_H / 2)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = pal.gold
  ctx.fillRect(-5, -5, 10, 10)
  ctx.restore()
  ctx.globalAlpha = 1

  const COL_W = 380
  const drawSide = (side: { name: string; text: string }, centerX: number) => {
    ctx.fillStyle = pal.inkMuted
    ctx.font = '500 20px Inter, sans-serif'
    ctx.fillText(spreadLetters(side.name.toUpperCase()).slice(0, 60), centerX, 280)

    ctx.fillStyle = pal.ink
    ctx.font = 'italic 400 38px "Spectral", "Iowan Old Style", Palatino, Georgia, serif'
    const lines = wrapText(ctx, `«${side.text}»`, COL_W)
    const MAX = 12
    const visible = lines.slice(0, MAX)
    if (lines.length > MAX) {
      visible[MAX - 1] = (visible[MAX - 1] ?? '').replace(/[.,;:]?\s*$/, '') + '…»'
    }
    const startY = Math.max(360, (LAMINA_H - visible.length * 52) / 2)
    visible.forEach((line, i) => ctx.fillText(line, centerX, startY + i * 52))
  }
  drawSide(input.left, LAMINA_W / 4 + 20)
  drawSide(input.right, (LAMINA_W * 3) / 4 - 20)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen'))
    }, 'image/png')
  })
}

/** slug para nombre de archivo. */
export function laminaFilename(attribution: string): string {
  const slug = attribution
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `lamina-${slug || 'cita'}.png`
}
