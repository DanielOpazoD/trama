import { buildSeed } from './demoSeed'
import type { Store } from './demoTypes'

export const STORE_KEY = 'trama-demo-store'

function normalizeStore(parsed: Partial<Store>): Store {
  return {
    entities: parsed.entities ?? [],
    relationships: parsed.relationships ?? [],
    quotes: parsed.quotes ?? [],
    momentos: parsed.momentos ?? [],
    notes: parsed.notes ?? [],
    tasks: parsed.tasks ?? [],
    prompts: parsed.prompts ?? [],
    secrets: parsed.secrets ?? [],
    notas_attachments: parsed.notas_attachments ?? [],
    recortes: parsed.recortes ?? [],
    favoritos: parsed.favoritos ?? [],
    'reading-tables': parsed['reading-tables'] ?? [],
    momento_comments: parsed.momento_comments ?? [],
    momento_reactions: parsed.momento_reactions ?? [],
    month_notes: parsed.month_notes ?? [],
    user_prefs: parsed.user_prefs ?? {},
  }
}

export function loadDemoStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw) return normalizeStore(JSON.parse(raw) as Partial<Store>)
  } catch {
    /* corrupto → re-sembramos */
  }
  const seed = buildSeed()
  saveDemoStore(seed)
  return seed
}

export function saveDemoStore(store: Store): void {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

export function clearDemoStore(): void {
  window.localStorage.removeItem(STORE_KEY)
}
