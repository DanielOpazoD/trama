/**
 * Clasificación de alertas de salud — lógica PURA y testeable.
 *
 * El handler `health.mts` recolecta señales baratas (counts acotados por
 * tiempo/índice, que ya consultaba para el panel) y delega acá la decisión
 * de "qué está mal, desde cuándo y qué hago". Mantener esta lógica separada
 * del handler permite testear cada umbral sin tocar DB ni `Request`
 * (ver `backend-domain-services.md`: el handler coordina auth/SQL/RLS, la
 * decisión de dominio vive en una función pura).
 *
 * CONTRATO DE PRIVACIDAD: las alertas NUNCA incluyen datos sensibles
 * (emails, tokens, bodies, texto crudo de error con PII). Resumimos:
 * "N errores en la última hora", nunca el contenido del error.
 */

/**
 * Una alerta es algo que el usuario debería mirar. Tres severidades:
 *   info  — útil saber, no urgente
 *   warn  — vale la pena revisar
 *   error — algo está fallando ahora
 *
 * El shape coincide con `HealthAlert` en `src/api/health.ts`; el frontend
 * (`useHealthAlerts`, `HealthPanel`) ya lo consume. Es additive sobre la
 * respuesta existente — no cambiamos campos.
 */
export type HealthAlert = {
  severity: 'info' | 'warn' | 'error'
  /** Identificador estable de la alerta; el cliente lo usa para acknowledgment. */
  code: string
  /** Resumen corto, listo para un banner. Sin datos sensibles. */
  label: string
  /** Qué hacer al respecto. Sin datos sensibles. */
  hint: string
}

/**
 * Señales crudas que alimentan la clasificación. Todas salen de lecturas
 * baratas que el handler ya hace (COUNTs acotados por tiempo/índice y el
 * agregado mensual del cost-cap). NO agregamos scans caros nuevos.
 */
export type HealthSignals = {
  /**
   * Fracción del presupuesto IA mensual consumido (0..1). Sale del mismo
   * cálculo que aplica `cost-cap.ts`: SUM(extraction_log.cost_cents) del mes
   * sobre `users.monthly_budget_cents` (o el fallback `AI_MONTHLY_BUDGET_CENTS`).
   */
  budgetPct: number
  /**
   * Errores de las últimas 24h: COUNT(*) sobre `error_log` acotado por
   * `created_at >= NOW() - INTERVAL '24 hours'` y `user_id`. Sin contenido.
   */
  errors24h: number
  /**
   * Filas sin embedding pendientes de reindexar: COUNTs sobre
   * `entities`/`quotes` con `embedding IS NULL AND deleted_at IS NULL`.
   */
  pendingEmbeddings: number
  /**
   * Estado del cutover de auth. Si Clerk está configurado pero el fallback
   * legacy sigue activo, vale advertir antes de abrir multi-user. No expone
   * secretos: son booleanos derivados de la presencia de env vars.
   */
  clerkConfigured: boolean
  legacyFallbackAllowed: boolean
  /**
   * Métricas cuyo p75 de la última semana cae en «poor» según los umbrales
   * de Google (LCP > 4 s, INP > 500 ms, CLS > 0,25). Sale del percentil que
   * Postgres calcula sobre `web_vitals_samples`. Solo nombres, nunca paths.
   */
  webVitalsPoor: string[]
}

// ── Umbrales ────────────────────────────────────────────────────────
// Comentados y centralizados para que un reviewer entienda "por qué
// salta" sin leer el handler. Son additive: cambiarlos no rompe shape.

/** Budget: error cuando estamos a punto de que el cost-cap corte llamadas. */
export const BUDGET_CRITICAL_PCT = 0.9
/** Budget: warn cuando vamos por encima del 70% del presupuesto mensual. */
export const BUDGET_WARN_PCT = 0.7
/** Errores 24h: error cuando hay una ráfaga (algo recurrente está fallando). */
export const ERRORS_CRITICAL_24H = 10
/** Errores 24h: warn cuando hay más de lo habitual. */
export const ERRORS_WARN_24H = 3
/** Embeddings: info cuando el backlog justifica reindexar (debajo no interrumpe). */
export const EMBEDDINGS_BACKLOG_MIN = 50

/**
 * Construye el arreglo de alertas a partir de las señales. PURA: misma
 * entrada → misma salida, sin efectos colaterales, sin I/O.
 *
 * El orden es por urgencia descendente (budget → auth → errores →
 * embeddings) para que la UI pinte primero lo más grave.
 */
export function buildHealthAlerts(signals: HealthSignals): HealthAlert[] {
  const alerts: HealthAlert[] = []

  // Budget — alertar ANTES de tocar el cap, para que el usuario pueda
  // decidir si subir el cap o pausar antes de que se corten las llamadas.
  if (signals.budgetPct >= BUDGET_CRITICAL_PCT) {
    alerts.push({
      severity: 'error',
      code: 'budget_critical',
      label: 'Gasto IA al 90% del cap',
      hint: 'Próximamente las llamadas LLM van a bloquearse hasta el próximo mes. Sube AI_MONTHLY_BUDGET_CENTS o pausa flujos.',
    })
  } else if (signals.budgetPct >= BUDGET_WARN_PCT) {
    alerts.push({
      severity: 'warn',
      code: 'budget_high',
      label: `Gasto IA al ${Math.round(signals.budgetPct * 100)}% del cap`,
      hint: 'Vas por encima del 70% del presupuesto mensual. Mira el breakdown por provider abajo.',
    })
  }

  // Auth — si Clerk está configurado pero el fallback legacy sigue activo,
  // producción debería cerrar el fallback antes de abrir multi-user.
  if (signals.clerkConfigured && signals.legacyFallbackAllowed) {
    alerts.push({
      severity: 'warn',
      code: 'auth_legacy_fallback',
      label: 'Fallback legacy activo',
      hint: 'Clerk está configurado, pero requests sin token aún caen a legacy-single-user. Producción debería ir con ALLOW_LEGACY_FALLBACK=false antes de abrir multi-user.',
    })
  }

  // Errores recientes — el "hubo algo raro en las últimas 24h". Solo el
  // conteo: nunca el contenido del error (puede traer PII).
  if (signals.errors24h >= ERRORS_CRITICAL_24H) {
    alerts.push({
      severity: 'error',
      code: 'errors_burst',
      label: `${signals.errors24h} errores en 24h`,
      hint: 'Algo está fallando recurrente. Mira la lista de abajo y los stacks.',
    })
  } else if (signals.errors24h >= ERRORS_WARN_24H) {
    alerts.push({
      severity: 'warn',
      code: 'errors_recent',
      label: `${signals.errors24h} errores en 24h`,
      hint: 'Hay más errores de los habituales. Vale la pena una mirada.',
    })
  }

  // Rendimiento — el SLO informal de docs/observability.md dice: si en una
  // semana el p75 entra en «poor», revisar. Antes esa frase no tenía quien la
  // mirara; ahora salta aquí.
  if (signals.webVitalsPoor.length > 0) {
    alerts.push({
      severity: 'warn',
      code: 'web_vitals_poor',
      label: `Rendimiento pobre: ${signals.webVitalsPoor.join(', ')}`,
      hint: 'El p75 de la última semana supera el umbral «poor» de Google. Mira Web Vitals en Estado del sistema y correlaciona con los últimos deploys.',
    })
  }

  // Embeddings sin indexar — info, no urgente. Aparece solo si hay un
  // backlog significativo. Por debajo no vale interrumpir.
  if (signals.pendingEmbeddings >= EMBEDDINGS_BACKLOG_MIN) {
    alerts.push({
      severity: 'info',
      code: 'embeddings_pending',
      label: `${signals.pendingEmbeddings} sin indexar`,
      hint: 'Búsqueda semántica no las cubre todavía. Reindexa desde la sección Búsqueda.',
    })
  }

  return alerts
}

/**
 * Estado global derivado del peor severity de las alertas. Additive:
 * el handler lo agrega como `status` sin tocar el resto del shape.
 *   ok        — silencioso, nada que mirar
 *   degraded  — hay warn/info pero nada crítico
 *   critical  — al menos una alerta error
 */
export type HealthStatus = 'ok' | 'degraded' | 'critical'

export function deriveHealthStatus(alerts: HealthAlert[]): HealthStatus {
  if (alerts.some((a) => a.severity === 'error')) return 'critical'
  if (alerts.length > 0) return 'degraded'
  return 'ok'
}
