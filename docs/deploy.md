# Deploy

## Cuándo abrir esto

- Hiciste `git push` y quieres confirmar que subió.
- Algo se rompió en producción y necesitas hacer rollback.
- Vas a configurar una env var nueva.
- Vas a habilitar un nuevo provider de IA.

## Verificación rápida

| Qué                               | Dónde                                       |
| --------------------------------- | ------------------------------------------- |
| ¿Está corriendo el deploy actual? | https://app.netlify.com/sites/trama/deploys |
| ¿El sitio responde?               | tu URL de Trama                             |
| ¿Hay errores recientes?           | Settings → Health (en la app)               |

## Cómo deploya Trama

1. Haces `git push` a `main` desde tu Mac.
2. GitHub Actions corre **typecheck + tests + build** (~2 min).
   - Si CI falla, Netlify NO deploya. El último deploy bueno sigue sirviendo.
3. Netlify ve el push, ejecuta el build declarado en `netlify.toml` (`npm run check:legacy-fallback && npm run build && node scripts/write-version.mjs`), corre **migraciones nuevas** (las que están en `netlify/database/migrations/` y aún no se aplicaron) y deploya las functions + el front estático.
4. ~3-5 min después de push, la nueva versión está viva.

**Nada se hace solo en producción que no esté en git.** Las migraciones, el código de las functions, el front, todo viene del repo.

## Canario de deploy (¿producción sirve main?)

En julio 2026 producción quedó **un mes** clavada en un commit viejo: un
`locked: true` silencioso en Netlify dejaba construir pero no publicar, con
CI en verde y el deploy en `ready`. Desde entonces hay un canario:

- El build publica `/version.json` con el sha construido
  (`scripts/write-version.mjs`, servido con `Cache-Control: no-store`).
- El workflow `deploy-canary` (cada 6 h, o a mano desde Actions →
  deploy-canary → Run workflow) baja ese archivo de `tramahub.app` y lo
  compara con `origin/main` (`scripts/deploy-canary.mjs`). Da 45 min de
  gracia a un deploy en vuelo.
- Si producción no corresponde a main, el workflow **falla y abre un issue**
  etiquetado `deploy-canary` (uno solo; no duplica).

**Si el canario alarma:** ir a https://app.netlify.com/sites/trama/deploys y
mirar si el último deploy dice `Published`. Si Netlify construye pero no
publica (el síntoma del incidente), desbloquear y republicar sin pasar por la
UI:

```bash
netlify api unlockDeploy --data '{"deploy_id":"<id-del-deploy>"}'
```

```bash
netlify api createSiteBuild --data '{"site_id":"6023f353-1a4f-45fd-9cb0-fa1a7edd2a45"}'
```

Verificar el arreglo con `node scripts/deploy-canary.mjs` desde el repo (debe
decir `ok`) y cerrar el issue.

## Protección de la rama main

`main` tiene branch protection: solo se llega por PR con los checks de
`test.yml` en verde (`unit`, `lint`, `e2e`, `secrets`, `migrations`), la rama
debe estar al día con main al mergear, sin force-push ni borrado, y aplica
también para admins. `pdf-visual` NO es requerido (es path-filtered: en un PR
que no toca PDF nunca reporta y bloquearía el merge); CodeRabbit tampoco (sus
verdes por rate-limit no prueban nada). Si una emergencia real exige saltarse
la protección, se desactiva temporalmente en
https://github.com/DanielOpazoD/trama/settings/branches — y se reactiva al
terminar.

## Rollback (algo se rompió tras un push)

### Opción A — revertir desde Netlify (más rápido, 30 seg)

1. Ir a https://app.netlify.com/sites/trama/deploys
2. Encontrar el deploy anterior que SÍ funcionaba (verde, antes del que rompió).
3. Botón `Publish deploy` en esa línea.
4. **Eso revierte el código del front + las functions**, pero **NO revierte migraciones SQL**. Si el problema era una migración, mira la sección siguiente.

### Opción B — revertir desde git (limpio para el historial)

```bash
cd "/Users/daniel/Citas : Notas"
git log --oneline -5             # ver los últimos commits
git revert <hash-del-commit-malo>
git push origin main
```

Esto crea un commit nuevo que deshace el malo. CI corre de nuevo (~2 min) y Netlify deploya. Más limpio que `git reset` que reescribe historia.

### Si el problema fue una migración

Las migraciones aplicadas a la DB **no se deshacen automáticamente** con un rollback de Netlify. Hay que ir a `migraciones.md` para resolverlo manualmente.

## Configurar una env var nueva

1. https://app.netlify.com/sites/trama/configuration/env
2. `Add a variable`
3. Si es una API key o algo sensible, marcar `Contains secret values`.
4. **IMPORTANTE**: Las env vars NO se aplican automáticamente al último deploy. Hay que hacer `Trigger deploy → Clear cache and deploy site` para que tomen efecto. O esperar al próximo push.

## Habilitar un provider de IA nuevo

Ver [ai.md](ai.md).

## CI rojo: cómo diagnosticar

1. Ir a https://github.com/DanielOpazoD/trama/actions
2. Clic en el run que falló.
3. Mirar qué etapa falló:
   - **typecheck** → algún archivo .ts tiene un error de tipos. El mensaje dice qué.
   - **test** → un test falló. Mira el output para ver cuál.
   - **build** → el bundle no compila. Suele venir de un import roto.

Hasta que CI no esté verde, Netlify NO deploya. Mantén `main` en verde.

## Checklist pre-PR

Antes de abrir PR, confirmar:

- `npm test`, `npm run typecheck`, `npm run build` verdes.
- Si el trabajo viene de la rama de saneamiento integral, `npm run pr-stack:check` verde para confirmar que cada archivo del diff tiene dueño en una oleada.
- Si hay migraciones, son carpetas nuevas en `netlify/database/migrations/<timestamp>_<slug>/migration.sql`; nunca se editó una aplicada.
- `scripts/apply-migrations.sh` corre en DB limpia y un segundo run reporta `Applied 0 new migration(s).` El script usa `psql` del host o el contenedor Docker `trama-postgres`.
- Endpoints nuevos o tocados usan `getAuthedUser`, `ensureUserRow` si mutan datos, `parseJsonBody` + Zod para bodies y `ApiErrors.*` para errores.
- Toda query multi-user filtra `user_id`; toda referencia entrante valida ownership antes de insertar.
- Toda mutación privada (`PATCH`, `DELETE`, restore y acciones equivalentes) verifica filas afectadas con `RETURNING` o un CTE equivalente; si toca 0 filas, responde `ApiErrors.notFound`, no éxito silencioso.
- Deletes de dominio siguen soft-delete y limpian/ocultan relaciones derivadas visibles.
- Cualquier llamada LLM pasa por cost-cap y escribe `extraction_log`, salvo excepción documentada como embeddings.
- Producción no puede tener `ALLOW_LEGACY_FALLBACK=true`; `npm run check:legacy-fallback` debe fallar si alguien lo intenta.
- Clerk debe configurarse como par: `CLERK_SECRET_KEY` y `VITE_CLERK_PUBLISHABLE_KEY` juntas. El mismo check falla si solo una está seteada, porque dejaría front y backend en modos distintos.
- Si el cambio toca privacidad multiusuario, correr el smoke con dos usuarios de
  prueba Clerk. Debe cubrir: anónimo → 401, A no aparece en B para entidades,
  citas, momentos, búsqueda y Notas feed, B no puede mutar/borrar fixtures de
  A con 2xx silencioso, y B no puede listar/borrar/descargar anexos de A.
  CI verde no equivale a cutover multiusuario; deploy preview puede correr con
  fallback legacy; producción estricta exige anónimo = 401 antes de aceptar el
  smoke multiusuario real.

  Primero, preflight de la URL real:

  ```bash
  npm run cutover:preflight -- --base-url=https://tramadaod.netlify.app
  ```

  Si Health requiere auth, entrega un token de usuario de prueba para que el
  preflight lea `auth.mode` sin exponer secrets:

  ```bash
  CUTOVER_HEALTH_TOKEN=... \
  npm run cutover:preflight -- --base-url=https://tramadaod.netlify.app
  ```

  Para diagnosticar un preview sin confundirlo con producción:

  ```bash
  npm run cutover:preflight -- \
    --base-url=https://deploy-preview-<n>--tramadaod.netlify.app \
    --allow-legacy-preview
  ```

  Para validar solo aislamiento A/B en ese preview, sin declarar cutover:

  ```bash
  E2E_BASE_URL=https://deploy-preview-<n>--tramadaod.netlify.app \
  CLERK_SECRET_KEY=sk_live_... \
  E2E_USER_A_ID=user_... \
  E2E_USER_B_ID=user_... \
  npm run cutover:smoke:isolation -- --project=chromium
  ```

  Ese comando debe imprimir `anonymous_401: not_checked_preview_only`; producción
  estricta se acepta con `cutover:smoke`, no con el runner de preview.

  Modo recomendado: generar
  tokens efímeros desde Clerk en cada run, usando el secret del backend y los
  `user_id` de los dos usuarios de prueba:

  ```bash
  E2E_BASE_URL=https://tramadaod.netlify.app \
  CLERK_SECRET_KEY=sk_live_... \
  E2E_USER_A_ID=user_... \
  E2E_USER_B_ID=user_... \
  npm run cutover:smoke -- --project=chromium
  ```

  El script crea sesiones temporales, obtiene JWTs para Playwright y revoca las
  sesiones al terminar. Opcionalmente, ajustar la vida de esos tokens con
  `E2E_CLERK_TOKEN_TTL_SECONDS` (default: 600 segundos). Para validar
  revocación en una pasada manual, entregar además `E2E_REVOKED_TOKEN` con un
  JWT cuya sesión ya fue revocada; el smoke espera 401.
  Si Clerk no permite crear sesiones desde backend, el runner intenta usar una
  sesión activa existente para cada usuario; si no hay sesión activa, inicia
  sesión con ese usuario o usa tokens manuales.
  Si usas tokens manuales desde DevTools, copia solo el header
  `Authorization: Bearer ...` de un request `/api/*`; no copies cookies de Clerk
  ni requests `tokens?...`.

  El smoke operacional equivalente, útil para cutover con tokens copiados de
  DevTools, usa el wrapper:

  ```bash
  SMOKE_BASE_URL=https://tramadaod.netlify.app \
  SMOKE_TOKEN_A=... \
  SMOKE_TOKEN_B=... \
  SMOKE_REVOKED_TOKEN=... \
  npm run smoke:multiuser:prod
  ```

  El resumen esperado es `anonymous_401: ok`, `revoked_401: ok|skipped`,
  `read_isolation: ok`, `mutation_isolation: ok` y `blob_isolation: ok`.
  En `mutation_isolation`, un `DELETE` de B sobre recurso de A debe responder
  403/404; un 2xx no-op es fallo operacional.

- Alternativa manual, útil para una prueba local puntual después de iniciar
  sesión en el navegador:

  ```bash
  E2E_BASE_URL=https://tramadaod.netlify.app \
  E2E_USER_A_TOKEN=... \
  E2E_USER_B_TOKEN=... \
  npm run cutover:smoke -- --project=chromium
  ```

Para el saneamiento multi-user grande, publicar como stack chico siguiendo
[`saneamiento-integral-pr-stack.md`](saneamiento-integral-pr-stack.md).

## Contexto técnico

- El workflow de CI vive en `.github/workflows/test.yml`.
- Netlify lee `netlify.toml` y `package.json` para saber cómo buildear.
- Las migraciones se aplican vía `@netlify/database` durante el deploy, usando los archivos SQL en `netlify/database/migrations/*/migration.sql`. Netlify trackea cuáles ya aplicó por hash.
