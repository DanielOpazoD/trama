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
3. Netlify ve el push, ejecuta el build declarado en `netlify.toml` (`npm run check:legacy-fallback && npm run build`), corre **migraciones nuevas** (las que están en `netlify/database/migrations/` y aún no se aplicaron) y deploya las functions + el front estático.
4. ~3-5 min después de push, la nueva versión está viva.

**Nada se hace solo en producción que no esté en git.** Las migraciones, el código de las functions, el front, todo viene del repo.

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
- Deletes de dominio siguen soft-delete y limpian/ocultan relaciones derivadas visibles.
- Cualquier llamada LLM pasa por cost-cap y escribe `extraction_log`, salvo excepción documentada como embeddings.
- Producción no puede tener `ALLOW_LEGACY_FALLBACK=true`; `npm run check:legacy-fallback` debe fallar si alguien lo intenta.
- Clerk debe configurarse como par: `CLERK_SECRET_KEY` y `VITE_CLERK_PUBLISHABLE_KEY` juntas. El mismo check falla si solo una está seteada, porque dejaría front y backend en modos distintos.
- Si el cambio toca privacidad multiusuario, correr el smoke con dos usuarios de
  prueba Clerk. Modo recomendado: generar tokens efímeros desde Clerk en cada
  run, usando el secret del backend y los `user_id` de los dos usuarios de
  prueba:

  ```bash
  E2E_BASE_URL=https://tramadaod.netlify.app \
  CLERK_SECRET_KEY=sk_live_... \
  E2E_USER_A_ID=user_... \
  E2E_USER_B_ID=user_... \
  npm run e2e:multiuser -- --project=chromium
  ```

  El script crea sesiones temporales, obtiene JWTs para Playwright y revoca las
  sesiones al terminar. También resuelve el correo de B desde Clerk para que el
  smoke pueda aceptar la invitación de Momentos. Opcionalmente, ajustar la vida
  de esos tokens con `E2E_CLERK_TOKEN_TTL_SECONDS` (default: 600 segundos).

  También existe un workflow manual (`multiuser-smoke`) para correrlo desde
  GitHub Actions contra un deploy real. Requiere `vars.E2E_BASE_URL` o el input
  `base_url`, más los secrets `CLERK_SECRET_KEY`, `E2E_USER_A_ID` y
  `E2E_USER_B_ID`.

- Alternativa manual, útil para una prueba local puntual después de iniciar
  sesión en el navegador:

  ```bash
  E2E_BASE_URL=https://tramadaod.netlify.app \
  E2E_USER_A_TOKEN=... \
  E2E_USER_B_TOKEN=... \
  E2E_USER_B_EMAIL=usuario-b@example.com \
  npm run e2e:multiuser -- --project=chromium
  ```

Para el saneamiento multi-user grande, publicar como stack chico siguiendo
[`saneamiento-integral-pr-stack.md`](saneamiento-integral-pr-stack.md).

## Contexto técnico

- El workflow de CI vive en `.github/workflows/test.yml`.
- Netlify lee `netlify.toml` y `package.json` para saber cómo buildear.
- Las migraciones se aplican vía `@netlify/database` durante el deploy, usando los archivos SQL en `netlify/database/migrations/*/migration.sql`. Netlify trackea cuáles ya aplicó por hash.
