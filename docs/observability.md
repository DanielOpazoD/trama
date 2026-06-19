# Observability — Trama

Este documento define **qué medimos**, **dónde se ve**, y **cuándo nos preocupamos** (SLOs). Es la referencia operacional cuando algo "se siente lento" o cuando querés saber si una optimización valió la pena.

## Canales de telemetría

### 1. Errores

| Canal                          | Qué captura                                                                       | Dónde se ve                                                    |
| ------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ErrorBoundary` (React)        | crashes en el render tree del cliente                                             | `/api/error-log` POST → `error_log` tabla + Settings → Logs UI |
| `installClientErrorTracking()` | unhandled promise rejections + errores de event handlers + setTimeout/setInterval | mismo path que ErrorBoundary                                   |
| `persistError()` (server)      | 4xx + 5xx en handlers + crashes server-side                                       | `error_log` tabla + Settings → Logs                            |
| `logErrorEvent()` (server)     | warnings estructurados sin status code                                            | stdout → Netlify Functions logs                                |

Todos los errors llevan `request_id` para correlación entre cliente y servidor. El header `x-request-id` en cada response es la trazabilidad.

### 2. Eventos de negocio (structured logs)

`logEvent({ event: 'algo', ...payload })` → JSON line a stdout → Netlify Functions logs.

Eventos importantes:

- `extraction_completed` (extract.mts)
- `ask_completed` (ask.mts)
- `chat_message_completed` (chat-messages.mts)
- `spotify_palette_completed` (spotify-library-snapshot.mts)
- `quote_reflect_completed` (quote-reflect.mts)
- `proactive_suggestions_*` (proactive-suggestions.mts)
- `web_vitals` (web-vitals.mts — cliente)
- `spotify_scheduled_sync_*` (cron)

Cada uno reporta `provider`, `model`, `tokensIn`, `tokensOut`, `costCents`, `durationMs`, `fromCache` — suficiente para reconstruir costo y latencia post-hoc.

### 2.1 Eventos operacionales multiusuario

Los eventos operacionales son JSON lines emitidos con `logOperationalEvent()`
desde `netlify/functions/_lib/operational-events.ts`. No reemplazan
`error_log`: son evidencia breve para saber qué pasó durante auth, ownership,
mutaciones privadas y smokes productivos.

Vocabulario permitido:

| Evento               | Cuándo aparece                                     | Severidad típica |
| -------------------- | -------------------------------------------------- | ---------------- |
| `auth.denied`        | Request privada termina en 401                     | `warn`           |
| `auth.fallback`      | Clerk no está configurado, owner legacy o fallback | `warn`           |
| `auth.verified`      | Token/PAT válido resuelve owner                    | `info`           |
| `owner.mismatch`     | Recurso existe pero no pertenece al owner actual   | `warn`           |
| `blob.access.denied` | Blob/attachment privado rechaza acceso cross-user  | `warn`           |
| `mutation.created`   | Mutación crea fixture o entidad privada observable | `info`           |
| `mutation.deleted`   | Mutación borra/soft-delete fixture privada         | `info`           |
| `smoke.passed`       | Smoke multiusuario productivo termina verde        | `info`           |
| `smoke.failed`       | Smoke multiusuario productivo falla                | `error`          |

Matriz de acción rápida:

| Evento               | Origen principal                           | Acción esperada                                              |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `auth.denied`        | `withObservability` ante request sin auth  | Confirmar anónimo = 401 y que no esté activo fallback legacy |
| `auth.fallback`      | `getAuthedUser()`                          | Revisar `ALLOW_LEGACY_FALLBACK` y owner legacy               |
| `auth.verified`      | `getAuthedUser()`                          | Usar como correlación de owner para requestId                |
| `owner.mismatch`     | Mutación/lectura por id scopiada por owner | Investigar intento cross-user o fixture inexistente          |
| `blob.access.denied` | Lectura/delete de attachment/blob privado  | Revisar key namespace, owner y endpoint de blobs             |
| `mutation.created`   | Smoke o mutación privada observable        | Confirmar cleanup/soft-delete posterior                      |
| `mutation.deleted`   | Smoke o mutación privada observable        | Confirmar que el owner ya no lista el fixture                |
| `smoke.passed`       | `smoke:production-report`                  | Pegar Markdown en PR/incidente                               |
| `smoke.failed`       | `smoke:production-report`                  | Bloquear merge/deploy hasta aislar causa                     |

El payload permitido debe caber en contexto operacional: `requestId`, `method`,
`path`, `operation`, `userId`, `status`, `reason` y `details` ya redactado. No
incluyas bodies, prompts, cookies, JWT, emails o contenido de notas. La
redacción estructurada de `redactLogValue()` cubre secretos y PII comunes, pero
el contrato sigue siendo no logear contenido sensible si no aporta diagnóstico.

Para generar evidencia reportable de producción o deploy-preview:

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run smoke:production-report
```

El output es Markdown sin tokens, listo para pegar en un PR o incidente. Debe
incluir `production_smoke: ok`, `anonymous_401: ok`,
`runtime_api_route_probe: ok` y `playwright_smoke: ok`.

### 3. Core Web Vitals

`web-vitals` lib en `src/lib/webVitals.ts` registra los listeners. Cada métrica viaja a `/api/web-vitals` vía `sendBeacon`. Solo en producción.

Métricas reportadas:

- **LCP** (Largest Contentful Paint) — cuándo el contenido principal está renderizado
- **INP** (Interaction to Next Paint) — latencia de la peor interacción de la sesión
- **CLS** (Cumulative Layout Shift) — cuánto salta el layout
- **FCP** (First Contentful Paint) — primer pixel visible
- **TTFB** (Time to First Byte) — latencia de red

### 4. Cost tracking

Cada llamada LLM persiste un row en `extraction_log` con `cost_cents`. `cost-alert-check.mts` (cron) agrupa por `user_id`, compara contra `users.monthly_budget_cents` con fallback a `AI_MONTHLY_BUDGET_CENTS`, y dispara webhook por usuario si cruza el threshold.

`/api/extraction-log` GET (auth + per-user filter) muestra el total mensual + breakdown por modelo en Settings → Logs → Llamadas IA.

## SLOs (Service Level Objectives)

Targets aspiracionales. Cuando los pasamos sostenidamente, abrimos un incidente y miramos qué cambió.

### Frontend (Web Vitals — p75 de la sesión)

| Métrica | Good    | Needs improvement | Poor (incident) |
| ------- | ------- | ----------------- | --------------- |
| LCP     | < 2.5s  | 2.5s – 4.0s       | > 4.0s          |
| INP     | < 200ms | 200ms – 500ms     | > 500ms         |
| CLS     | < 0.1   | 0.1 – 0.25        | > 0.25          |
| FCP     | < 1.8s  | 1.8s – 3.0s       | > 3.0s          |
| TTFB    | < 800ms | 800ms – 1.8s      | > 1.8s          |

Si en una semana el p75 de cualquier métrica entra en "poor", revisar Settings → Logs → buscar `event:web_vitals rating:poor` y correlacionar con deploys.

### Backend (latencia de endpoints clave)

| Endpoint                                            | p50         | p95       | p99       |
| --------------------------------------------------- | ----------- | --------- | --------- |
| `GET /api/entities` (wholesale)                     | < 200ms     | < 500ms   | < 1s      |
| `GET /api/graph/neighbors`                          | < 300ms     | < 800ms   | < 1.5s    |
| `POST /api/extract` (LLM)                           | < 4s        | < 8s      | < 15s     |
| `POST /api/ask` (LLM con RAG)                       | < 5s        | < 10s     | < 20s     |
| `POST /api/chat-messages` (streaming)               | TTFT < 1.5s | TTFT < 3s | TTFT < 5s |
| `GET /api/search` (hybrid)                          | < 400ms     | < 1s      | < 2s      |
| `POST /api/spotify/library-snapshot` (LLM + 3 APIs) | < 6s        | < 12s     | < 25s     |

TTFT = Time to First Token (relevante para streaming).

### Disponibilidad

- **Frontend** (Netlify CDN): 99.9% (~8.7h downtime/year aceptable).
- **Backend** (Netlify Functions + Neon): 99.5% (~43h/year — Neon serverless es el principal upstream).
- **LLM providers**: best-effort. Si un provider está caído, el handler intenta el fallback configurado (`verifyWith` en `ai_task_providers`) o devuelve `UPSTREAM` 502 al cliente.

## Cómo investigar un incidente

1. **¿Cuándo empezó?** — mirar deploys recientes en `https://app.netlify.com/projects/tramadaod/deploys`. Probable correlación con el último deploy.
2. **¿Qué endpoints fallan?** — Settings → Logs → Errores. Filtrar por `status_code >= 500`.
3. **¿Cuál es el `requestId` del usuario afectado?** — el header `x-request-id` de la response failure. Buscar ese ID en `error_log.request_id` para ver el server-side stack.
4. **¿Es un patrón?** — el dedup en LogsPanel agrupa errores idénticos. Si el "count" del patrón se disparó hace 1h, es nuevo (no flaky).
5. **¿Es un upstream?** — `provider`/`model` en el log payload. Si todos los errors son del mismo provider, probable degradation upstream.
6. **¿Rollback?** — `docs/deploy.md` tiene los pasos. Netlify deja hacer rollback al deploy anterior con un click.

## Lo que NO hacemos (todavía)

Decisiones aplazadas, documentadas para no re-discutirlas:

- **Sentry / Datadog / similar**: no es necesario hoy (app privada, low volume). El stack interno con `error_log` + `logEvent` cubre los casos relevantes sin enviar stacks a otro SaaS. Si en el futuro el volume justifica un SaaS, considerar Sentry (gratis hasta 5k events/month).
- **OpenTelemetry**: idem — el costo de instrumentación supera el valor mientras siga siendo una app privada de bajo tráfico.
- **PagerDuty / on-call**: la app no es crítica de negocio. Si se rompe a la madrugada, espera.
- **APM real**: Netlify deja ver latencia per-function en su dashboard; no agregamos otra capa.
- **Lighthouse CI** en GitHub Actions: el budget de bundle-size ya cubre el caso más común (regresiones por imports). Lighthouse en CI agrega 3-5 min a cada PR y los thresholds suelen ser ruidosos. Postponed.

## Cuándo cambia este doc

- Cada vez que agregamos un endpoint nuevo: agregar a la tabla de SLOs.
- Cada vez que cruzamos un SLO en producción: subir el threshold (si es genuino) o investigar (si fue regression).
- Cada vez que sumamos un canal de telemetría: agregar acá.
