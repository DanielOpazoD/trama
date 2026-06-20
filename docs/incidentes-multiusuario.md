# Incidentes Multiusuario

Runbook corto para diagnosticar problemas de aislamiento, auth, fallback,
routing `/api/*` y blobs/attachments en producción o deploy-preview.

## Evidencia Base

Antes de tocar código o cambiar variables:

```bash
E2E_BASE_URL=https://<sitio-o-preview>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run smoke:production-report
```

Resultado sano:

```text
production_smoke: ok
anonymous_401: ok
runtime_api_route_probe: ok
playwright_smoke: ok
```

Nunca pegues JWT, cookies de Clerk, `CLERK_SECRET_KEY`, bodies de notas,
prompts, emails o payloads privados en comentarios de PR. Usa solo el Markdown
redactado del comando y `requestId`.

## Matriz de Diagnóstico

| Síntoma                                           | Evidencia a mirar                                                     | Causa probable                                                         | Acción                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Usuario A ve datos de B                           | Smoke A/B falla; buscar `owner.mismatch` o queries sin `user_id`      | Falta filtro owner/RLS o endpoint usa recurso por id sin validar owner | Bloquear merge/deploy; revisar endpoint y test de aislamiento         |
| Anónimo recibe 200                                | `anonymous_401: failed_status_200`; Health muestra fallback activo    | `ALLOW_LEGACY_FALLBACK=true` o Clerk ausente en producción             | Apagar fallback, verificar Clerk env, redeploy                        |
| Token inválido entra como legacy                  | `auth.fallback` en Netlify logs con Clerk configurado                 | Fallback legacy permitido durante cutover                              | Confirmar si es preview permitido; en producción debe ser incidente   |
| `/api/*` devuelve HTML                            | `runtime_api_route_probe` falla por SPA/html fallback                 | `config.path` ausente en wrapper o ruta montada solo nativa            | Revisar `netlify/functions/*.mts` y `check:runtime-api-routes`        |
| `/.netlify/functions/*` funciona pero `/api/*` no | Probe runtime falla, native manual responde                           | Routing Netlify público roto                                           | Arreglar `config.path`; no aceptar workaround en cliente              |
| Blob de A visible para B                          | E2E blob isolation falla o `blob.access.denied` ausente donde debería | Endpoint descarga blob sin validar owner antes de firmar/leer          | Cortar acceso, añadir check owner y test A/B                          |
| Health carga pero oculta fallback                 | `/api/health` sin `auth` u `operational`                              | Shape viejo de health o deploy desactualizado                          | Verificar commit desplegado; correr `check:operational-observability` |
| PR no tiene evidencia reproducible                | Comentario manual sin comando                                         | Smoke live no corrido o tokens expirados                               | Pedir tokens frescos A/B y repetir `smoke:production-report`          |

## Lectura de Eventos

Los eventos operacionales viven en Netlify Functions logs como JSON lines.

Eventos esperados:

- `auth.denied`: request privada sin auth válida terminó en 401.
- `auth.verified`: token/PAT válido resolvió owner.
- `auth.fallback`: se usó legacy por Clerk ausente, owner mapeado o fallback
  explícito.
- `owner.mismatch`: el recurso existe, pero no pertenece al owner actual.
- `blob.access.denied`: acceso a blob/attachment privado fue rechazado.
- `mutation.created`: fixture privada creada por smoke o mutación observable.
- `mutation.deleted`: fixture privada eliminada/soft-deleted.
- `smoke.passed`: smoke productivo terminó verde.
- `smoke.failed`: smoke productivo falló.

Si un log contiene token, cookie, email o contenido de nota, eso es bug de
redacción. La respuesta no es “copiar menos”; la respuesta es corregir el
payload o `redactLogValue()`.

## Procedimiento: Usuario A ve datos de B

1. Pedir hora aproximada, usuario afectado y `requestId` si la UI lo mostró.
2. Correr `npm run smoke:production-report` contra el mismo deploy.
3. Si `playwright_smoke` falla, revisar cuál superficie filtró mal:
   Notas, Recortes, Momentos, búsqueda, feed o blobs.
4. Buscar en logs `owner.mismatch`, `auth.fallback`, `auth.denied` alrededor del
   `requestId`.
5. Revisar endpoint correspondiente:
   - Query debe filtrar por `user_id`.
   - Mutación debe usar owner en `WHERE`.
   - Tabla con RLS debe tener contexto `runWithUserRls` o equivalente.
   - Writes con `user_id` deben llamar `ensureUserRow()` cuando aplique.
6. Agregar test de aislamiento que falle con el bug real.
7. Arreglar mínimo y correr smoke live otra vez.

## Procedimiento: Fallback Legacy Activo

1. Abrir `/api/health` con token A.
2. Confirmar:
   - `auth.clerkConfigured`
   - `auth.legacyFallbackAllowed`
   - `auth.mode`
   - `operational.requestId`
3. Si producción muestra `ALLOW_LEGACY_FALLBACK=true`, tratar como incidente.
4. Apagar la variable o setearla a `false`.
5. Redeploy.
6. Correr:

```bash
E2E_BASE_URL=https://<produccion>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run smoke:production-report
```

## Procedimiento: Ruta API Mal Montada

1. Correr `npm run check:runtime-api-routes`.
2. Correr el probe live:

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run check:runtime-api-routes -- --probe
```

3. Si hay HTML/SPA fallback, revisar el wrapper en `netlify/functions/*.mts`.
4. La regla es: el wrapper puede delegar handler a `_lib`, pero `config.path`
   vive en el archivo público desplegable.
5. No cambiar el cliente para usar `/.netlify/functions/*`.

## Procedimiento: Blob o Attachment Sospechoso

1. Correr smoke A/B con fixtures reales.
2. Buscar `blob.access.denied` en logs.
3. Confirmar que el endpoint valida owner antes de:
   - leer metadata,
   - firmar URL,
   - devolver bytes,
   - borrar blob.
4. Si el blob quedó huérfano, limpiar por endpoint público cuando exista; no
   borrar directo desde cliente.

## Cierre de Incidente

Un incidente multiusuario queda cerrado solo cuando:

- Hay test local que reproduce el caso.
- El fix está en PR y los checks pasan.
- `npm run smoke:production-report` vuelve a `production_smoke: ok`.
- El comentario final incluye Markdown redactado y no incluye secretos.
