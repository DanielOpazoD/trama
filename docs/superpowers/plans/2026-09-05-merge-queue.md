# Un merge queue en vez de rebasar a mano (no disponible)

## Problema

La protección de `main` exigía que cada PR estuviera **al día con main** al
fusionar (`strict: true`). Es la forma barata de garantizar que lo que entra
se probó contra el main real, y funciona con un PR a la vez. Con varios en
cola, cada merge deja a los demás detrás: hay que rebasar, esperar el CI
completo (unos once minutos) y recién entonces fusionar el siguiente. Hoy, con
cinco PR de Dependabot, fueron cinco ciclos seguidos.

## Cambios

- **`test.yml` escucha `merge_group`.** GitHub construye un commit temporal
  main + PR y pide los mismos checks requeridos sobre él. Sin el disparador,
  el queue espera checks que nunca llegan y ningún PR entra: es el error
  clásico al activarlo.
- **Ruleset `merge-queue-main`** sobre `main` (se crea por API tras fusionar
  este PR, porque el disparador tiene que estar en main antes): método
  squash, agrupa mientras todo esté en verde, hasta cinco entradas por
  build, sin espera mínima.
- **`strict` pasa a `false`** en la branch protection: la garantía la da el
  queue, y las dos cosas juntas obligan a rebasar igual.
- `docs/deploy.md` describe el flujo nuevo: `gh pr merge N --squash --auto`.

## Decisiones

- **Ruleset, no branch protection, para el queue.** La API de branch
  protection no expone el merge queue; la de rulesets sí, y conviven con la
  protección existente (checks requeridos, sin force-push, admins incluidos).
- **Se prueba con el siguiente PR real**, no con uno de mentira: el e2e de
  Imprenta entra por el queue y es la evidencia de que funciona.

## Validación

- `format:check`, `check:script-registry` y `check:docs-drift` en verde: el
  workflow no cambia comandos, solo disparadores.
- La validación real es posterior al merge: el primer PR encolado debe
  mostrar un run de `test` con evento `merge_group` y fusionarse solo.

## Pendiente

- `pdf-visual.yml` no escucha `merge_group`. No es requerido, así que no
  bloquea; si algún día lo fuera, hay que añadirle el disparador.

## Resultado (mismo día)

**No se pudo activar.** Con el disparador ya en main, la API rechazó la regla
tanto por REST («Invalid rule 'merge_queue'») como por GraphQL («Invalid rules:
'Merge queue'»). La causa no es la configuración: el merge queue de GitHub
existe solo en repositorios de **organización**, y `DanielOpazoD/trama` es de
cuenta personal.

- `strict` vuelve a `true`: es la única garantía de «probado contra el main de
  ahora» que este repo puede tener.
- El disparador `merge_group` se queda: es inocuo y ahorra un paso si el repo
  se muda a una organización.
- La cola se sigue atendiendo de a un PR. Si el coste pesa, la salida real es
  mover el repo a una organización (gratis para repos públicos).
