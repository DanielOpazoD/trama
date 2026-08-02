# ADR 0014: Multiuser Operational Observability

> **Nota de numeración.** Este ADR se archivó originalmente como `0011`
> (PR #249, 2026-06-19). Otro ADR posterior —«Legacy Identity Cutover»,
> PR #260— tomó el mismo número y fue el que entró al índice, así que éste
> quedó huérfano: existía en el repositorio pero no figuraba en ninguna
> lista. Se renumera al siguiente libre y se añade al índice. Si encuentras
> una referencia a «ADR 0011 · observabilidad», es este documento.

## Estado

Aceptado.

## Contexto

La aplicación ya tiene Clerk, `user_id`, RLS, `ensureUserRow()`, smoke
multiusuario y contratos runtime para rutas `/api/*`. Eso reduce mucho el riesgo
de fuga entre usuarios, pero no responde por sí solo a preguntas operacionales:

- ¿Un deploy-preview está aislando usuarios reales ahora?
- ¿Un 401 fue falta de token, fallback legacy o ruta mal montada?
- ¿El endpoint respondió JSON de API o el HTML de la SPA?
- ¿Qué evidencia pegamos en un PR sin copiar tokens ni contenido privado?
- ¿Qué mira alguien si un usuario reporta datos cruzados?

Antes de este ADR, esa evidencia estaba repartida entre logs, tests, scripts y
comentarios manuales. El costo no era de arquitectura; era de trazabilidad.

## Decisión

Creamos una capa mínima de observabilidad operacional multiusuario:

1. **Vocabulario cerrado de eventos operacionales**
   - `auth.denied`
   - `auth.fallback`
   - `auth.verified`
   - `owner.mismatch`
   - `blob.access.denied`
   - `mutation.created`
   - `mutation.deleted`
   - `smoke.passed`
   - `smoke.failed`

2. **Contexto seguro por request**
   - `requestId`
   - `method`
   - `path` sin querystring
   - `operation`
   - `userId`
   - `status`
   - `reason`

3. **Redacción centralizada**
   - Todo payload pasa por `redactLogValue()`.
   - No se logean bodies, prompts, cookies, JWT, emails ni contenido de notas.
   - `details` existe solo para metadatos diagnósticos ya redactados.

4. **Health productivo más explícito**
   - `auth` declara modo actual: legacy, Clerk estricto o Clerk con fallback.
   - `operational` declara `requestId`, DB reachable, contrato runtime,
     comando de smoke reportable y estrategia de redacción.

5. **Smoke reportable**
   - `npm run smoke:production-report` genera Markdown/JSON redactado.
   - Combina preflight estricto, probe runtime de rutas y E2E env-gated.
   - El resultado es apto para comentario de PR o incidente.

6. **Guardrail CI**
   - `npm run check:operational-observability` bloquea drift de eventos, docs,
     integración auth/wrapper, health y comando reportable.

## Consecuencias

### Positivas

- Los PRs que tocan privacidad pueden incluir evidencia operacional generada,
  no solo “tests pasaron”.
- Los logs de Netlify quedan más legibles para auth y fallback.
- El diagnóstico copiable de Health incluye los contratos relevantes.
- El runbook de incidentes tiene una ruta concreta para A/B, anónimo, fallback,
  rutas `/api/*` y blobs.

### Costos

- Hay un poco más de superficie de test y docs.
- Algunos endpoints críticos pasan contexto a `getAuthedUser()`.
- El comando live sigue requiriendo tokens A/B frescos; no se automatiza la
  emisión de credenciales reales dentro de CI por seguridad.

## Alternativas Consideradas

### OpenTelemetry completo

No adoptamos OpenTelemetry en esta etapa. La app es privada, el volumen es bajo
y el problema inmediato no es tracing distribuido: es demostrar aislamiento y
diagnosticar fallback/routing sin filtrar secretos.

### Sentry/Datadog

También se descarta por ahora. `error_log`, `x-request-id`, Netlify logs y
smokes reportables cubren el riesgo actual sin enviar contenido sensible a un
tercero.

### Solo documentación

Insuficiente. Sin guardrail, el vocabulario de eventos y el comando reportable
se degradan con el tiempo.

### Solo tests

Insuficiente. Los tests locales no explican qué hacer en producción cuando falla
un deploy-preview con tokens reales.

## Criterios de Éxito

- `npm run check:operational-observability` pasa en CI.
- `/api/health` expone `auth` y `operational`.
- `npm run smoke:production-report` produce Markdown sin tokens.
- `auth.denied` aparece cuando `withObservability` convierte
  `UnauthenticatedError` en 401.
- `auth.verified` y `auth.fallback` pueden emitirse desde `getAuthedUser()` si
  el caller entrega contexto operacional.

## Límites Deliberados

- No se agrega store global.
- No se agrega event bus.
- No se reescribe el sistema de logs.
- No se persisten eventos operacionales en DB.
- No se instrumentan todos los endpoints en este PR; solo superficies críticas
  cubiertas por smoke y health.
