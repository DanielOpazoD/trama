# ADR-0008: SVG vs sigma.js (`WEBGL_THRESHOLD = 1000`)

- **Status**: Accepted
- **Date**: 2026-05-27
- **Deciders**: @DanielOpazoD

## Context

GraphView pinta el grafo de afinidades. Hay dos enfoques principales para renderizarlo:

1. **SVG**: cada nodo es un `<circle>`, cada edge una `<line>` o `<path>`. Mismo nivel de detalle que el resto de la app (drop shadows, drift sutil, font de marca). Pero el browser repinta TODO el SVG en cada cambio de pan/zoom, y a partir de ~500 elementos el frame rate cae de 60fps a 20fps.
2. **WebGL** (`sigma.js` + `graphology`): los nodos se pintan en canvas con shaders. Sigma maneja 10k+ nodos a 60fps. Pero las CSS variables y el font de marca son más difíciles de matchear pixel-perfect; los nodos se ven "técnicos" comparados con SVG.

Para una trama personal de ≤1000 entidades, SVG es claramente mejor por estética. Para tramas grandes (suponiendo crecimiento sostenido), SVG se vuelve inutilizable.

## Decision

Renderer híbrido con un threshold:

- **`entities.length < 1000`** → SVG (componente `GraphSvgCanvas` con drop shadows, fonts de marca, animations).
- **`entities.length >= 1000`** → sigma.js (componente `GraphCanvasSigma`, lazy-loaded — el vendor pesa ~158 KB gzip).

El threshold está en `src/components/GraphView.tsx`:

```ts
const WEBGL_THRESHOLD = 1000
```

Solo se aplica en modo "completo" (wholesale). En modo "exploratorio" siempre SVG porque el subgrafo se limita a hops del nodo focal (≤120 nodos por diseño).

## Consequences

### Positive

- **Estética preservada en el caso común**: la mayoría de los usuarios estará bajo 1k entidades y verán el SVG estilizado.
- **Escala sin crashear**: si alguien crece a 5k o 10k entidades, el render no se rompe — el switch a WebGL es automático.
- **Bundle: el costo de Sigma solo se paga cuando hace falta**. Lazy-load + threshold significa que un usuario de ≤1k nodos nunca descarga sigma + graphology.
- **Threshold conservador**: 1000 está por debajo del límite real de SVG (~2000 en hardware moderno). El sweet-spot deja margen.

### Negative

- **Dos renderers que mantener**: si cambiamos cómo se ven los edges (curvado, color de tipo), hay que tocar ambos. Hoy GraphSvgCanvas tiene drift + curve; GraphCanvasSigma es más austero.
- **Minimap solo en SVG**: hoy `GraphMinimap` se conecta al `usePanZoom` del SVG. En modo Sigma, no hay minimap. Aceptable porque a 1k+ nodos el zoom interactivo de Sigma (rueda + drag) reemplaza la necesidad del minimap; pero es una asimetría documentada.
- **El switch en 999 vs 1000 puede ser jarring**: alguien con 999 entidades agrega una y de pronto el render cambia de estilo. Mitigación: el cambio es raro (la mayoría de usuarios no cruzan ese umbral), y cuando ocurre, la app sigue funcionando — solo se ve distinto.

### Neutral

- "Reorganizar" recalcula posiciones con `useGraphLayout`. Funciona idéntico en ambos modes (las posiciones viajan como `Map<id, {x,y}>` y los dos renderers las consumen).

## Alternatives considered

1. **Solo SVG**: descartado porque rompe en ≥1k nodos.
2. **Solo Sigma**: descartado porque pierde la estética para el caso común (que es mayoritario).
3. **Solo Sigma + custom shaders para matchear el SVG**: técnicamente posible (shaders custom para drop shadow, font texture), pero complejidad alta para algo que el threshold ya resuelve elegantemente.
4. **`react-cytoscape`** / **`reagraph`**: librerías de grafos React. Más opinadas que Sigma, más difíciles de matchear con el design system. Sigma + nuestro wrapper nos deja más control.

## References

- `src/components/GraphView.tsx` — donde vive el threshold.
- `src/components/graph/GraphSvgCanvas.tsx` — renderer SVG (recente Tier E split).
- `src/components/graph/GraphCanvasSigma.tsx` — wrapper de Sigma.
- `vite.config.ts` — `vendor-graph` chunk separado para sigma+graphology.
