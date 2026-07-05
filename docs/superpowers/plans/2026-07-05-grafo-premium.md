# El grafo premium — la leyenda que enciende el mapa

## Problema

El grafo (el "mapa cognitivo", la vista insignia de Trama) ya estaba **bien
fundado**: EmptyState editorial, loading sereno («tejiendo el grafo…»),
HoverPreviewCard en serif, nodos y aristas coloreados por `typeAccent` /
`relTypeAccent`, casi todo en tokens semánticos. La deuda estética era poca, así
que este pack no es un rediseño sino **refinamientos premium de alto valor + un
toque interactivo** — sin tocar el motor.

## Piezas

### La leyenda que enciende el mapa (interactiva + editorial)

- La leyenda de tipos (abajo a la izquierda) pasa de decorativa a **interactiva**:
  al pasar el cursor por un tipo, **sus nodos se encienden** en el grafo y el
  resto se atenúan. Reutiliza la "linterna" que ya existía (`GraphNode.isDimmed`):
  un nuevo estado `hoveredType` en `GraphView` que viaja a `GraphSvgCanvas` y a
  `GraphTypeLegend`. La selección tiene prioridad; el hover de tipo solo actúa
  cuando no hay nodo seleccionado.
- Editorial: los tipos ahora en **serif**, cada fila con realce al pasar, el
  disco de color con un anillo sutil.

### La firma de color en la tarjeta flotante

- `HoverPreviewCard` gana un **disco del acento del tipo** en el eyebrow — la
  misma ancla cromática de la leyenda, para leer el tipo de un vistazo.

### Limpieza premium de tokens

- `GraphSuggestStatusBanner`: `text-xs` (legacy vetado) → `text-caption`.
- El azul de propuestas IA `#7AA7C7`, hardcodeado en tres sitios (`GraphEdge`,
  `GraphNode`, el marker de `GraphSvgCanvas`), se extrae a un token semántico
  `--origin-ai` en `index.css`. Centraliza la semántica «propuesta de la IA» y
  deja la puerta abierta a un override en temas oscuros.

## Decisiones

- **No se tocó el motor.** Ni el renderer WebGL (sigma.js, para ≥600 nodos) ni
  el layout ni el drag. Reescribirlos es riesgoso y —al vivir en canvas— no es
  verificable. El oro premium y medible está en el chrome DOM (leyenda, hover
  card, tokens), que en el demo (SVG, <600 nodos) se inspecciona entero.
- **La leyenda sigue siendo «display-only»** (no filtra: el filtro vive en
  Entidades). El hover es un realce efímero, no un segundo estado de verdad.
- **El realce de tipo es mouse-only**, como el hover de nodos: no se hace
  focusable porque es un refuerzo visual pasajero, no una acción.

## Validación

- Suite completa **4973 pass**, typecheck, lint, prettier, gates de frontend
  (design-tokens con el ratchet a la baja por el `text-xs`, knip, dead-code,
  boundaries, ratchets, icon-button, focus-ring, modal-overlay), build y budget
  de bundle.
- Navegador (demo, mundo Trama, grafo SVG con 6 nodos de 4 tipos): la leyenda
  interactiva **medida** — con «escritor» resaltado, Borges y Cortázar a opacity
  `1.00` y el resto a `0.28`; al salir de la leyenda todos vuelven a `1.00`. Los
  tipos en serif (Spectral). La firma de color en la hover card (disco
  `typeAccent` del tipo). Screenshot de la constelación de escritores encendida.
- Tests nuevos: `GraphTypeLegend` — el hover de un tipo avisa cuál y lo apaga al
  salir o al cerrar la leyenda.
