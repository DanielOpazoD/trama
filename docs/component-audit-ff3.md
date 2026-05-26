# Audit honesto de componentes 600+ LOC

> Sprint FF3 + G2 (terminación). Tarea: revisar los 5 componentes con
> >600 LOC y decidir, por cada uno, si vale la pena partirlo. El audit
> previo (Explorer agent) dijo que "todos están justificados" — discrepé
> en 4 de 5. Esta tabla documenta lo que se ejecutó.

## Estado final

| Componente | LOC antes | LOC después | Veredicto | Sprint |
|---|---|---|---|---|
| **QuotesView.tsx** | 708 | 600 | ✅ Partido | FF3 |
| **EntitiesView.tsx** | 612 | 550 | ✅ Partido | G2 |
| **HomeView.tsx** | 670 | **196** | ✅ Partido (orquestador) | G2 |
| **ProposalPanel.tsx** | 603 | 305 | ✅ Partido | G2 |
| **GraphView.tsx** | 758 | 758 | ❌ NO partir | (verified) |

**Reducción total**: -1192 LOC, distribuida en 10 archivos nuevos testeables.

## Lo que se extrajo

### QuotesView (FF3)
- `src/components/quotes/useQuotesFilters.ts` — state + memoized derivations
- `src/components/quotes/QuotesFiltersBar.tsx` — chips presentacionales

### EntitiesView (G2 — espejo del patrón de Quotes)
- `src/components/entities/useEntitiesFilters.ts` — solo typeFilter (sin favoritas)
- `src/components/entities/EntitiesFiltersBar.tsx`

### HomeView (G2 — split por sección visual)
- `src/components/home/Greeting.tsx`
- `src/components/home/FeaturedQuote.tsx`
- `src/components/home/ActivityHeatmap.tsx`
- `src/components/home/RecentTimeline.tsx`

El orquestador conserva queries + `useHiloOfTheDay` (side-effect global)
+ memoización compartida (`buildTimeline`). Los sub-components reciben
data por props — sin queries duplicadas adentro.

### ProposalPanel (G2 — split por sección dentro de la propuesta)
- `src/components/proposals/ExtractionProposalView.tsx` — secciones aditivas (entities + relationships + quotes)
- `src/components/proposals/EditsProposalView.tsx` — secciones destructivas (edits + deletes opt-in)
- `src/components/proposals/utils.tsx` — `CheckedState`, `initialChecked`, `Section`

**Nota honesta**: el audit original hablaba de "split por kind" (Extraction/Reclassification/Edits).
La realidad: `ProposalPanel` maneja UNA forma de propuesta (`ExtractionProposal`)
con sub-secciones. La reclasificación ya vive aparte (`ReclassifyPanel.tsx`),
invocada desde EntitiesView. El split honesto fue por sección dentro de la
propuesta, no por "kind".

### GraphView — NO partido

**Evidencia de que ya está bien decompuesto:**
- `src/hooks/useGraphLayout.ts` — orquesta 4 modos de layout
- `src/hooks/layouts/{organic,byType,byYear,byDegree}.ts` — funciones puras
- `src/hooks/usePanZoom.ts` — drag/pan/zoom + screenToWorld
- `src/components/graph/{GraphNode,GraphEdge,GraphToolbar}.tsx` — render
- `src/components/graph/GraphCanvasSigma.tsx` — WebGL para N>1k

El archivo tiene 758 LOC pero son casi exclusivamente:
- Composición (importa los hooks + subcomponentes y los conecta)
- Estado de UI específica a GraphView (selectedNodeIds, hoveredEdgeId, etc.)
- Side-effects que no encajan en hooks puros (canvas resize, keyboard handlers)

Partirlo distribuiría el mismo problema en más archivos sin reducir complejidad.

## Tests añadidos en G5

- `useQuotesFilters.test.ts` (6 tests)
- `useEntitiesFilters.test.ts` (4 tests)

`useHomeXxx` (las nuevas piezas de Home) no se testean porque son puramente
presentacionales — la lógica vive en hooks ya existentes que tienen sus
propios tests (`useHiloOfTheDay`, `useFeaturedQuote`).

`ExtractionProposalView` y `EditsProposalView` se cubren indirectamente por
los tests existentes de `ProposalPanel.test.tsx` que ahora dispatcha hacia ellos.
