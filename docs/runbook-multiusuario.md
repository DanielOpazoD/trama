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

## Verificación: smoke multiusuario real

Con el deploy arriba y dos sesiones Clerk reales (usuario A y usuario B):

```bash
E2E_BASE_URL=https://<sitio>.netlify.app \
CLERK_SECRET_KEY=sk_live_... \
E2E_USER_A_ID=user_... \
E2E_USER_B_ID=user_... \
npm run e2e:multiuser -- --project=chromium
```

El script crea sesiones efímeras en Clerk, obtiene JWTs para A/B, resuelve el
correo de B para aceptar invitaciones y revoca las sesiones al terminar. También
se puede lanzar desde GitHub Actions con `workflow_dispatch` del workflow
`test`, activando `run_multiuser_smoke`.

El smoke verifica, creando y soft-borrando sus propias fixtures:

1. **Sin token → 401** (el fallback legacy quedó realmente apagado).
2. **Entidades**: lo que crea A no aparece en la lista de B ni se puede abrir
   directo (404).
3. **Notas**: ídem.
4. **Momentos**: ídem — cubre además que B, sin invitación aceptada, no ve el
   espacio de A aunque el endpoint contemple compartidos.
5. **Momentos compartidos**: A sube foto privada, B no puede leer el blob antes
   de aceptar invitación, sí puede después, `editor` edita, `viewer` no edita
   pero comenta/reacciona, el dueño borra comentarios y al revocar el acceso el
   blob vuelve a 404.

Cualquier ✗ → **no seguir**: revertir el paso 4 (volver a `true`) deja todo
como estaba mientras se investiga.

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
