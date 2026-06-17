/**
 * DD4 (audit #4): client-side error tracking global.
 *
 * Contexto: ErrorBoundary.tsx ya capta crashes en el render tree de React
 * y los POSTea a /api/error-log. Pero hay errores que NO llegan al
 * boundary:
 *   - errores en event handlers (onClick async que throwea)
 *   - promises rechazadas sin catch (.then sin .catch)
 *   - errores en `setTimeout` / `requestAnimationFrame`
 *   - errores en imports dinámicos que fallan tarde
 *
 * Esos hoy se loguean en consola y desaparecen. Con esto los enviamos al
 * mismo endpoint que los errores de servidor + ErrorBoundary, lo que los
 * hace visibles en Settings → Logs y en HealthPanel.
 *
 * Defensa: throttle por hash del mensaje para evitar tormentas (un error
 * en un loop podría hacer 1000 POSTs/segundo). Una vez por minuto por
 * mensaje único.
 */

import { apiFetch } from '../api/request'
import { requestReloadForStaleAsset } from './staleAssetRecovery'

const POST_THROTTLE_MS = 60_000
const recentlySent = new Map<string, number>()

function shouldSkip(hash: string): boolean {
  const now = Date.now()
  const last = recentlySent.get(hash)
  if (last !== undefined && now - last < POST_THROTTLE_MS) {
    return true
  }
  recentlySent.set(hash, now)
  // Limpieza ocasional para no crecer el Map indefinidamente. Si tiene
  // más de 100 entradas, descartar las más viejas.
  if (recentlySent.size > 100) {
    const oldest = Array.from(recentlySent.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 50)
      .map(([k]) => k)
    for (const k of oldest) recentlySent.delete(k)
  }
  return false
}

function postError(payload: {
  message: string
  stack?: string | null
  source?: string
}): void {
  // Hash conservador: source + primeros 200 chars del message. Errores
  // idénticos del mismo source se agrupan.
  const hash = `${payload.source ?? 'global'}|${payload.message.slice(0, 200)}`
  if (shouldSkip(hash)) return

  // sendBeacon es ideal aquí: no bloquea la página al cerrar, y no requiere
  // CORS preflight. Si no está disponible (navegadores muy viejos), fetch
  // con keepalive.
  const body = JSON.stringify({
    message: `[${payload.source ?? 'global'}] ${payload.message}`,
    stack: payload.stack ?? null,
    path: typeof window !== 'undefined' ? window.location.pathname : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/error-log', blob)
      return
    }
    void apiFetch('/api/error-log', {
      method: 'POST',
      body,
      keepalive: true,
    }).catch(() => {
      // Best-effort. No re-throw porque estamos en un handler de error
      // global — un throw acá entra en loop infinito.
    })
  } catch {
    // Silenciar — la última cosa que queremos es que el tracker de errores
    // se vuelva el origen de los errores.
  }
}

let installed = false

/**
 * Instalar listeners globales de error. Idempotente — si se llama dos
 * veces (HMR, montaje doble en strict mode), solo registra una vez.
 *
 * Cómo se diferencian las fuentes:
 *   - `window.error`: errores sincrónicos no capturados (event handlers,
 *     console-grade JS errors). El handler recibe stack + filename + lineno.
 *   - `window.unhandledrejection`: Promises rejectadas sin .catch.
 *     `event.reason` puede ser Error o cualquier cosa.
 */
export function installClientErrorTracking(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    // Filtros: errores de carga de recursos (imgs, scripts) tienen target
    // ≠ window. Esos los ignoramos — son ruido y dependen del navegador
    // y del estado de la red, no problemas de código.
    if (event.target && event.target !== window) return
    const err = event.error
    const message =
      err instanceof Error ? err.message : String(event.message ?? 'unknown')
    const stack = err instanceof Error ? err.stack : null
    postError({ message, stack, source: 'window.error' })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (requestReloadForStaleAsset(reason)) {
      event.preventDefault()
      return
    }
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : safeStringify(reason)
    const stack = reason instanceof Error ? reason.stack : null
    postError({
      message: message || 'unhandledrejection sin reason',
      stack,
      source: 'unhandledrejection',
    })
  })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value).slice(0, 500)
  }
}
