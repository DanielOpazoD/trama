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
3. Netlify ve el push, corre **migraciones nuevas** (las que están en `netlify/database/migrations/` y aún no se aplicaron) y deploya las functions + el front estático.
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

## Contexto técnico

- El workflow de CI vive en `.github/workflows/test.yml`.
- Netlify lee `netlify.toml` (no existe — usa los defaults) y `package.json` para saber cómo buildear.
- Las migraciones se aplican vía `@netlify/database` durante el deploy, usando los archivos SQL en `netlify/database/migrations/*/migration.sql`. Netlify trackea cuáles ya aplicó por hash.
