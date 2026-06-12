export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

export function dateAgo(n: number): string {
  return daysAgo(n).slice(0, 10)
}

/** Lunes (local) de la semana de hace `n` días, como 'YYYY-MM-DD'. */
export function weekStartAgo(n: number): string {
  const base = new Date(Date.now() - n * 86_400_000)
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const dow = (local.getDay() + 6) % 7 // 0 = lunes
  local.setDate(local.getDate() - dow)
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const dd = String(local.getDate()).padStart(2, '0')
  return `${local.getFullYear()}-${mm}-${dd}`
}

/** Deriva #etiquetas (igual criterio que el servidor). */
export function parseTags(text: string): string[] {
  const out = new Set<string>()
  const re = /(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.add(m[1]!.toLowerCase())
  return [...out]
}

export function extractPromptVariables(text: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,39})\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.add(m[1]!)
  return [...out]
}
