/**
 * Extrae variables de prompts con sintaxis {{nombre}}.
 *
 * Solo aceptamos nombres simples para poder convertirlos en inputs fiables en
 * UI: letras, números y guion bajo. Se devuelven únicos y en orden.
 */
export function extractPromptVariables(content: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,39})\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    out.add(m[1]!)
  }
  return [...out]
}
