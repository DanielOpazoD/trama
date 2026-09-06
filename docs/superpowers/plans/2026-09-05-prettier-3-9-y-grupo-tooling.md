# Tres lunes en rojo por Prettier

## Problema

Los tres últimos PR agrupados de Dependabot (17, 24 y 31 de agosto de 2026)
fallaban en el mismo sitio: el grupo `minor-and-patch` traía Prettier
3.8.3 → 3.9.6, la versión nueva reformatea 23 archivos, y `format:check` tumbaba
el job `lint` antes de que corriera nada más.

Como los otros 17 paquetes del grupo viajaban en el mismo PR, **ninguna
actualización menor entró desde el 17 de agosto**. El gate
`check:deps-advisories` bloquea un aviso alto nuevo, pero sólo protege si las
actualizaciones que lo cierran llegan a main.

## Cambios

- **Prettier 3.9.6** fijado en `devDependencies`, y los 23 archivos que la
  versión nueva reformatea, reformateados. El cambio es sólo de estilo: 3.9
  colapsa uniones de tipos cortas en una línea y ajusta algunos saltos en
  Markdown. Son los mismos 23 archivos que el CI listaba en los tres fallos.
- **Un grupo `tooling` propio en `dependabot.yml`** para Prettier, ESLint,
  typescript-eslint, knip y dependency-cruiser, y esos mismos patrones excluidos
  de `minor-and-patch`. Un cambio de estilo puede seguir poniéndose en rojo,
  pero ya no se lleva por delante a los parches.

## Decisiones

- **Fijar Prettier aquí y no rebasar el PR de Dependabot.** Con 3.9.6 en main,
  el PR #417 queda reducido a los 17 paquetes que faltan, y cuando Dependabot
  lo rebase, `format:check` pasa porque los archivos ya vienen formateados.
  Empujar el formateo sobre la rama de Dependabot habría funcionado una vez;
  esto arregla el mecanismo.
- **Los linters van con los formateadores, no con los parches.** No porque
  fallen igual (ESLint no reformatea), sino porque un cambio de regla también
  puede poner en rojo un PR que no toca código, y esa clase de fallo se
  resuelve tocando el repo, no esperando otro release.

## Validación

- `format:check`, `lint`, `typecheck` y los 29 gates `check:*` del job `lint`
  en verde en local.
- Después del merge: `@dependabot rebase` sobre #417 y comprobar que el CI
  pasa el paso que llevaba tres semanas fallando.

## Pendiente

- Resuelto en #421: ESLint 10.9 y typescript-eslint 8.68 entraron con el grupo
  regenerado y `lint` pasó. (Antes: seguían dentro de #417.)
  El CI nunca llegó a ejecutar `lint` con esas versiones porque `format:check`
  cortaba antes; si traen una regla nueva, se verá en el rebase.
