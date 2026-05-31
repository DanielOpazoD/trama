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

- **Sentry / Datadog / similar**: no es necesario hoy (single-user, low volume). El stack interno con `error_log` + `logEvent` cubre los casos relevantes. Si en el futuro el volume justifica un SaaS, considerar Sentry (gratis hasta 5k events/month).
- **OpenTelemetry**: idem — costo de instrumentación supera el valor en single-user.
- **PagerDuty / on-call**: la app no es crítica de negocio. Si se rompe a la madrugada, espera.
- **APM real**: Netlify deja ver latencia per-function en su dashboard; no agregamos otra capa.
- **Lighthouse CI** en GitHub Actions: el budget de bundle-size ya cubre el caso más común (regresiones por imports). Lighthouse en CI agrega 3-5 min a cada PR y los thresholds suelen ser ruidosos. Postponed.

## Cuándo cambia este doc

- Cada vez que agregamos un endpoint nuevo: agregar a la tabla de SLOs.
- Cada vez que cruzamos un SLO en producción: subir el threshold (si es genuino) o investigar (si fue regression).
- Cada vez que sumamos un canal de telemetría: agregar acá.
