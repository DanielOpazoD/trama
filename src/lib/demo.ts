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

/** Parámetro de la URL que entra al modo prueba sin pasar por el login. */
const DEMO_URL_PARAM = 'demo'

/**
 * Entra al modo prueba si la URL trae `?demo=1`, y borra el parámetro de la
 * barra de direcciones.
 *
 * Existe para que un enlace del README lleve a la app FUNCIONANDO en un clic:
 * sin cuenta, sin base de datos y sin claves de IA. Antes había que descubrir
 * el botón «explorar en modo prueba» en la pantalla de acceso, y nadie que
 * llega de fuera sabe que ese botón existe.
 *
 * Es de un solo sentido —nunca saca del modo prueba— para que un enlace
 * compartido no pueda tirar los datos de nadie: salir es siempre un gesto
 * explícito del usuario, con su confirmación.
 */
export function enterDemoModeFromUrl(location: {
  search: string
  href: string
}): boolean {
  const params = new URLSearchParams(location.search)
  if (params.get(DEMO_URL_PARAM) !== '1') return false
  enterDemoMode()
  // El parámetro ya cumplió: se quita para que la barra de direcciones (y lo
  // que el usuario copie de ahí) no arrastre un modo que ya está activo.
  const url = new URL(location.href)
  url.searchParams.delete(DEMO_URL_PARAM)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  return true
}

// ---------- Store ----------

export async function demoRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  let body: Record<string, unknown> = {}
  if (init?.body && typeof init.body === 'string') {
    body = JSON.parse(init.body) as Record<string, unknown>
  } else if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
    const form = init.body
    body = Object.fromEntries(form.entries())
    // Subida multi-archivo: `Object.fromEntries` colapsa los `file`/`takenAt`
    // repetidos a uno solo. Extraemos TODOS bajo una clave reservada (alineados
    // por índice) para que el router pueda recorrerlos sin perder ninguno.
    const files = form.getAll('file').filter((f): f is File => f instanceof File)
    if (files.length > 0) {
      const takenAt = form.getAll('takenAt')
      body.__uploadFiles = files.map((file, i) => ({
        name: file.name,
        mime: file.type,
        size: file.size,
        takenAt: typeof takenAt[i] === 'string' ? (takenAt[i] as string) : null,
      }))
    }
  }
  const [rawPath, qs] = url.split('?')
  const params = new URLSearchParams(qs ?? '')
  const store = load()
  // Pequeña latencia para que las transiciones/skeletons se sientan reales.
  await new Promise((r) => setTimeout(r, 80))
  return routeDemoRequest(method, rawPath ?? url, params, body, store) as T
}
