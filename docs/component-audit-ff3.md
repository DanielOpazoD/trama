# FF3 — Audit honesto de componentes 600+ LOC

> Sprint FF3. Tarea: revisar los 5 componentes >600 LOC y decidir, por cada
> uno, si vale la pena partirlo. El audit anterior (Explorer agent en
> conversación previa) dijo que "todos están justificados" — lo revisé y
> discrepo en 3 de 5. Este doc explica el razonamiento.

## Resumen ejecutivo

| Componente | LOC actual | Recomendación | LOC objetivo | Estado |
|---|---|---|---|---|
| **QuotesView.tsx** | 708 | ✅ partir | ~450 | **HECHO** (esta PR, 600 LOC) |
| **EntitiesView.tsx** | 612 | ✅ partir | ~430 | Pendiente — patrón idéntico a Quotes |
| **HomeView.tsx** | 670 | ✅ partir | ~250 (orchestrator) | Pendiente — 4 secciones obvias |
| **ProposalPanel.tsx** | 603 | 🟡 parcial | ~500 | Pendiente — split por kind del renderer |
| **GraphView.tsx** | 758 | ❌ NO partir | — | Ya bien delegado a hooks + subcomponentes |

## Análisis por archivo

### QuotesView.tsx (708 → 600 LOC) — HECHO

**Estructura encontrada:**
- 50 LOC: helpers (formatDate, withDropCap) + sets (WORK_TYPES, PERSON_TYPES)
- 80 LOC: state de filtros + memoized derivations (typeFilter, favoritesOnly, availableTypes, pinnedCount, entityTypeById, quotes)
- 25 LOC: authorOf helper
- 30 LOC: virtualizer setup
- 100 LOC: filter chips inline
- 200 LOC: header + empty states + virtualized list render
- 200 LOC: `QuoteItem` inline (subcomponente)

**Split aplicado:**
- `src/components/quotes/useQuotesFilters.ts` (~80 LOC) — state + memoized
- `src/components/quotes/QuotesFiltersBar.tsx` (~120 LOC) — chips presentacionales
- `QuotesView.tsx` queda en 600 LOC

**LOC reduction:** 108. No es gigante, pero la responsabilidad se separó: el
hook es testeable aislado, la barra de chips es reutilizable visualmente.

**Por qué no más:** `QuoteItem` (200 LOC) maneja edit modal + reflect AI +
delete confirm + render del cuerpo. Es UN concepto coherente — partirlo
sería ceremonial. La virtualization tampoco se puede extraer fácilmente sin
exponer demasiados callbacks.

### EntitiesView.tsx (612 LOC) — pendiente

**Estructura:**
- typeFilter state + availableTypes memoized (~25 LOC) — espejo de QuotesView
- Filter chips inline (~80 LOC) — espejo de QuotesView
- showForm + pending (reclassify) state
- Inline expansion state (expandedId)
- quoteCountById + relCountById Maps
- Virtualized list

**Split recomendado:**
- `useEntitiesFilters` hook (~30 LOC, más simple que el de Quotes — solo
  typeFilter)
- `EntitiesFiltersBar` (~80 LOC, similar pero sin chip "favoritas")

**LOC reduction estimada:** ~80–100. Quedaría en ~430.

**Riesgo:** bajo — patrón idéntico a QuotesView ya probado.

### HomeView.tsx (670 LOC) — pendiente

**Estructura:**
Cuatro secciones visualmente distintas, cada una con su propia lógica:
1. Greeting + aforismo del día (~120 LOC)
2. Heatmap clickeable de actividad 52sem (~150 LOC)
3. Featured quote rotativa (~140 LOC)
4. Actividad por sección (sparkline summary) (~150 LOC)

Más bootstrap (queries + composiciones).

**Split recomendado:** un archivo por sección:
- `src/components/home/Greeting.tsx`
- `src/components/home/ActivityHeatmap.tsx`
- `src/components/home/FeaturedQuote.tsx`
- `src/components/home/SectionActivity.tsx`

`HomeView.tsx` queda como orquestador (~250 LOC: imports + queries + layout).

**LOC reduction estimada:** ~400. Cada sección queda testeable en aislamiento.

**Riesgo:** medio — hay que verificar que los hooks (`useHiloOfTheDay`,
`useFeaturedQuote`) sigan funcionando aislados de las secciones.

### ProposalPanel.tsx (603 LOC) — pendiente

**Estructura:**
- Hooks de mutación (add/update/delete/reclassify)
- Switch del tipo de propuesta + renderers por kind
- Tres bloques grandes:
  1. ~120 LOC renderer para propuesta de IA (entities/quotes/relationships)
  2. ~140 LOC renderer para reclasificación
  3. ~100 LOC renderer para edits + deletes con applyAll

**Split recomendado:**
- `src/components/proposals/ExtractionProposalView.tsx`
- `src/components/proposals/ReclassificationProposalView.tsx`
- `src/components/proposals/EditsProposalView.tsx`

`ProposalPanel.tsx` queda como switcher (~150 LOC: dispatch por kind del
PendingProposal + shell del panel).

**LOC reduction estimada:** ~400 distribuidos.

**Riesgo:** medio — los renderers comparten muchos helpers que habría que
elevar a `src/components/proposals/utils.ts` o duplicar.

### GraphView.tsx (758 LOC) — NO partir

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

**Lo que pasaría si lo partís:** terminás con un orquestador de 400 LOC + 3
archivos chicos de 100 LOC que solo se llaman entre sí. La complejidad NO
se reduce — solo se distribuye.

**Decisión:** dejar como está. Esto es lo que un senior dice cuando vio
demasiados splits cosméticos que dañaron la legibilidad.

## Recomendación

1. **Esta PR (FF3-a)**: QuotesView refactorizado como proof of concept del
   patrón filter-hook + filter-bar.
2. **FF3-b (próxima PR)**: EntitiesView con el mismo patrón. Pattern probado,
   bajo riesgo.
3. **FF3-c (PR separada)**: HomeView dividida en 4 secciones. Cambio más
   grande pero seams claros.
4. **FF3-d (PR separada, opcional)**: ProposalPanel split por kind. Solo si
   se quiere mejorar testabilidad de los renderers.
5. **Nunca**: GraphView no necesita refactor.

Total esperado al final: **−700 LOC repartidos en 5+ archivos nuevos
testeables**, sin tocar GraphView.
