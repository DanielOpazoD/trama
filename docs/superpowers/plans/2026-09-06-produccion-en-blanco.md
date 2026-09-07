# Producción en blanco con el CI en verde

## Problema

Al abrir la app desplegada no cargaba nada: `TypeError: t is not a function`
en `vendor-query` y `#root` vacío. El canario de despliegue (#399) decía que
producción servía `main`; era verdad, y `main` estaba roto.

Causa: `@clerk/react` caía en el chunk `vendor-react` porque el reparto
manual probaba `/react/` a secas contra la ruta del módulo. `@clerk/react`
importa `@clerk/shared`, que trae `@tanstack/query-core` (en `vendor-query`), y
react-query importa React (en `vendor-react`). Dos chunks que se importan
mutuamente: en un ciclo de módulos ES el segundo en evaluarse ve los `var`
del primero sin asignar, y el init CommonJS de React que pide react-query no
era todavía una función. El ciclo existía al menos desde el build anterior;
qué PR cambió el orden de evaluación da igual: el grafo estaba mal.

Por qué nada lo vio: el budget de bundle mide bytes, no el grafo; la suite
e2e corre contra el dev server, donde los módulos no se trocean; y ningún
test cargaba el bundle real en un navegador.

## Cambios

- **`vendor-react` acotado a React de verdad** (`react`, `react-dom`,
  `scheduler`, con `node_modules` como segmento anterior). `@clerk/react` va
  con el código de la app, como cualquier otra librería sin grupo.
- **`includeDependenciesRecursively` vuelve al valor por defecto (`true`)**.
  Con `false`, las dependencias no nombradas de cada vendor (`events` de
  sigma, las de mammoth) caían en el chunk de la vista que las usa y el vendor
  las importaba de vuelta: el detector encontró tres ciclos, no uno. Con
  `vendor-react` corregido, el motivo original del `false` desaparece.
  Medido: carga inicial 199 → 194 KB en 10 chunks (antes 20).
- **`check:chunk-graph`** (job `unit`, tras el build): lee los imports
  estáticos de `dist/assets/*.js` y falla ante cualquier ciclo entre chunks,
  nombrándolo. Contra el build de `main` roto dice
  `vendor-react → vendor-query → vendor-react`.
- **Humo del bundle de producción** (`e2e:preview`, job `e2e`): Playwright
  contra `vite preview` sobre `dist/`; exige que `#root` monte algo y que no
  haya errores de ejecución no capturados. Contra el reparto viejo falla con
  el mismo `TypeError`; contra el nuevo pasa.

## Decisiones

- **Dos guardas, no una.** El detector de ciclos es barato y nombra la
  causa; el humo es más lento pero ve cualquier clase de fallo de arranque,
  no solo esta. Si el humo falla y el grafo pasa, el problema es otro.
- **No se tocan los budgets.** La carga inicial bajó; los vendors se mueven
  dentro de sus topes (`vendor-graph` 36 KB con `events`; `vendor-react` 58 KB
  sin clerk).

## Lo que se encontró de paso

- Construir en un worktree con `node_modules` enlazado por symlink escribe
  `node_modules/.tmp/*.tsbuildinfo` con rutas del worktree y deja `tsc -b`
  del repo principal fallando con TS2742 (`undici-types` «no portable»).
  Borrar esos `.tsbuildinfo` lo arregla. Queda en memoria de sesión, no en
  el repo.

## Validación

- Local: `vite preview` del build corregido muestra el inicio de sesión;
  el build de `main` mostraba la pantalla en blanco con el mismo error que
  producción.
- `check:chunk-graph` y `e2e:preview` por mutación (reparto viejo → fallan;
  nuevo → pasan). Tests unitarios del detector.
- `typecheck`, `lint`, `format:check`, gates del job `lint`, `check-bundle-size`
  y `check:pdf-lazy-entrypoints` en verde.

## Pendiente

- El humo carga `/` sin backend y sin Clerk; no navega. Cubrir Inicio en
  demo sobre el bundle (con `trama-demo` en localStorage) daría una segunda
  pantalla real por el mismo precio.
