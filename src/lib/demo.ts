/**
 * Modo prueba (demo) — un backend liviano en el navegador.
 *
 * Cuando está activo, `request()` (src/api/request.ts) NO pega a `/api/*`:
 * delega acá, que sirve desde un store en `localStorage` sembrado con datos
 * de ejemplo. Permite recorrer y EDITAR la app (entidades, relaciones, citas,
 * momentos, notas, tareas) sin cuenta ni base de datos — todo queda en este
 * navegador, con el banner "modo prueba". Las funciones de IA quedan
 * desactivadas (no gastan API).
 *
 * Las formas que devuelve son las del SERVIDOR (snake_case): los transforms de
 * `src/api/` corren después, igual que con el backend real.
 */
import { routeDemoRequest } from './demoRouter'
import { clearDemoStore, loadDemoStore as load } from './demoStore'

export { demoMediaResponse } from './demoMedia'

const FLAG_KEY = 'trama-demo'

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(FLAG_KEY) === '1'
}
export function enterDemoMode(): void {
  window.localStorage.setItem(FLAG_KEY, '1')
}
export function exitDemoMode(): void {
  window.localStorage.removeItem(FLAG_KEY)
  clearDemoStore()
}

// ---------- Store ----------

export async function demoRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  let body: Record<string, unknown> = {}
  if (init?.body && typeof init.body === 'string') {
    body = JSON.parse(init.body) as Record<string, unknown>
  } else if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
    body = Object.fromEntries(init.body.entries())
  }
  const [rawPath, qs] = url.split('?')
  const params = new URLSearchParams(qs ?? '')
  const store = load()
  // Pequeña latencia para que las transiciones/skeletons se sientan reales.
  await new Promise((r) => setTimeout(r, 80))
  return routeDemoRequest(method, rawPath ?? url, params, body, store) as T
}
