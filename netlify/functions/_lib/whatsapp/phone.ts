/**
 * Normalización del número de WhatsApp. Twilio manda el remitente como
 * `whatsapp:+56912345678` (y a veces `whatsapp:+1 415...` con espacios al
 * llegar por sandbox). Lo dejamos en E164 canónico (`+` + dígitos) para que
 * matchee el unique index de `whatsapp_links.phone_e164`.
 */

const E164 = /^\+[1-9][0-9]{6,14}$/

/** `whatsapp:+5691...` | `+56 9 1234 5678` → `+5691234567`, o null si no es E164. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim()
  // Twilio prefija el canal. Puede venir en cualquier capitalización.
  s = s.replace(/^whatsapp:/i, '').trim()
  // Sacar separadores humanos (espacios, guiones, paréntesis) sin tocar el +.
  s = s.replace(/[\s\-().]/g, '')
  if (!E164.test(s)) return null
  return s
}

/** Enmascara para mostrar en la UI: `+56912345678` → `+569·····5678`. */
export function maskPhone(e164: string): string {
  if (e164.length <= 8) return e164
  const head = e164.slice(0, 4)
  const tail = e164.slice(-4)
  return `${head}${'·'.repeat(Math.max(2, e164.length - 8))}${tail}`
}
