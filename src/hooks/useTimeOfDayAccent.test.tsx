import { renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pickAccentHour, useTimeOfDayAccent, type AccentHour } from './useTimeOfDayAccent'

/**
 * El acento dorado cambia con la hora. Antes el hook escribía el hex en el
 * style inline del <html>, y ese inline le ganaba a los tres temas: cuatro
 * colores afinados para papel blanco terminaban también sobre el papel casi
 * negro de noche y vela. Vela caía a 3.37:1 — por debajo de WCAG AA — y sólo
 * a ciertas horas, así que ni una revisión visual ni axe lo pillaban de forma
 * fiable.
 *
 * Ahora el hook sólo publica `data-accent-hour` y la paleta vive en el CSS,
 * una por tema. Estos tests cubren las dos mitades del arreglo: que el hook
 * clasifique bien la hora, y que la paleta del CSS sea legible en los tres
 * papeles. Lo segundo se lee del CSS de verdad, no de una copia — una tabla
 * duplicada aquí se quedaría obsoleta sin avisar, que es justo la clase de
 * fallo que este test existe para impedir.
 */

const HOURS: AccentHour[] = ['mañana', 'mediodia', 'atardecer', 'noche']

describe('pickAccentHour', () => {
  it('mapea cada franja del día', () => {
    expect(pickAccentHour(7)).toBe('mañana')
    expect(pickAccentHour(13)).toBe('mediodia')
    expect(pickAccentHour(19)).toBe('atardecer')
    expect(pickAccentHour(23)).toBe('noche')
  })

  it('cubre las 24 horas sin huecos', () => {
    const cubiertas = Array.from({ length: 24 }, (_, h) => pickAccentHour(h))
    expect(cubiertas.every((v) => HOURS.includes(v))).toBe(true)
    expect(new Set(cubiertas).size).toBe(4)
  })

  it('acierta en las fronteras, incluida la que cruza medianoche', () => {
    expect(pickAccentHour(5)).toBe('noche')
    expect(pickAccentHour(6)).toBe('mañana')
    expect(pickAccentHour(10)).toBe('mañana')
    expect(pickAccentHour(11)).toBe('mediodia')
    expect(pickAccentHour(16)).toBe('mediodia')
    expect(pickAccentHour(17)).toBe('atardecer')
    expect(pickAccentHour(20)).toBe('atardecer')
    expect(pickAccentHour(21)).toBe('noche')
    expect(pickAccentHour(0)).toBe('noche')
  })
})

describe('useTimeOfDayAccent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    delete document.documentElement.dataset.accentHour
    document.documentElement.style.removeProperty('--accent-gold')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publica la hora en el <html> y la reevalúa periódicamente', () => {
    vi.setSystemTime(new Date('2026-05-31T08:00:00'))
    renderHook(() => useTimeOfDayAccent())

    expect(document.documentElement.dataset.accentHour).toBe('mañana')

    vi.setSystemTime(new Date('2026-05-31T22:00:00'))
    vi.advanceTimersByTime(30 * 60 * 1000)

    expect(document.documentElement.dataset.accentHour).toBe('noche')
  })

  /**
   * La versión anterior de este test afirmaba que el hook escribía
   * `--accent-gold: #a86f3c` en el style inline del <html>. Estaba en verde y
   * fijaba como contrato justo el mecanismo que rompía los temas: un inline le
   * gana a `:root`, a `html.dark` y a `html.dark.theme-vela`. De ahí que ahora
   * el negativo se compruebe explícitamente.
   */
  it('no toca el style inline: los temas mandan sobre el acento', () => {
    vi.setSystemTime(new Date('2026-05-31T19:00:00'))
    renderHook(() => useTimeOfDayAccent())

    expect(document.documentElement.style.getPropertyValue('--accent-gold')).toBe('')
    expect(document.documentElement.dataset.accentHour).toBe('atardecer')
  })

  it('deja de reevaluar al desmontar', () => {
    vi.setSystemTime(new Date('2026-05-31T08:00:00'))
    const { unmount } = renderHook(() => useTimeOfDayAccent())
    unmount()

    vi.setSystemTime(new Date('2026-05-31T22:00:00'))
    vi.advanceTimersByTime(30 * 60 * 1000)

    expect(document.documentElement.dataset.accentHour).toBe('mañana')
  })
})

// ---------- la paleta, leída del CSS real ----------

// `import.meta.url` aquí es una URL http (entorno jsdom), no de fichero; la
// raíz de vitest sí apunta al repo.
const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/** Selector base de cada tema; de ahí sale el `--paper-50` sobre el que se lee. */
const TEMAS = [
  { nombre: 'día', selector: ':root' },
  { nombre: 'noche', selector: 'html.dark' },
  { nombre: 'vela', selector: 'html.dark.theme-vela' },
] as const

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `--paper-50: 26 20 14;` dentro del bloque base del tema. */
function paperDelTema(selector: string): [number, number, number] {
  const bloque = new RegExp(`${escapar(selector)}\\s*\\{`).exec(CSS)
  if (!bloque) throw new Error(`sin bloque base para ${selector}`)
  const decl = /--paper-50:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/.exec(CSS.slice(bloque.index))
  if (!decl) throw new Error(`sin --paper-50 en ${selector}`)
  return [Number(decl[1]), Number(decl[2]), Number(decl[3])]
}

/** `--accent-gold: #cd9e74;` dentro de `<selector>[data-accent-hour='<hora>']`. */
function acentoDeHora(selector: string, hora: AccentHour): [number, number, number] {
  const bloque = bloqueDeHora(selector, hora)
  const hex = bloque && /--accent-gold:\s*#([0-9a-fA-F]{6})\s*;/.exec(bloque)?.[1]
  if (!hex) throw new Error(`sin --accent-gold para ${selector} @ ${hora}`)
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `--accent-gold-soft: rgb(212 170 134 / 0.16);` → color y alfa. */
function rellenoDeHora(
  selector: string,
  hora: AccentHour,
): { rgb: [number, number, number]; alfa: number } {
  const bloque = bloqueDeHora(selector, hora)
  const decl =
    bloque &&
    /--accent-gold-soft:\s*rgb\((\d+) (\d+) (\d+)\s*\/\s*([\d.]+)\)\s*;/.exec(bloque)
  if (!decl) throw new Error(`sin --accent-gold-soft para ${selector} @ ${hora}`)
  return {
    rgb: [Number(decl[1]), Number(decl[2]), Number(decl[3])],
    alfa: Number(decl[4]),
  }
}

/** Compone un color translúcido sobre su fondo, como haría el navegador. */
function componer(
  fg: [number, number, number],
  alfa: number,
  bg: [number, number, number],
): [number, number, number] {
  const mezcla = (f: number, b: number) => Math.round(f * alfa + b * (1 - alfa))
  return [mezcla(fg[0], bg[0]), mezcla(fg[1], bg[1]), mezcla(fg[2], bg[2])]
}

function bloqueDeHora(selector: string, hora: AccentHour): string | null {
  const re = new RegExp(
    `${escapar(selector)}\\[data-accent-hour='${hora}'\\]\\s*\\{([^}]*)\\}`,
  )
  return re.exec(CSS)?.[1] ?? null
}

/** Ratio de contraste WCAG 2.x entre dos colores sRGB. */
function contraste(a: [number, number, number], b: [number, number, number]): number {
  const canal = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luz = ([r, g, bl]: [number, number, number]) =>
    0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(bl)
  const [la, lb] = [luz(a), luz(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('paleta horaria del acento (src/index.css)', () => {
  /**
   * `.section-eyebrow-serif`, `.chip[data-tone='gold']` y los estados
   * `aria-busy` de los CTA de IA pintan texto con `--accent-gold` a 12–14px.
   * WCAG AA pide 4.5:1 a ese tamaño; el fallo que motivó esto llegó a 3.37.
   */
  it.each(TEMAS)('el acento es legible a toda hora en $nombre', ({ selector }) => {
    const papel = paperDelTema(selector)
    for (const hora of HOURS) {
      const ratio = contraste(acentoDeHora(selector, hora), papel)
      expect(
        ratio,
        `${selector} @ ${hora} → ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * Una hora sin entrada no rompe nada visible: cae al `--accent-gold` base del
   * tema, que es legible. Por eso el hueco pasaría inadvertido salvo por esto.
   */
  it('ningún tema se queda sin paleta', () => {
    for (const { selector } of TEMAS) {
      for (const hora of HOURS) {
        expect(() => acentoDeHora(selector, hora)).not.toThrow()
      }
    }
  })

  /**
   * El par que de verdad se lee no es oro sobre papel: `.chip[data-tone='gold']`
   * y `PreviewBanner` pintan el oro sobre su propio `--accent-gold-soft`, que
   * acerca el fondo al texto y baja el contraste ~0.7 puntos. Es el caso más
   * exigente de los dos, así que es el que decide si la paleta sirve.
   */
  it.each(TEMAS)(
    'el acento se lee sobre su propio relleno en $nombre',
    ({ selector }) => {
      const papel = paperDelTema(selector)
      for (const hora of HOURS) {
        const oro = acentoDeHora(selector, hora)
        const { rgb, alfa } = rellenoDeHora(selector, hora)
        const ratio = contraste(oro, componer(rgb, alfa, papel))
        expect(
          ratio,
          `${selector} @ ${hora} → ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  /**
   * Si falta el relleno, el chip conserva el de otra hora y el par de arriba
   * deja de estar calculado — pero nada se ve roto, así que hay que decirlo.
   */
  it('cada acento trae su relleno a juego', () => {
    for (const { selector } of TEMAS) {
      for (const hora of HOURS) {
        expect(() => rellenoDeHora(selector, hora)).not.toThrow()
      }
    }
  })
})
