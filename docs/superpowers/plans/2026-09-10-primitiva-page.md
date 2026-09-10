# La columna de página no tenía dónde declararse

## Problema

Una medición de nueve superficies en modo prueba, a 1440×900 y 1280×720, dio
esto: **588 px muertos** bajo el contenido en Imprenta, 487 en Cronología, 327
en Atlas, 285 en Momentos. Y el ritmo vertical usaba **doce valores distintos**
—4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48 y un −8 recurrente— sin que ninguno
fuera exclusivo de un rol.

No era descuido de nadie. `tailwind.config.js` no extendía `spacing` y no
existía primitiva de página, así que cada vista improvisaba su columna con
`mx-auto max-w-* px-* py-*` sueltos y su ritmo con la escala numérica de
Tailwind. Había, además, una escala buena **ya escrita y sin usar**: los
`--space-N` de `index.css`, documentados desde δ1, que solo podían consumir
`.stack-2/.stack-3` y `.pad-block-4/5/8` — y que no usaba ningún componente.

## Cambios

- **Cuatro pasos de ritmo en `tailwind.config.js`**, colgados de los
  `--space-N` que ya existían: `ritmo-dato` (11px), `ritmo-bloque` (22px),
  `ritmo-seccion` (44px), `ritmo-vista` (66px). No es una escala nueva: es
  hacer alcanzable la que había. Colgar de las custom properties tiene un
  premio concreto: el bloque `@media (max-width: 640px)` de `index.css` ya
  aprieta `--space-6` y `--space-8`, así que los nombres se adaptan solos.
- **`src/components/Page.tsx`**: la columna con sus cuatro decisiones (ancho,
  padding, apertura/cierre, ritmo). Dos carriles, los que ya existían:
  `reading` (768px, mundo Trama) y `workbench` (1024px, mundo Notas).
- **`PageFill`**: el hijo que se queda con el alto sobrante.
- **Imprenta migrada** como piloto, el peor caso medido.
- **`check:page-shell`**: trinquete ADOPTADO / EXENTO con motivo / PENDIENTE,
  calcado de `check-modal-shell`. Nace con 1 adoptado, 10 exentos y 4
  pendientes.

## Decisiones

- **`Page` no es un scroller, y no puede serlo.** El feed virtualizado se ata
  por id a `#main-scroll` y mide su `scrollMargin` contra ese nodo; interponer
  otro scroller rompería la virtualización de Entidades, Citas y el feed de
  Notas a la vez.
- **En Imprenta el cromo se queda arriba y solo la hoja reparte.** Centrar la
  columna entera dejaría la barra de herramientas flotando en mitad de la
  pantalla. Por eso `PageFill` envuelve solo al panel principal.
- **`flex-1` a secas, nunca con `min-h-0`.** Con `min-height:auto` la MISMA
  clase sirve para los dos casos: la zona de arrastre vacía se estira y llena,
  y cuarenta páginas crecen y el scroller las alcanza. Con `min-h-0` el caso
  corto colapsaría a cero.
- **Centrar con márgenes automáticos, no con `justify-center`.**
  `justify-center` reparte el exceso a partes iguales cuando el contenido no
  cabe, y lo de arriba queda en coordenadas negativas donde ningún scroll
  llega —el problema que ya documenta `CenteredPane`—. Un margen `auto` solo
  reparte lo que sobra.
- **Un piloto, no dieciocho vistas.** El diseño ganador del análisis previo
  advertía el riesgo real de migrar en bloque: pasar de `space-y-*` a `gap`
  **resucita márgenes hoy muertos por especificidad** (`-my-2` ×2 en HomeView
  y `mt-16` ×2 en CronicasSection están anulados hoy por
  `.space-y-12 > … ~ …`, que tiene más especificidad). Esas vistas van en su
  propio PR, con la medición del vector de huecos antes y después.

## Validación

- **Imprenta, medida antes y después**: espacio muerto 588 → **0** px a
  1440×900, y 408 → **0** a 1280×720. La zona de arrastre queda centrada
  (276 px arriba, 298 abajo).
- Mutaciones del gate: volver Imprenta a la columna a mano falla nombrando el
  archivo; una exención cuyo archivo ya no declara columna también falla.
- Esa primera mutación NO caía al principio, y el fallo era del gate:
  `includes('<Page')` daba por adoptado un archivo que solo montaba
  `<PageFill>`. Ahora el patrón exige delimitador.
- Trece sondas entre `Page`, `PageFill` y el trinquete. Suite completa,
  `typecheck`, `lint`, `format:check` y los gates del job `lint` en verde.

## Pendiente

- [alto] Migrar `ViewRouter` (la columna de las once vistas del mundo Trama) y
  `NotasWorld` (las siete de Notas), con sus dos esqueletos. Es donde están
  los 487 px de Cronología y los 327 de Atlas. Hay que borrar en el mismo
  commit las cuatro reglas muertas por especificidad, o al pasar a `gap`
  vuelven a aplicar y se suman.
- El ornamento de Inicio queda huérfano cuando Efemérides y WeeklyActivity
  devuelven null (el caso del modo prueba): 48 px de aire, un glifo de 12 px y
  otros 48. Pide un separador que se anule solo cuando le falta un vecino, en
  vez de una guardia local que ya murió una vez.
