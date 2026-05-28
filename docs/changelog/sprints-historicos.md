# Sprints históricos — Trama

> Archivo de las 194 tareas completadas antes del audit honesto (FF/G).
> Lo conservamos acá para no perder contexto de qué cambió cuándo, pero
> sale de la lista activa de tareas para limpiar el ruido en sesiones
> futuras de Claude Code.
>
> Convención de naming: letras griegas (ρ, σ, τ, υ, φ, χ, ψ, ω) +
> letras inglesas (A, B, C, ...) + sufijos de dominio (ξ Momentos, etc.).
> Cada commit a `main` referencia la sprint correspondiente.

## Sprints fundacionales

### Iniciales (pulido + features IA base)

- Pulido AskBar → ChatView deep-link
- Pulido ChatView filtro/agrupación por sección
- Feature IA: conversación con entidad concreta
- Feature IA: embeddings + búsqueda semántica + dup detection
- Feature IA: modo lectura (PDF/imagen larga, propuestas escalonadas)

### Sprint A-R (backend + features grandes)

- A: HNSW indexes + partial deleted_at
- B: Chat RAG con contexto semántico
- C: API graph/neighbors + entities/lookup + by-ids
- D: Cursor pagination en /api/entities y /api/relationships
- E: GraphView modo subgrafo exploratorio
- F: Partición de extraction_log + chat_messages por mes
- G: Cache layer para counts + hot entities
- H: Combobox de entidades en formulario de Relaciones
- I: Sugerir explorar al entrar al grafo con N>2000
- J: Sidebar search server-only (sin fallback wholesale)
- K: RRF en /api/search
- L: LLM-as-reranker opt-in
- M: HyDE para chat RAG
- N: Runbooks operacionales en /docs/
- O: Health page en Settings
- P: E2E con Playwright sobre 3 flujos críticos
- Q: Refactor GraphView a WebGL (sigma.js)
- R: Eliminar single-user assumption (auth multi-user — deferred per design)

### S — Race conditions + pre-fill IA

- S1: Fix race en InlineProposal applyAll
- S2: Prellenado IA al agregar entidad musical

### T — Visual base + UX copy

- T1: Visual base — contraste + sidebar gris
- T2: Legibilidad NodeDetailPanel
- T3: Sidebar compacto y cohesionado
- T4: UX copy minimal

### U — Bugs UX + features menores

- U1: False offline, Settings overflow, Escuchas flash
- U2: Cita destacada aleatoria + Spotify hyperlinks
- U3: Botón IA en NodeDetailPanel
- U4: Clasificación visual en EntitiesView
- U5: Sugerencias descartadas no reaparecen

### V — Undo destructivo + tooltips

- V1: Undo destructivo (endpoints + Toast + integración)
- V2: Discoverability del ⌘K palette
- V3: Hook useGlobalStatus + indicador TopBar
- V4: Tooltips consistentes en botones-icono

### W — Refactor a módulos

- W1: Refactor NodeDetailPanel a módulos <300 LOC
- W2: Refactor App.tsx a módulos <300 LOC
- W3: Tests UI con React Testing Library

### X — Robustez

- X1: ErrorBoundary global con fallback UI
- X2: Dark mode completamente cableado

### Y — Sistema de tokens

- Y1: Sistema de tokens canónicos (type, icon, tracking, spacing)
- Y2: Focus rings + interaction states sistemáticos
- Y3: Skeleton loaders en vez de "cargando…"
- Y4: Detalles editoriales (::selection, scrollbars, ligaturas, drop cap)
- Y5: Motion polish (easing curves, consolidar animaciones, stagger)

### Z — Spacing + tokens

- Z1: Spacing scale (padding + page headers)
- Z2: Icon stroke-width unificado
- Z3: Card + section utilities
- Z4: Tooltip component (reemplaza title= nativo)
- Z5: Ornaments + footer marks expandidos
- Z6: Page-load choreography
- Z7: Splash redesign
- Z8: A11y audit con axe-core

### α — Tests + observabilidad

- α1: Tests integración backend con mock SQL
- α2: Observabilidad — alertas internas + indicador visual

### Mixed (A1, A2, C1, C2, D1, D2, D3, E1, E2)

- A1: Página de atajos (?) con shortcuts
- A2: URLs dedicadas para entidades (?entity=uuid)
- C1: Sparklines en Health panel
- C2: Actividad semanal en Inicio
- D1: Empty states con SVG ilustrados
- D2: Onboarding interactivo
- D3: Progress states expresivos
- E1+E2: Branding completo (favicon + OG + manifest + theme-color)

### β — Tipografía mono + sidebar

- β1: Tipografía mono para metadata (Codex feel)
- β2: Reducir sombras + radius conservador
- β3: Sidebar active state — barra 2px
- β4: TopBar con breadcrumbs
- β5: Focus mode con atajo `\`
- β6: Toolbar contextual flotante al hover
- β7: Inline expansion en lista de Entidades

### γ — Filtros + a11y fixes

- γ1: Fix cursor encoding (Date → ISO)
- γ2: Filtros en QuotesView
- γ3: Dismiss alert dot on Settings open
- γ4: A11y fixes de Lighthouse

### δ — Vertical rhythm + motion canónico

- δ1: Vertical rhythm system
- δ2: Settings/HomeView reflow
- δ3: Editorial typography (hanging, small caps)
- δ4: Pull-quote + Reading mode
- δ5: Number ticker para counts
- δ6: Time-of-day accent + node breathing
- δ7: Hilo-of-the-day + achievement moments
- δ8: Fix a11y label paréntesis

### ε — CLAUDE.md + Settings split

- ε1: Actualizar CLAUDE.md
- ε2: Refactor Sidebar — NavButton
- ε3: Split Settings.tsx por panel
- ε4: UI para error_log + extraction_log
- ε5: CI gate — Lighthouse audit

### ζ — Grafo visual + chat editorial

- ζ1+ζ2: Edges curvas + edge labels al hover
- ζ3+ζ4: Node typography serif + halo refinado
- ζ5+ζ6: Hover preview card + cluster annotation
- ζ7+ζ8+ζ9: Bubble assistant serif + papel + timestamps marginales
- ζ10+ζ11: Inline proposal con marco + thinking sutil

### η — Discover IA + modelos por tarea

- η1: "guardando" solo en mutations
- η2: Descubrir IA — nuevas sugerencias al re-disparar
- η3: Selector de modelo por tarea (DeepSeek R1 vs V3)

### θ — Panels + InlineProposal

- θ1: NodeDetailPanel — ancho + reorganización
- θ2: Settings panels — ornaments + rhythm
- θ5: CommandPalette — iconos + highlight
- θ6: InlineProposal — marco editorial + verdict badges

### ι — Editorial polish

- ι1: ShortcutsModal — grupos + table
- ι2: Onboarding — páginas prólogo editorial
- ι3: AskBar — compose strip editorial
- ι4: Inline forms — new card pattern
- ι5: Marginalia — folios, fleurons, colophon
- ι6: Escuchas + Sugerencias polish

### κ — Info IA + reflexión + duplicados + Spotify

- κ-info: Icono "i" con modelo info
- κ6: Reflexión IA sobre cita
- κ3: Detección duplicados al añadir entidad
- κ2: Toast suave de sugerencias proactivas semanal
- κ-spotify: Saved tracks + análisis de gustos

### λ — TypeAccent + halos + edges

- λ1: typeAccent en EntityRow
- λ2: featured quote con backplate cálido
- λ3: Chip activo del filtro coloreado
- λ4: Barra activa del sidebar
- λ5: Health dots con severidad real
- λ6: Toast de logro con gold-soft
- λ7: Sparklines tintadas
- λ8: Drop-cap de citas en gold cálido
- λ9: Edges del grafo coloreados por tipo
- λ10: Splash + greeting con wash gold

### μ — Marginalia + sigilo

- μ1: Marginalia manuscrita para userReflection
- μ2: Sigilo de entidad (monograma 2-letras)

### ν — Sombras + noise + modo vela

- ν1: Sombras tintadas con accent-gold
- ν2: Noise sutil en paper-50
- ν3: Modo vela (dark warm) opt-in

### π — Calendar heatmap + minimap + Escuchas

- π1: Calendar heatmap de actividad
- π2: Minimap del grafo
- π3: Escuchas — artista + period + resumen
- π4: Escuchas — heatmap hora/día + trend
- π5: Sugerencias de artistas nuevos vía IA
- π-fix: Clean-up + tests del sprint Escuchas

### ξ — Momentos (capa temporal)

- ξ1: Schema Momentos + endpoints base + vista notas
- ξ2: Recortes con AI extract de entidades
- ξ3: Fotos con Netlify Blobs + vision AI
- ξ4: Vista álbum + filtros
- ξ-fix-1: Refactor MomentosView a módulos
- ξ-fix-2: Tests para Momentos
- ξ-fix-3: Estabilidad + docs

### ο — Relaciones tab + sugerencias auto-hide

- ο1: Relaciones → tab interna en Entidades
- ο2: Sugerencias auto-hide cuando vacío

### Auditoría visual (vistas por una)

- Auditoría visual: Inicio (HomeView)
- Auditoría visual: Entidades
- Auditoría visual: Citas
- Auditoría visual: Grafo
- Auditoría visual: Momentos
- Auditoría visual: Chat
- Auditoría visual: Escuchas (Spotify)
- Auditoría visual: Sugerencias
- Auditoría visual: Settings + Health
- Compilar reporte final con priorización

### ρ — Bug fixes reales + cambios estructurales

- ρ-fix-1: Date.toString, POR TIPO, source dup, período Escuchas
- ρ-struct: Zoom 70%, acciones, Vínculos TopBar, Buscar Sidebar
- ρ-header: SectionHeader canónico + aplicar a 5 vistas
- ρ-consistency: typeAccent, AskBar, ASOCIADO_CON, ENTIDAD, sigil tooltip
- ρ-micro: Citas spacing, trash confirm, chat subtitle, copy
- ρ-canvas: Heatmap 52 sem, hero Inicio editorial, halos grafo
- ρ-tests + push: tests + typecheck + build + PR

### σ-followup — Pulido cross-cutting

- σ-followup: Chat tags, search bar, palette centered, momentos copy, paleta reset, type coherence audit

### τ — Mobile bridge (QR)

- τ-mobile-bridge: Botón QR en Momentos → abre composer Foto desde celular

### υ — Bug fixes + multi-foto

- υ-bugfix: Upload 405 + QR modal solid + center
- υ-no-ai: Quitar IA de Momentos (caption, suggest, linking)
- υ-multi: Multi-foto por momento (payload + visor + compresión)

### φ — Foto polish

- φ-photo-polish: Cover selector + caption→título + tipografía composer

### χ — Edits + playlist toggle

- χ-followup: Edit fotos + playlist toggle + entidades width + momentos compact

### ψ — Photos rich

- ψ-photos-rich: Composer compact + reorder + view modes + timeline año/mes

### ω — Text + motion polish final

- ω-A-text: Greeting variantes + hanging quotes + italics
- ω-B-motion: Section washes + hover tilt + toast ripple
- ω-C-skeleton: HomeSkeleton dedicado
- ω-D-heatmap: Calendar clickeable → Momentos filtrado
- ω-E-favorites: Citas con estrella + filtro

### AA — Estrella visible + composer + edit citas

- AA: ★ visible + composer compact + ancho + IA dropdown + foto lightbox + edit citas

### BB — Backend hygiene + RTL tests

- BB1: withObservability en 6 handlers + import.mts per-item tracking
- BB2: Refactor src/api.ts → src/api/ modular
- BB3: Inter font con font-display: swap
- BB4: onMutate optimístico en mutations
- BB5: Tests para hooks de src/state/
- BB6: Focus-trap en modales
- BB7: Refactor EntitiesView/QuotesView
- BB8: Tests UI con RTL

### DD — Deep debt sprint

- DD1: Banner preview + recuperación de blobs huérfanos
- DD2: vite.config con manualChunks
- DD3: Counts server-side per-entity
- DD4: Client error tracking global
- DD5: Split \_lib/llm.ts por provider
- DD6: LLM cache persistente en Postgres
- DD7: Alertas push del cost-cap
- DD8: Cobertura UI con tests RTL para ChatView + MomentosView

> Las sprints EE (brand polish), FF (request-id + Zod + audit ff3) y G
> (estructura → 6.7) viven en la lista de tareas activa porque son
> recientes y aún relevantes como contexto.
