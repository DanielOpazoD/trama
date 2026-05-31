/**
 * N6: Web Vitals tracking.
 *
 * Captura las métricas core (LCP, INP, CLS, FCP, TTFB) que Google usa
 * para "Core Web Vitals" y las envía al backend en `/api/web-vitals`.
 * Si el endpoint no está cableado (lo agregamos después), el sendBeacon
 * falla silencioso — no rompe la app.
 *
 * Por qué endpoint propio en lugar de un SaaS:
 * - Sentry/Datadog son útiles pero agregan ~30KB al bundle.
 * - Para Trama (single-user) basta con persistir en error_log o en
 *   una tabla propia los samples y graficar en el Health panel.
 *
 * Cuándo se llama: una sola vez en main.tsx (initWebVitals()). El
 * web-vitals lib registra los listeners apropiados y llama a `report`
 * cuando una métrica está lista (algunas se reportan al unload, otras
 * al primer input, etc.).
 *
 * Producción solo: skip en dev para no contaminar métricas.
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

type Reporter = (metric: Metric) => void

/**
 * R3: normaliza el `pathname` antes de enviarlo al backend para evitar
 * exfiltrar IDs sensibles a los logs de Web Vitals.
 *
 * Trama hoy usa hash-routing-less SPA (todo vive en `/`), pero el
 * `?entity=<uuid>` queda en `window.location.search`. El pathname suele
 * ser solo `/`, pero si en el futuro adoptamos URLs tipo
 * `/entities/:id`, los UUIDs colmarían `web_vitals_samples` con IDs
 * únicos sin valor analítico — y peor, leakean qué entidades visita
 * el usuario.
 *
 * Reglas:
 *  - UUIDs → `:id`
 *  - Sufijo numérico largo → `:n`
 *  - Search params eliminados (un pathname puro)
 *
 * Si el path es vacío o no es string, devuelve '/' para no romper el
 * INSERT con `null`.
 */
export function normalizePath(pathname: string | undefined): string {
  if (!pathname || typeof pathname !== 'string') return '/'
  // Quitar query string si por alguna razón viene incluida.
  const cleanPath = pathname.split('?')[0] ?? '/'
  return (
    cleanPath
      // UUIDs (cualquier versión) → ":id"
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      // Tramos numéricos largos (≥6 dígitos) — fechas en path, timestamps.
      .replace(/\/\d{6,}/g, '/:n')
  )
}

const defaultReporter: Reporter = (metric) => {
  // Best-effort send. `sendBeacon` no bloquea y respeta unload events;
  // el browser garantiza entrega aún si el user navega antes.
  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    path: normalizePath(window.location.pathname),
  })
  try {
    const blob = new Blob([payload], { type: 'application/json' })
    if (typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon('/api/web-vitals', blob)
      if (queued) return
    }
    // Fallback: fetch keepalive (Safari iOS no soporta sendBeacon en
    // todas las versiones aún; Beacon también puede rechazar el queue).
    void fetch('/api/web-vitals', {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* nunca dejar que web-vitals reporting crashee la app */
  }
}

/**
 * Inicializa los listeners de web-vitals. Solo activo en producción.
 * En dev no spamea el endpoint (que ni siquiera existe localmente).
 */
export function initWebVitals(reporter: Reporter = defaultReporter): void {
  if (import.meta.env.DEV) return
  if (typeof window === 'undefined') return

  onCLS(reporter)
  onFCP(reporter)
  onINP(reporter)
  onLCP(reporter)
  onTTFB(reporter)
}
