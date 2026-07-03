# Planillas Polish Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la brecha "funciona pero se siente artesanal" con feedback directo del usuario: inspector rehecho (menos denso, plegable, movible por toda la pantalla), tamaño en pt exactos, ⌘Z para casilleros, escribir directo en el cuadro, estilo default que replica el tamaño, toolbar sin duplicados y panel de rellenar liviano con exportación de datos.

**Architecture:** El inspector se portalea al body (puede salir del modal) y `useFocusTrap` acepta contenedores extra con identidad estable; el contenido denso vive en `InspectorDisclosure` (acordeón de apertura única). El undo de casilleros es un historial de snapshots (`usePdfTextEditorFormHistory`): operaciones discretas vía `commitFields`, gestos con un snapshot al inicio, escritura sin snapshot por tecla; ⌘Z prioriza casilleros y cae a anotaciones. Ratchets respetados extrayendo (`usePdfTextEditorAnnotationSetters`, `usePdfTextEditorFormValues`, `InspectorHeader`).

**Tech Stack:** React, Vitest.

---

## Decisiones clave

- **Colores y presets bajo demanda:** filas plegables con chip del color actual — el panel muestra ~8 controles en vez de ~30. Requerido/solo lectura viven en "Avanzado" CON su explicación (eran incomprensibles sin contexto), igual que el estilo default.
- **"Usar como estilo de nuevos casilleros" ahora cumple su promesa completa:** replica también alto/ancho del cuadro en colocar, shift+clic y el fantasma (verificado en vivo: tamaño idéntico al de referencia).
- **⌘Z de casilleros con semántica de gesto:** un arrastre completo = un paso; escribir no snapshotea por tecla (el undo es estructural). Sin historia de casilleros, el atajo cae al historial de anotaciones existente.
- **Escritura directa:** shift+clic deja el foco en el input recién creado; doble clic sobre un casillero existente enfoca el suyo.
- **`useFocusTrap` extendido con default estable:** el primer intento con `extraRoots = []` inline re-ejecutaba el efecto en cada render de TODOS los modales (foco robado a mitad de escritura) — lo cazó `QuoteEditModal` en la suite completa. Default a nivel de módulo + Tab cicla modal↔inspector en orden de documento.
- **Toolbar:** el menú Campos ya no duplica "Crear casillero de texto" (queda el botón primario) y en diseño hay UNA lupa (la del header).
- **Panel de rellenar:** sin el texto explicativo largo, nombres sin corchetes ni placeholders duplicados, grilla compacta de acciones y "Exportar datos" (JSON `{variable: valor}`, mismo formato que Importar — roundtrip).

## Tasks

- [x] `toolbar(planillas)`: lupa única + menú Campos sin duplicado.
- [x] `ui(planillas)`: inspector plegable/portaleado, pt de 1 en 1 con entrada exacta, navegación ‹ › entre casilleros, Avanzado explicado.
- [x] `state(planillas)`: defaults con tamaño de caja + `usePdfTextEditorFormHistory` con ⌘Z/⇧⌘Z.
- [x] `interaction(planillas)`: foco directo tras shift+clic y doble clic para escribir.
- [x] `fill(planillas)`: panel liviano + Exportar datos.

## Evidencia de validación

- `npm test`: **4902 tests** verdes (la suite completa cazó la regresión del focus trap antes de salir); typecheck, build, bundle budget OK.
- Gates: lint, format, knip, architecture, modal-overlay, structure-ratchets (tres extracciones, cero límites subidos), pdf-lazy-entrypoints OK.
- Manual en navegador: lupa única y menú limpio; inspector portaleado (fixed, fuera del modal: left 8 vs dialog 28), 5 secciones plegadas que abren al apretar, input en pt, navegación; shift+clic creó y dejó el foco en el input; ⌘Z 12→11 y ⇧⌘Z 11→12 campos; el estilo default replicó el tamaño exacto (21.203% × 1.95781%); panel de rellenar con Exportar datos, sin texto largo ni corchetes.
