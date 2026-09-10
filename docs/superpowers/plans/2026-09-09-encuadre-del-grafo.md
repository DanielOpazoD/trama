# El grafo encuadraba contra una caja más chica que el dibujo

## Problema

Con el seed de prueba —seis entidades y cinco relaciones— el Grafo se veía
como un racimo perdido en medio de un lienzo enorme. Medido a 1440×900: la
tinta ocupaba 360×336 px sobre 1184×851, el **12 % del área**. Y el mismo
360×336 a 1280×720: el encuadre recentraba, pero no reescalaba.

Dos causas, y la segunda no se ve a ojo:

1. **El techo de zoom era 1.15.** `fitToView` calculaba un `fitScale` de 2,75
   para ese grafo y lo capaba. El 1.15 se había calibrado para el layout
   `by-type`, que manda los nodos a ±2640 px; ahí `fitScale` cae por debajo
   incluso del piso de zoom, así que el techo nunca intervenía y podía subir.
2. **`computePositionBounds` solo conocía los CENTROS.** La caja de centros
   mide 247×235; el dibujo real, con el disco, el halo y las dos etiquetas que
   cuelgan debajo, mide 360×336. Encuadrar contra la caja pelada subestima un
   45 % en ancho, y además sitúa mal el centro vertical, porque las etiquetas
   cuelgan solo hacia abajo.

## Cambios

- **`GRAPH_NODE_INK`** en `GraphNode.tsx`: cuánto pinta un nodo alrededor de su
  centro, derivado de las constantes de dibujo del propio componente (radio
  máximo, `labelY`, `typeLabelY`), para que haya una sola fuente de verdad. Se
  toma el caso máximo a propósito: sobreestimar encoge el zoom, que es el error
  seguro, y nunca recorta.
- **`computePositionBounds(positions, ink?)`**: infla la caja, asimétrico en
  vertical. Por defecto no infla, así que quien solo quiere saber dónde están
  los nodos sigue teniendo la caja pelada.
- **`graphFitBounds`** en `useGraphViewport.ts`: la caja con la que se encuadra,
  en producción. Existe para que la sonda pueda AFIRMAR la decisión en vez de
  reimplementarla (ver abajo).
- **Techo 1.15 → 2** (`FIT_MAX_ZOOM`), exportado para poder afirmarlo.
- **`computeFitToView`**: la aritmética de `fitToView`, extraída de
  `usePanZoom` sin DOM ni estado. Cambiar un número que decide cuánto del
  lienzo ocupa el dibujo sin poder verificarlo con una tabla de casos es
  exactamente el cambio que vuelve dentro de tres meses.

## Lo que enseñó el bucle de mutación

Dos hallazgos que habrían pasado inadvertidos con la suite en verde:

1. **Dos de las tres ediciones nunca se aplicaron.** Un script abortó en una
   comprobación antes de escribirlas, y los tests seguían pasando porque
   probaban la función pura con una caja inflada a mano. La primera mutación
   —devolver el techo a 1.15— no rompió nada: ésa fue la señal.
2. **La sonda reimplementaba el cableado.** Llamaba por su cuenta a
   `computePositionBounds(pos, GRAPH_NODE_INK)`, así que quitar la tinta del
   sitio de producción no la rompía. De ahí sale `graphFitBounds`.

Y dos veces la aritmética equivocada fue la del TEST, no la del código: olvidé
el piso de zoom en el caso del grafo grande, y afirmé un desbordamiento que con
el techo en 2 no ocurre. Las afirmaciones sobre la caja son ahora exactas
(`toBe`, no `toBeGreaterThan`), porque una afirmación cualitativa dejaba pasar
que se olvidara inflar UN borde.

## Validación

- Cinco mutaciones, todas caen: el techo, la tinta en el cableado, y cada uno
  de los tres bordes de la caja por separado.
- En el navegador, modo prueba a 1440×900: de 115 % a 200 % de zoom, y el
  grafo pasa de racimo a mapa con las etiquetas legibles.
- Suite completa en verde (5497), `typecheck`, `lint`, `format:check` y los
  gates del job `lint`.

## Pendiente

- El resto de la composición al viewport: Imprenta deja 588 px muertos,
  Cronología 487 y Atlas 327, y el ritmo vertical usa doce valores distintos
  (de 4 a 48 px, con un −8 recurrente). Eso pide la primitiva `Page` y la
  escala enchufada a los `--space-N` que ya existen en `index.css` y que hoy
  no consume nadie.
