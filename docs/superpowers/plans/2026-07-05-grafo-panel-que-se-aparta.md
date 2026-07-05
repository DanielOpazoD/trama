# El grafo: el panel que se aparta y la carga que respira

## Problema

Dos fricciones al usar el grafo, señaladas por el usuario:

1. **El panel de detalle tapaba las relaciones.** Al hacer clic en un nodo, la
   "linterna" del grafo marca sus vecinos/relaciones — pero el `RightPanel`
   (un overlay de 40rem a la derecha **con un backdrop que oscurecía todo el
   grafo**) las apagaba y ocultaba. No había forma de mirar el mapa con la
   selección activa.
2. **El grafo aparecía vacío antes de cargar.** La condición de vista vacía era
   `allEntities.length === 0 → <EmptyState/>`, sin distinguir "cargando" de
   "vacío de verdad": mientras las queries traían las entidades se veía un flash
   del estado vacío antes de que apareciera el mapa.

## Piezas

### El panel que se aparta (A)

- El detalle se puede **minimizar** a una **pestaña** anclada al borde derecho
  (sello `EntitySigil` + chevron). Una agarradera cuelga del borde izquierdo del
  panel (mirando al grafo) para empujarlo afuera. Minimizado **no hay velo** y la
  **selección se mantiene**, así el grafo queda visible con las relaciones
  encendidas. (`RightPanel.tsx`, estado `detailMinimized` en `App.tsx`.)

### El backdrop respetuoso (C)

- El detalle **no lleva backdrop**: un velo a pantalla completa —aunque sea
  transparente— se tragaría los clics del grafo. Sin él, el mapa queda
  **interactuable** con el panel abierto (clicar otro nodo cambia la selección;
  clicar el fondo deselecciona y cierra), y el detalle también se cierra con la
  X o Escape. La **propuesta** —que pide una decisión modal— sí mantiene su velo
  tenue con click-fuera. (Ajuste de la review de CodeRabbit: el backdrop
  transparente original seguía capturando los clics.)

### El grafo se acomoda (B)

- Al seleccionar un nodo en desktop, el viewport **se reencuadra a la izquierda**
  (−320px, media anchura del panel) para dejar el nodo y sus vecinos a la vista.
  `usePanZoom.setPanTo` gana un tercer parámetro `screenDx` (offset en px, con un
  `zoomRef` para conservar identidad estable); `GraphView` lo llama una vez por
  selección (un ref evita reencuadrar al arrastrar o recalcular el layout).

### La carga que respira (D)

- `GraphView` distingue `isLoading` de vacío real: mientras la query trae las
  entidades, un `GraphLoadingState` sereno —una **constelación fantasma** que
  late con "tejiendo el grafo…", el mismo lenguaje del `computing` del layout—
  en vez del flash del `EmptyState`. El `EmptyState` solo cuando de verdad no hay
  nada.

## Decisiones

- **Minimizar es efímero por selección.** Cada entidad nueva reabre el panel
  expandido (un `useEffect` sobre `selectedEntityId`), así minimizar es una
  acción deliberada de "ir a mirar el mapa" y no un estado que arrastra.
- **Solo desktop.** En mobile el panel es un bottom-sheet: no se minimiza ni se
  reencuadra (el offset horizontal no aplica).
- **La propuesta no se minimiza** — pide una decisión, mantiene su velo.
- **Reencuadre una sola vez por selección** (ref), para no pelear con el drag ni
  con los recálculos de layout.
- **100% frontend.** Cero backend, DB, RLS, endpoints o migraciones — los
  cimientos intactos; solo componentes, estado local y un hook de pan/zoom.

## Validación

- Suite completa **4977 pass**, typecheck, lint, prettier, gates de frontend
  (design-tokens, knip, dead-code, boundaries, ratchets, icon-button, focus-ring,
  form-control-labels, modal-overlay), build y budget de bundle.
- Navegador (demo, mundo Trama, desktop 1280×800): al seleccionar Borges el nodo
  se reencuadra **770 → 448** (a la izquierda, fuera del panel); el panel lateral
  abre con el botón de minimizar; el **backdrop es transparente** (`rgba(0,0,0,0)`)
  y las relaciones «influyó»/«escribió» quedan visibles; al minimizar, la pestaña
  se ancla al borde derecho (right = 1280) y el grafo queda entero con la
  selección aún encendida. En mobile (530px) el panel es sheet y no hay
  minimizar/reencuadre (correcto).
- Tests nuevos: `RightPanel` (detalle minimizado muestra la pestaña; la propuesta
  ignora el minimizado); `GraphLoadingState`.
