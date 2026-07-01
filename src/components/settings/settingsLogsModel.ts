import type { ErrorLogEntry } from '../../api'

export type GroupedErrorEntry = {
  representative: ErrorLogEntry
  count: number
}

/**
 * Agrupa errores con misma function + status + primeros 200 chars del message.
 * El representante queda como la ocurrencia mas reciente para conservar contexto.
 */
export function dedupErrorEntries(entries: ErrorLogEntry[]): GroupedErrorEntry[] {
  const groups = new Map<string, GroupedErrorEntry>()
  for (const entry of entries) {
    const key = `${entry.functionName}|${entry.statusCode ?? 'NA'}|${entry.message.slice(0, 200)}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (entry.createdAt > existing.representative.createdAt) {
        existing.representative = entry
      }
      continue
    }
    groups.set(key, { representative: entry, count: 1 })
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.representative.createdAt === b.representative.createdAt) return 0
    return a.representative.createdAt < b.representative.createdAt ? 1 : -1
  })
}
