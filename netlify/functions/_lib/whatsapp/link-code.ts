import { randomInt } from 'node:crypto'

/**
 * Código de vinculación de un solo uso. 6 caracteres de un alfabeto sin
 * ambigüedades (sin O/0, I/1, etc.) para que se dicte/tipee sin error desde
 * el teléfono. No es un secreto de larga vida: expira y se canjea una vez.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const CODE_LEN = 6

/** Minutos de validez de un código recién generado. */
export const LINK_CODE_TTL_MINUTES = 15

export function generateLinkCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)]
  }
  return out
}

/**
 * Normaliza lo que el usuario tipeó: mayúsculas, sin espacios ni guiones.
 * Devuelve null si no encaja con el charset/largo del código emitido — en
 * ese caso el webhook le pide que lo reenvíe.
 */
export function normalizeLinkCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, '')
  return CODE_RE.test(cleaned) ? cleaned : null
}
