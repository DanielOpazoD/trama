# Pulido de la última milla — gate anti-oclusión, reserva del composer y encuadre del grafo

## Problema

Una revisión externa del repo midió los gates sobre un clone limpio de `main` y
encontró un patrón: **todo lo automatizable está verde y aun así hay texto que
el usuario no puede leer**.

- El pie del Grafo (`N entidades · N relaciones · <hint>`) quedaba debajo de la
  píldora "leyenda". Ambos son capas absolutas ancladas abajo a la izquierda
  (`bottom-3 left-3` y `bottom-4 left-4`, las dos con `z-10`), así que el orden
  del DOM decidía cuál se pintaba encima. Ganaba la leyenda.
- En móvil, la última fila de Entidades quedaba tapada por el AskBar **con el
  scroll ya en su tope**: el contenedor reservaba un `pb-32` fijo (128px) y la
  barra crece hasta ~200px al desplegar propuesta o error. Sin scroll que lo
  rescate, ese contenido era inalcanzable.
- El grafo en móvil se encuadraba al 38%: un racimo ilegible rodeado de vacío.
- `npm install` moría con ERESOLVE en un clone limpio, pese a que el README lo
  documenta como el comando de arranque.

Lo importante no es cada defecto suelto sino **por qué ninguno se detectó**: la
suite corre en happy-dom, que no hace layout. `toBeInTheDocument()` prueba
presencia en el árbol, nunca visibilidad en pantalla. El CTA de Inicio tiene su
test —`FirstMomentPreview.test.tsx:29`— y pasaba mientras el texto estaba tapado.

## Piezas / Cambios

- **`e2e/occlusion.spec.ts` (nuevo).** Gate que recorre las vistas troncales en
  tres viewports y dos datasets, y por cada nodo de texto dispara
  `elementFromPoint()` sobre 12 puntos del rectángulo de su primera línea. Si el
  elemento devuelto no es el propio nodo, ni ancestro, ni descendiente, ese punto
  está tapado; reporta a partir de un tercio de la línea cubierta.
- **`GraphTypeLegend.tsx`.** La columna de la leyenda pasa a `md:bottom-9`. Crece
  hacia arriba desde su borde inferior, así que levantar ese borde basta para que
  nunca alcance al pie de contadores. En móvil ese pie está oculto
  (`hidden md:block`), así que allí se queda abajo, alineada con el zoom.
- **`AskBar.tsx` + `ViewRouter.tsx`.** El AskBar publica su alto real en
  `--askbar-h` vía `ResizeObserver`; el scroller de vista reserva
  `calc(var(--askbar-h, 0px) + 2.5rem)` en lugar del `pb-32` fijo. La reserva
  ahora sigue a la barra cuando crece.
- **`usePanZoom.ts`.** El margen de `fitToView` se acota al 12% de cada eje. Con
  140px fijos por lado, un ancho de 375 dejaba 95px útiles; ahora el grafo llena
  la pantalla en móvil y en escritorio nada cambia (a 1440px el 12% ya supera los
  140 pedidos).
- **`GraphToolbar.tsx` + `GraphSearch.tsx`.** Las píldoras envuelven
  (`flex-wrap`) en vez de salirse del viewport —"explorar" era inalcanzable en
  móvil— y el buscador baja a `top-20` hasta `md` para no pisar la segunda fila.
- **`.npmrc` (nuevo).** `legacy-peer-deps=true`, que es lo que CI ya pasaba a
  mano en cada job.
- **`vitest.config.ts`.** Piso de cobertura propio para `_lib/auth.ts`,
  `_lib/cost-cap.ts` y `_lib/user-rls.ts`. El umbral global es una media: un
  archivo donde un fallo silencioso cuesta mucho —quién sos, cuánto podés
  gastar, qué filas podés ver— puede desplomarse sin mover la aguja del total.
  Los números salen de una corrida real y quedan un par de puntos por debajo de
  lo medido (82.71/70.31/87.5/87.5, 94.11/92.85/100/100 y 93.87/78.57/100/95.45
  respectivamente) para absorber el jitter de v8.

## Decisiones

- **El gate mide con los scrollers en su tope, y sólo ahí.** Un texto que pasa
  por detrás de un panel flotante mientras scrolleas no es un defecto: el scroll
  lo libera. Medir antes reportaba media lista de Entidades y de Citas. Lo que
  buscamos es lo que _no_ se puede liberar.
- **El gate ignora `aria-hidden`.** Significa "no expuesto a tecnología
  asistiva", no "no pintado". El CTA de Inicio es exactamente eso —una pista
  visual cuya flecha ↓ no dice nada leída en voz alta— y respetarlo dejaba fuera
  del gate el defecto que lo motivó.
- **El gate devuelve el hit-testing durante la medición.** `elementFromPoint`
  atraviesa lo que tenga `pointer-events: none`, así que el pie del Grafo —que lo
  tiene— salía siempre como tapado aunque se pintara encima. Restaurar
  `pointer-events` mientras se mide hace que el resultado refleje orden de
  pintado, que es lo que ve el usuario. Sin esto el gate reportaba tres
  hallazgos donde había uno.
- **Ornamentos SVG por debajo de 2500px² no cuentan.** La comilla de `QuoteMark`
  va en `absolute -top-3` y asoma sobre la cita anterior a propósito. El umbral
  distingue un glifo suelto de una superficie: el lienzo del Grafo mide cientos
  de miles de px² y sigue contando.
- **La trama vacía se simula con el almacén de modo prueba en `{}`.** Es lo que
  ve quien entra por "explorar sin cuenta". `enableDemoMode` sólo borra la clave
  y la app vuelve a sembrar datos de ejemplo.
- **`overrides` no servía para el ERESOLVE.** Reescribe versiones de
  dependencias, no los rangos de _peer_ que declara un paquete de terceros; se
  probó con `npm install --dry-run` y siguió fallando.

### Lo que a propósito NO se tocó

- **La apariencia de Clerk ya estaba resuelta.** `AuthGate.tsx:25` mapea
  paper/ink/accent-primary a las variables de Clerk, desnuda la tarjeta y atenúa
  su branding. Lo que se veía "ajeno" en la revisión era el badge _Development
  mode_ (sólo en dev) y los logos de marca de los proveedores.
- **La segunda copia de `pdf-lib` no es duplicación accidental.** El hilo
  principal la carga como fallback cuando el Worker no está disponible
  (`heavyOperationClient.ts:59`). Ambas copias son lazy, así que en el camino
  normal se descarga una sola vez. Deduplicar sería quitar ese respaldo: decisión
  de producto, no saldo de deuda.
- **El `ECONNRESET` de la suite es flaky de infraestructura del runner**, ya
  catalogado como tal en la skill `pack-workflow`. No hay test tocando red real.
- **`_lib/x/auth.ts` está al 2.17% y `_lib/spotify/auth.ts` al 30.43%.** Se
  anota, no se toca: subirlos pide tests nuevos de flujos OAuth, que es un pack
  en sí mismo. No se les pone piso propio para no congelar el estado actual como
  aceptable.
- **El CTA "descubrir IA" sigue cortado a la derecha en móvil.** Es preexistente
  y vive en otra capa absoluta de la barra; arreglarlo bien pide reestructurar el
  chrome del grafo a un layout de flujo en vez de cuatro capas absolutas
  independientes —que es la causa raíz compartida con el bug de la leyenda—. Se
  deja anotado en vez de encadenar más offsets responsive.

## Validación

- `node scripts/run-vitest.mjs run` — suite completa.
- `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Gates de frontend: `design-tokens`, `icon-button`, `focus-ring`,
  `form-control-labels`, `frontend-boundaries`, `structure-ratchets`,
  `modal-overlay`. Repo: `knip`, `docs-drift`, `script-registry`,
  `architecture`.
- `npm run build` + `node scripts/check-bundle-size.mjs`.
- `e2e/occlusion.spec.ts`: **rojo antes de los arreglos** (pie del Grafo en
  laptop y escritorio; última fila de Entidades en móvil), **verde después**.
- Navegador, medido y no a ojo: `--askbar-h` = `84px` y el scroller reserva
  `124px`; el grafo en móvil pasa de 38% a 115% de encuadre.
