# El chrome del Grafo: dos raíles en vez de seis capas ciegas

## Problema

Cada pieza que flota sobre el lienzo del Grafo se colocaba sola, con su propio
`absolute`, sin saber de las demás. Cuatro aterrizaban en la misma esquina:

| pieza               | posición          |
| ------------------- | ----------------- |
| barra de contadores | `bottom-3 left-3` |
| leyenda de tipos    | `bottom-4 left-4` |
| minimapa (140×100)  | `bottom-3 left-3` |
| buscador            | `right-4 top-16`  |

Con el mismo `z-10`, quién se pintaba encima lo decidía el orden del DOM. El
pack anterior (#357) ya había tapado dos choques de esta familia con offsets
—`md:bottom-9` para la leyenda, `top-20` para el buscador—, pero eso movía el
problema de sitio en vez de quitarlo.

Y quedaba uno sin ver, el peor: **el minimapa cubre la leyenda entera y los
contadores** en cuanto la trama pasa de 100 nodos. Medido en `main`, con 130
entidades a 1440×900:

```
minimapa    t788–b888   l268–r408
leyenda     t840–b864   l272–r352   ← dentro del minimapa
contadores  t875–b887   l268–r487   ← debajo del minimapa
elementFromPoint(centro de los contadores) → <svg> del minimapa
```

No lo veía nadie: el gate anti-oclusión sólo alcanzaba la semilla de seis
entidades, y con seis el minimapa no se monta.

## Piezas / Cambios

- **`GraphToolbar` → `GraphChrome`** (renombrado con `git mv`, historia
  preservada). Deja de ser "la barra de arriba" y pasa a ser el chrome
  completo: un contenedor en flujo con un raíl superior y otro inferior, cada
  uno con lado izquierdo y derecho. Recibe `legend`, `minimap` y `search` como
  slots — esas piezas necesitan datos del grafo que el chrome no tiene, pero el
  reparto del espacio queda en un solo sitio.
- **`GraphTypeLegend` y `GraphSearch`** pierden su posicionamiento propio y
  pasan a ser contenido en flujo. Ambos reponen `pointer-events-auto`.
- **El minimapa** se mueve al slot, en la columna izquierda del raíl inferior,
  entre la leyenda y los contadores.
- **`GraphView`** compone los slots en vez de sembrar cuatro `absolute` sueltos.
- **`e2e/occlusion.spec.ts`** gana un tercer dataset, «trama grande» (130
  entidades), que es la única forma de que el minimapa exista durante el test.

## Decisiones

- **Raíles en flujo, no más offsets.** Dos piezas no pueden solaparse si
  comparten el reparto del espacio en vez de ignorarse. La prueba está en que
  este pack _borra_ los parches `md:bottom-9` y `top-20 md:top-16` que el pack
  anterior había tenido que inventar: ya no hacen falta.
- **Slots en vez de partir el componente en cuatro.** Se valoró trocear
  `GraphToolbar` en `GraphModePills` + `GraphActions` + `GraphZoomCluster` +
  `GraphStatBar`. Habría multiplicado los archivos y obligado a repartir un
  props-bag de dieciocho campos entre ellos, sin ganar nada: el problema no era
  que el toolbar fuera grande, era que nadie mandaba sobre el espacio.
- **El contenedor es `pointer-events-none` y cada pieza repone
  `pointer-events-auto`.** Es la única forma de tener un contenedor a pantalla
  completa sobre el lienzo sin robarle el pan/zoom. Verificado midiendo: los
  huecos de ambos raíles devuelven el `<rect>` del lienzo; sobre las píldoras y
  el zoom devuelven `BUTTON`.
- **El renombrado se hizo con `git mv`** para que el diff se lea como un
  movimiento y no como "archivo nuevo + archivo borrado".

### Lo que a propósito NO se tocó

- **Los banners centrados** (`GraphExploreHint`, `GraphSuggestStatusBanner`, el
  aviso "tejiendo el grafo…") siguen con su `absolute` propio. Son overlays
  transitorios centrados, no compiten por una esquina, y meterlos en los raíles
  los ataría a un layout que no necesitan.
- **El minimapa sigue oculto en modo Sigma (WebGL)**: su pan/zoom no pasa por
  `usePanZoom`. Es la misma limitación de antes, ahora sólo mejor colocada.

## Validación

- `node scripts/run-vitest.mjs run` — suite completa.
- `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Gates de frontend: `design-tokens`, `icon-button`, `focus-ring`,
  `form-control-labels`, `frontend-boundaries`, `structure-ratchets`,
  `modal-overlay`. Repo: `knip`, `docs-drift`, `script-registry`,
  `architecture`.
- `npm run build` + `node scripts/check-bundle-size.mjs`.
- `e2e/occlusion.spec.ts`: el dataset «trama grande» sale **rojo en `main`**
  (contadores 100% tapados, botón "leyenda" 92%, siempre por el minimapa) y
  **verde con este pack**. Los siete casos pasan en ~56s.
- Medido en el navegador con 130 entidades: leyenda `734–758`, minimapa
  `766–866`, contadores `875–887` — apilados con 8px de aire y **cero solape**
  entre los tres pares.
