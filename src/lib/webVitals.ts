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
    path: window.location.pathname,
  })
  try {
    const blob = new Blob([payload], { type: 'application/json' })
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/web-vitals', blob)
    } else {
      // Fallback: fetch keepalive (Safari iOS no soporta sendBeacon en
      // todas las versiones aún).
      void fetch('/api/web-vitals', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    }
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
