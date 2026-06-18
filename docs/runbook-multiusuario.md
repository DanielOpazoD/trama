# Runbook: encender multi-usuario (cutover)

> Procedimiento operativo para pasar de single-user (fallback legacy) a
> multi-usuario real con Clerk. El trabajo de código está hecho (auth, RLS,
> provisioning, cost-cap por usuario, sharing de Momentos con policies
> endurecidas en `20260610150000_momento_space_rls_hardening`); este runbook
> es la lista de pasos del switch y su verificación. El contexto de fondo vive
> en [migracion-multi-user.md](migracion-multi-user.md).

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

## Lectura correcta de señales

- **CI verde no equivale a cutover multiusuario**: CI prueba contratos locales,
  tipos, build, migraciones y e2e disponibles; no demuestra que el entorno real
  esté en modo estricto.
- **deploy preview puede correr con fallback legacy**: sirve para revisar código
  y Netlify, pero si `auth.mode = clerk-with-legacy-fallback` no se debe contar
  como aceptación de cutover.
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
`/api/*` → header `Authorization`). Expiran rápido: copiar y correr enseguida.

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
5. **Notas + Notas feed**: una nota de A no aparece en `/api/notes?q=...` ni en
   `/api/notas-feed?segment=todo&q=...` de B; los intentos de editar/borrar
   desde B responden 403/404.
6. **Blobs/anexos**: B no puede listar anexos de una nota de A ni descargar el
   `storage_key` del blob de A; si B intenta borrar el anexo, el endpoint debe
   responder 403/404 y A lo sigue viendo.
7. **Momentos**: lo que crea A no aparece en B — cubre además que B, sin
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

## Quality gates por dominio crítico

| Dominio     | Gate vivo                                                      | Evidencia mínima                                                                             |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Auth        | Anónimo, token revocado y PAT inválido no acceden              | `npm run check:legacy-fallback`, `npm run smoke:multiuser:prod`, `npm run e2e:multiuser`     |
| RLS         | Toda tabla `user_id` tiene RLS, FK a `users` y contexto seguro | `netlify/functions/_lib/isolation-guardrail.test.ts`, `query.integration.test.ts`            |
| Soft delete | Delete/restore privado usa scope por dueño y 0 filas no es 2xx | `npm run check:hard-delete-allowlist`, `npm run check:cte-regression`, tests de endpoints    |
| Blobs       | List/download/delete validan dueño activo antes de tocar store | smoke multiusuario, `notas-attachments-*`, `momentos-file` y tests de endpoints autenticados |

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

`ALLOW_LEGACY_FALLBACK=true` + redeploy restaura el comportamiento previo
(requests sin token vuelven a caer al usuario legacy). Las llaves de Clerk
pueden quedarse: con token válido el flujo es idéntico.

## Después del cutover

- Vigilar `error_log` (Settings → Estado) los primeros días: los 401
  inesperados aparecen ahí con request-id.
- El alias `LEGACY_OWNER_CLERK_ID` se queda hasta la migración definitiva de
  datos del dueño (renombrar `legacy-single-user` → sub real + mover blobs);
  ese paso tiene su propio plan en migracion-multi-user.md y no es urgente.
- Alta de nuevos usuarios = invitarlos en Clerk (o abrir signups cuando toque
  la beta). Cada usuario nuevo arranca con espacio vacío y su propio cost-cap
  (`users.monthly_budget_cents`, default el global).
