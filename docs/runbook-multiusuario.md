# Runbook: encender multi-usuario (cutover)

> Procedimiento operativo para pasar de single-user (fallback legacy) a
> multi-usuario real con Clerk. El trabajo de código está hecho (auth, RLS,
> provisioning, cost-cap por usuario, sharing de Momentos con policies
> endurecidas en `20260610150000_momento_space_rls_hardening`); este runbook
> es la lista de pasos del switch y su verificación. El contexto de fondo vive
> en [migracion-multi-user.md](migracion-multi-user.md).
> La decisión específica de sacar `legacy-single-user` del camino operativo vive
> en [ADR 0011](adr/0011-legacy-identity-cutover.md).

## Estado productivo verificado

Estado al 2026-06-21: **resuelto operativamente**.

`legacy-single-user` ya no está en el camino normal de producción. Producción
corre en modo Clerk estricto y el fallback anónimo está apagado. La identidad
legacy se conserva solo como compatibilidad histórica para datos/blobs pre-Clerk
del owner configurado en `LEGACY_OWNER_CLERK_ID`.

Evidencia productiva:

```text
cutover_smoke: ok
cutover_preflight: ok
health: ok
auth_clerk: ok
auth_strict: ok
anonymous_401: ok
read_isolation: ok
mutation_isolation: ok
blob_isolation: ok
```

Evidencia adicional:

- `health.auth.mode = clerk` con token del usuario histórico asociado a Clerk.
- El usuario histórico puede leer `/api/notes` autenticado por Clerk.
- `check:legacy-identity-contracts` reporta `unresolvedLegacyDefaults: 0`.
- `check:user-id-writes` reporta `issues: 0`.

Qué queda como deuda opcional: reasignar datos históricos desde
`legacy-single-user` al `sub` real de Clerk y mover/reconciliar blobs legacy. Esa
deuda está inventariada por `legacy-data-reassignment:dry-run`, pero ya no
bloquea el modo multiusuario productivo.

## Pre-requisitos

- [ ] PR del endurecimiento RLS mergeado y deployado (policies de
      `momento_space_*` con FORCE + `app.current_user_email` seteado por el
      runtime — sin esto, las invitaciones por correo no funcionan bajo RLS).
- [ ] Instancia **production** de Clerk creada (no la de desarrollo: las dev
      keys tienen límites duros y el banner de Clerk lo recuerda).
- [ ] Los dos usuarios de prueba del smoke creados en esa instancia
      (sirven cuentas personales; B no debe tener invitaciones de A).

## Switch (Netlify → Site settings → Environment variables)

| Paso | Variable                     | Valor                                         | Nota                                                                                                                                       |
| ---- | ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `CLERK_SECRET_KEY`           | `sk_live_…`                                   | Backend. Junto con la 2 — el guardrail de build (`npm run check:legacy-fallback`, corre en `netlify.toml`) falla si una está y la otra no. |
| 2    | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…`                                   | Frontend.                                                                                                                                  |
| 3    | `LEGACY_OWNER_CLERK_ID`      | `user_…` (sub del dueño en la instancia LIVE) | El alias que mapea al dueño histórico sobre `legacy-single-user`. Verificar que es el sub de la instancia de producción, no el de dev.     |
| 4    | `ALLOW_LEGACY_FALLBACK`      | **eliminar la variable** (o `false`)          | Con esto, requests sin token → 401. El guardrail de build rechaza `true` en producción.                                                    |

Deploy de producción después de cambiar variables (las functions las leen en
runtime, pero el front necesita rebuild por la `VITE_*`).

## Contrato de identidad legacy

Desde `20260621010000_legacy_user_id_drop_defaults`,
`legacy-single-user` queda como compatibilidad histórica, no como default
operativo. Las tablas privadas que nacieron durante el rollout multiusuario ya
no tienen `user_id DEFAULT 'legacy-single-user'`: cada handler debe resolver
usuario con `getAuthedUser()` y escribir `user_id` explícitamente. Si una
mutación nueva olvida `user_id`, Postgres debe fallar con `NOT NULL` en vez de
crear filas silenciosamente bajo el tenant histórico.

Gates obligatorios:

```bash
npm run check:legacy-identity-contracts
npm run check:user-id-writes
npm run legacy-identity:report
npm run check:legacy-identity-schema
```

`check:legacy-identity-contracts` es estático y corre sin DB: revisa que toda
tabla con default legacy histórico tenga una migración posterior `DROP DEFAULT`.
`check:user-id-writes` revisa que los `INSERT INTO` productivos a tablas
privadas escriban `user_id` explícitamente y no dependan del default removido.
También revisa SQL que requiere lectura humana, como
`INSERT INTO <tabla> VALUES ...` o `INSERT ... SELECT`: un warning nuevo bloquea
hasta que el SQL se simplifique o quede en el allowlist con una razón concreta
de ownership/RLS.
`legacy-identity:report` genera un Markdown corto con tablas históricas,
defaults removidos y estado de checks. CI lo sube como artifact
`legacy-identity-report`.
`check:legacy-identity-schema` corre contra Postgres real en el job
`migrations`, después de aplicar todas las migraciones, y confirma que la DB
migrada quedó sin defaults legacy efectivos.

## Dry-run de reasignación de datos legacy

Antes de mover cualquier dato histórico desde `legacy-single-user` al `sub` real
de Clerk del dueño, generar un inventario read-only:

```bash
LEGACY_REASSIGNMENT_TARGET_USER_ID=user_... \
npm run legacy-data-reassignment:dry-run -- --markdown
```

Salida alternativa para adjuntar como artifact o comentario de PR:

```bash
LEGACY_REASSIGNMENT_TARGET_USER_ID=user_... \
npm run legacy-data-reassignment:dry-run -- --json
```

Para guardar ambos formatos como artifact local:

```bash
LEGACY_REASSIGNMENT_TARGET_USER_ID=user_... \
npm run legacy-data-reassignment:dry-run -- --out-dir=artifacts/legacy-dry-run
```

Qué cubre:

| Superficie | Contrato                                                                             | Riesgo que reduce                                                        |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| DB privada | Cuenta filas `user_id = 'legacy-single-user'` por tabla de `PRIVATE_TABLE_CONTRACTS` | Evita migrar a ciegas o descubrir tablas tarde.                          |
| Blobs      | Lista keys sin prefijo en `momentos-media`, `recortes-media`, `notas-attachments`    | Evita romper descargas por mover solo DB o solo storage.                 |
| Reporte    | Marca automigrable, requiere revisión y riesgo de rollback                           | Obliga a revisar tokens, attachments, sharing y media antes de escribir. |

El reporte incluye `cutoverReadiness` como veredicto operativo:

| Campo                 | Cómo leerlo                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `status`              | `ready` solo si no hay blockers; `blocked` exige revisión antes de escribir. |
| `blockers`            | Razones normalizadas que impiden un PR de ejecución seguro.                  |
| `nextActions`         | Acciones concretas para convertir evidencia en plan de ejecución.            |
| `autoMigrableRows`    | Filas owner-scoped candidatas a UPDATE futuro con target aprobado.           |
| `manualReviewItems`   | Tablas/stores que requieren revisión humana antes de tocar datos.            |
| `highRiskItems`       | Superficies con rollback o privacidad más delicada.                          |
| `targetUserIdPresent` | Confirma que el dueño real fue pasado por env var o flag.                    |

Blockers esperados:

| Blocker                         | Resolución antes de ejecutar cambios reales                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `target_user_id_missing`        | Definir `LEGACY_REASSIGNMENT_TARGET_USER_ID` o `--target-user-id`.              |
| `manual_review_required`        | Revisar tablas medium/high risk y decidir si requieren script dedicado.         |
| `legacy_unscoped_blobs_present` | Mapear keys sin namespace a referencias DB antes de copiar, renombrar o borrar. |
| `inventory_warnings_present`    | Repetir el dry-run después de resolver warnings de conexión, store o contrato.  |

Reglas:

- Este comando es read-only. Si un cambio futuro agrega `UPDATE`, `DELETE`,
  copy de blobs o rewrite de `storage_key`, ya no pertenece a este PR.
- Las tablas owner-scoped simples pueden quedar como candidatas a migración
  automática futura, pero el target owner debe estar aprobado explícitamente.
- `api_tokens`, attachments, Momentos, Recortes, sharing y cualquier blob legacy
  sin prefijo requieren revisión manual antes de ejecución.
- Los ejemplos de blob keys deben permanecer sanitizados en reportes públicos.

Smokes mínimos antes de un PR de ejecución real:

```bash
npm run check:legacy-identity-contracts
npm run check:user-id-writes
npm run check:legacy-identity-schema
npm run check:legacy-media-fallbacks
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=... \
E2E_USER_B_TOKEN=... \
npm run cutover:smoke
```

Rollback conceptual para una ejecución futura: guardar conteos antes/después,
ejecutar por lotes pequeños, mantener mapping de `old_user_id -> new_user_id`,
copiar blobs antes de reescribir referencias y no borrar keys legacy hasta que
descarga, búsqueda, feed y Momentos pasen smoke con el owner real.

Smoke opcional contra deploy preview:

```bash
E2E_BASE_URL=https://deploy-preview-260--tramadaod.netlify.app \
E2E_USER_A_TOKEN=... \
E2E_USER_B_TOKEN=... \
E2E_LEGACY_OWNER_TOKEN=... \
npm run cutover:smoke:legacy-identity -- --project=chromium
```

Este smoke crea una nota como usuario A, verifica que B no la vea en Notas ni
Notas Feed, y si se entrega `E2E_LEGACY_OWNER_TOKEN` confirma que el dueño
histórico puede leer la superficie legacy. Opcionalmente se puede setear
`E2E_LEGACY_EXPECTED_MARKER` para exigir que aparezca una marca histórica
conocida en la respuesta del owner.

## Lectura correcta de señales

- **CI verde no equivale a cutover multiusuario**: CI prueba contratos locales,
  tipos, build, migraciones y e2e disponibles; no demuestra que el entorno real
  esté en modo estricto.
- **deploy preview puede correr con fallback legacy**: sirve para revisar código
  y Netlify, pero si `auth.mode = clerk-with-legacy-fallback` no se debe contar
  como aceptación de cutover.
- **preview puede validar aislamiento sin declarar cutover**: usa
  `cutover:smoke:isolation` para correr solo el caso A/B contra un deploy
  preview; ese comando marca `anonymous_401: not_checked_preview_only`.
- **producción estricta exige anónimo = 401**: antes del smoke multiusuario real,
  correr el preflight contra la URL final:

  ```bash
  npm run cutover:preflight -- --base-url=https://<sitio>.netlify.app
  ```

  Si `/api/health` está protegido, ese comando puede quedar en
  `partial_health_auth_required`: ya probó anónimo = 401, pero aún no leyó
  `auth.mode`. Para preflight completo, entrega un JWT de un usuario de prueba
  solo para Health:

  ```bash
  CUTOVER_HEALTH_TOKEN=<jwt de A> \
  npm run cutover:preflight -- --base-url=https://<sitio>.netlify.app
  ```

  Si quieres diagnosticar un preview que aún permite fallback, usa dry run:

  ```bash
  npm run cutover:preflight -- \
    --base-url=https://deploy-preview-<n>--tramadaod.netlify.app \
    --allow-legacy-preview
  ```

  Ese modo debe imprimir `skipped_preview_fallback`, no `ok`.

  Para validar solo el aislamiento A/B de un deploy preview que todavía permite
  fallback legacy:

  ```bash
  E2E_BASE_URL=https://deploy-preview-<n>--tramadaod.netlify.app \
  CLERK_SECRET_KEY=sk_live_... \
  E2E_USER_A_ID=user_... \
  E2E_USER_B_ID=user_... \
  npm run cutover:smoke:isolation -- --project=chromium
  ```

  Este comando usa el mismo resolvedor de tokens que `cutover:smoke`, pero corre
  solo el caso “usuario B no descubre fixtures de A”. No prueba anónimo = 401 ni
  token revocado; por eso no reemplaza `cutover:smoke` para producción.

## Contrato runtime de rutas API

El contrato de la app es siempre `/api/*`. Las rutas
`/.netlify/functions/*` sirven solo como diagnóstico de bajo nivel: si la ruta
nativa funciona pero `/api/*` devuelve 404/405 o HTML, la app sigue rota para
usuarios reales y el smoke debe fallar.

Antes de crear fixtures multiusuario, validar:

```bash
npm run check:runtime-api-routes
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run check:runtime-api-routes -- --probe
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
node_modules/.bin/playwright test e2e/runtime-api-routing.spec.ts --project=chromium
```

Si un smoke anterior dejó fixtures conocidas antes de que `/:id` estuviera
verificado, el cleanup opcional usa solo la API pública y trata `404` como éxito
(ya no existe):

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
npm run cleanup:runtime-fixtures
```

Reglas de aceptación:

- `/api/* nunca debe devolver el HTML de la SPA`; toda respuesta API esperada
  debe ser JSON.
- Rutas privadas sin token deben responder 401.
- Rutas de lista críticas (`entities`, `recortes`, `momentos`, `search`,
  `notes`, `notas-feed`) deben estar montadas en producción.
- Rutas `/:id` usadas para cleanup deben llegar al handler y responder 404 JSON
  para IDs inexistentes; 405 o HTML 404 indica routing roto.
- El E2E runtime crea y borra un recorte y un momento reales del owner para
  probar que `DELETE /api/recortes/:id` y `DELETE /api/momentos/:id` no solo
  enrutan, sino que limpian fixtures vivas.
- `/.netlify/functions/*` no reemplaza este contrato: solo ayuda a aislar si el
  problema es Netlify routing o lógica del handler.

## Smoke productivo reportable

Cuando el PR toca auth, rutas privadas, ownership, blobs, cache de superficies
privadas o fallback legacy, deja evidencia Markdown con el comando reportable:

```bash
E2E_BASE_URL=https://<sitio-o-preview>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
npm run smoke:production-report
```

También puede resolver tokens efímeros con Clerk, igual que `cutover:smoke`:

```bash
E2E_BASE_URL=https://<sitio-o-preview>.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run smoke:production-report
```

Para publicar la misma evidencia directamente en un PR, sin exponer tokens:

```bash
E2E_BASE_URL=https://deploy-preview-<n>--tramadaod.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run smoke:production-report -- --comment-pr=<n> --repo=<owner>/<repo>
```

El reporte combina:

- `cutover:preflight` estricto: anónimo = 401, health auth y fallback.
- `check:runtime-api-routes -- --probe`: `/api/*` devuelve JSON y rutas críticas
  están montadas.
- Playwright smoke env-gated: runtime routes + aislamiento A/B.

Resultado aceptable para comentario de PR:

```text
production_smoke: ok
anonymous_401: ok
runtime_api_route_probe: ok
playwright_smoke: ok
```

Si falla, no copies tokens ni cookies en el comentario. Pega solo el Markdown
redactado del comando y, si hace falta, el `requestId` del error.

## Verificación: smoke de aislamiento

Con el deploy arriba y dos sesiones Clerk reales (usuario A y usuario B):

```bash
SMOKE_BASE_URL=https://<sitio>.netlify.app \
SMOKE_TOKEN_A=<jwt de A> \
SMOKE_TOKEN_B=<jwt de B> \
SMOKE_REVOKED_TOKEN=<jwt revocado opcional> \
npm run smoke:multiuser:prod
```

Los JWT se sacan de la app logueada (DevTools → Network → cualquier request a
`/api/*` → header `Authorization: Bearer ...`). Copiar solo ese header, nunca
cookies de Clerk (`__session`, `__client`, `__clerk_handshake`) ni requests
`/tokens?...`: son más sensibles y no son el contrato de la API de Trama.
Expiran rápido: A y B deben haber iniciado sesión recientemente, o hay que
copiar y correr enseguida.

La ruta preferida para el **smoke multiusuario real** es el runner de cutover,
porque primero exige preflight estricto y luego corre el e2e de aislamiento:

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
E2E_USER_A_TOKEN=<jwt de A> \
E2E_USER_B_TOKEN=<jwt de B> \
E2E_REVOKED_TOKEN=<jwt revocado opcional> \
npm run cutover:smoke -- --project=chromium
```

También puede mintear tokens efímeros si tienes el secret real de Clerk y dos
usuarios de prueba:

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run cutover:smoke -- --project=chromium
```

Si Clerk no permite crear sesiones desde backend en esa instancia, el runner
intenta usar sesiones activas existentes para esos usuarios. En ese caso A y B
deben haber iniciado sesión recientemente en producción; si un usuario no tiene
sesión activa, usa tokens manuales copiados desde DevTools.

### Token revocado opcional

Para probar revocación sin automatizar Clerk en CI:

1. Crear o abrir una sesión temporal de un usuario de prueba en Clerk.
2. Copiar el JWT de esa sesión desde DevTools o desde un template de sesión.
3. Revocar esa sesión en Clerk.
4. Ejecutar el smoke con ese JWT en `SMOKE_REVOKED_TOKEN`.

Resultado esperado: `revoked_401: ok`. Si no se entrega el token, el resumen
muestra `revoked_401: skipped`.

El script verifica, creando y soft-borrando sus propias fixtures:

1. **Sin token → 401** (el fallback legacy quedó realmente apagado).
2. **Token revocado → 401** si se entregó `SMOKE_REVOKED_TOKEN`.
3. **Entidades**: lo que crea A no aparece en la lista de B, no se puede abrir
   directo (403/404), y los intentos de editar/borrar desde B responden
   403/404. No se acepta 2xx silencioso aunque A conserve la fila.
4. **Citas + búsqueda**: una cita de A no aparece en `/api/quotes` de B ni en
   `/api/search?q=...`; los intentos de editar/borrar desde B responden
   403/404.
5. **Recortes**: un recorte de A no aparece en `/api/recortes` de B; los
   intentos de editar/borrar desde B responden 403/404.
6. **Notas + Notas feed**: una nota de A no aparece en `/api/notes?q=...` ni en
   `/api/notas-feed?segment=todo&q=...` de B; los intentos de editar/borrar
   desde B responden 403/404.
7. **Blobs/anexos**: B no puede listar anexos de una nota de A ni descargar el
   `storage_key` del blob de A; si B intenta borrar el anexo, el endpoint debe
   responder 403/404 y A lo sigue viendo.
8. **Momentos**: lo que crea A no aparece en B — cubre además que B, sin
   invitación aceptada, no ve el espacio de A aunque el endpoint contemple
   compartidos — y los intentos de editar/borrar desde B responden 403/404.

Cualquier ✗ → **no seguir**: revertir el paso 4 (volver a `true`) deja todo
como estaba mientras se investiga.

Al final debe imprimir este resumen compacto:

```text
anonymous_401: ok
revoked_401: ok|skipped
read_isolation: ok
mutation_isolation: ok
blob_isolation: ok
```

La variante recomendada en CI/manual técnico es `npm run e2e:multiuser`, que
puede crear tokens efímeros con Clerk y revocar las sesiones al terminar:

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run e2e:multiuser -- --project=chromium
```

También acepta tokens manuales con `E2E_USER_A_TOKEN` y `E2E_USER_B_TOKEN`. No
guardar ni pegar tokens en archivos versionados o chats.

Comando mínimo de aceptación antes de declarar cutover:

```bash
npm run check:legacy-fallback
E2E_BASE_URL=https://<sitio>.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run e2e:multiuser -- --project=chromium
```

Criterio de aceptación: anónimo = 401; token revocado = 401 si se probó; B no
ve, no edita, no borra ni descarga fixtures privadas de A; la limpieza final
soft-borra todas las fixtures de A.

## Checklist de aceptación del PR

- [ ] Health muestra `auth.mode` y no filtra secretos de Clerk.
- [ ] `ALLOW_LEGACY_FALLBACK=false` produce 401 anónimo.
- [ ] Usuario B no lee fixtures privadas de A.
- [ ] Usuario B no muta ni borra fixtures privadas de A; los endpoints devuelven 403/404, nunca 2xx no-op.
- [ ] Usuario B no lista, borra ni descarga blobs/anexos de A.
- [ ] Logs no contienen token, body, password ni detalles sensibles.
- [ ] RLS cubre toda tabla versionada con `user_id`.
- [ ] `legacy-single-user` no aparece como `DEFAULT` efectivo de `user_id` en
      tablas privadas (`check:legacy-identity-*` verdes).
- [ ] Health muestra el checklist de cutover legacy y el comando
      `legacy-data-reassignment:dry-run`.

## Quality gates por dominio crítico

| Dominio          | Gate vivo                                                              | Evidencia mínima                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth             | Anónimo, token revocado y PAT inválido no acceden                      | `npm run check:legacy-fallback`, `npm run smoke:multiuser:prod`, `npm run e2e:multiuser`                                                            |
| Identidad legacy | `legacy-single-user` es compatibilidad histórica, no default operativo | `npm run check:legacy-identity-contracts`, `npm run check:user-id-writes`, `npm run legacy-identity:report`, `npm run check:legacy-identity-schema` |
| RLS              | Toda tabla `user_id` tiene RLS, FK a `users` y contexto seguro         | `netlify/functions/_lib/isolation-guardrail.test.ts`, `query.integration.test.ts`                                                                   |
| Soft delete      | Delete/restore privado usa scope por dueño y 0 filas no es 2xx         | `npm run check:hard-delete-allowlist`, `npm run check:cte-regression`, tests de endpoints                                                           |
| Blobs            | List/download/delete validan dueño activo antes de tocar store         | smoke multiusuario, `notas-attachments-*`, `momentos-file`, `npm run check:legacy-media-fallbacks` y tests de endpoints autenticados                |

## Inventario ejecutable Auth/RLS

El contrato vivo de tablas privadas, endpoints privados y dominios cubiertos por
el smoke está en `scripts/auth-rls-contracts.mjs`.

```bash
npm run check:auth-rls-contracts
node_modules/.bin/vitest run scripts/auth-rls-contracts.test.mjs
```

Ese inventario se usa como fuente para el guardrail de aislamiento: si una
migración agrega una tabla con `user_id`, el test exige clasificarla con
`user_id`, RLS, lifecycle y razón operacional antes de aceptar el PR.

## Registro vivo de riesgos

| Riesgo                                | Señal temprana                                  | Gate que lo bloquea                                                           |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Fallback legacy activo                | Health muestra fallback permitido o anónimo 2xx | `check:legacy-fallback`, smoke anónimo = 401                                  |
| Endpoint privado sin auth             | Handler nuevo sin `getAuthedUser()`             | `isolation-guardrail.test.ts` exige auth o exención explícita                 |
| Mutación privada 2xx no-op            | Usuario B borra/edita A y recibe 2xx            | smoke/e2e multiusuario + guardrail `RETURNING` en soft delete/restore privado |
| Blob/anexo accesible por otro usuario | B lista, descarga o borra `storage_key` de A    | smoke `blob_isolation` + tests de `notas-attachments` y `momentos-file`       |
| Log con contenido sensible            | Token, body, email o teléfono aparece en logs   | tests de `observability` y redacción centralizada en `withObservability`      |

Smoke manual del sharing (5 min, una sola vez): A invita al correo de B desde
Momentos → B ve la invitación al entrar → B acepta → ambos ven el espacio del
otro → A revoca desde "quién tiene acceso" → B deja de ver.

## Rollback

`ALLOW_LEGACY_FALLBACK=true` + redeploy restaura el fallback de auth previo
(requests sin token vuelven a caer al usuario legacy), pero **no restaura** los
defaults de base de datos quitados por
`20260621010000_legacy_user_id_drop_defaults`. Ese cambio es deliberadamente
fail-closed: si un handler no escribe `user_id`, debe fallar incluso durante un
rollback de auth.

Si una emergencia demuestra que una ruta productiva legítima dependía del
default legacy, la reversión correcta es crear una migración nueva y temporal
que restaure el default solo para la tabla afectada, con comentario de incidente
y test que cubra el handler. No editar la migración ya aplicada.

## Después del cutover

- Vigilar `error_log` (Settings → Estado) los primeros días: los 401
  inesperados aparecen ahí con request-id.
- El alias `LEGACY_OWNER_CLERK_ID` se queda hasta la migración definitiva de
  datos del dueño (renombrar `legacy-single-user` → sub real + mover blobs);
  ese paso tiene su propio plan en migracion-multi-user.md y no es urgente.
- Alta de nuevos usuarios = invitarlos en Clerk (o abrir signups cuando toque
  la beta). Cada usuario nuevo arranca con espacio vacío y su propio cost-cap
  (`users.monthly_budget_cents`, default el global).
