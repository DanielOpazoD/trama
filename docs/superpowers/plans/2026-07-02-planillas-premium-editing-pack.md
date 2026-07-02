# Planillas Premium Editing Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que diseñar planillas sea directo, visual y confiable: pegar donde el usuario está mirando, no perder trabajo al cerrar la pestaña, estilo visual real por casillero (que exporta fiel), un inspector unificado y colocación con vista previa.

**Architecture:** Sin motor nuevo. El modelo puro (`src/lib/pdfStudio/model`) gana propiedades visuales opcionales; el export AcroForm (`pdfForms.ts`) las traduce vía un mapping puro; el editor mantiene `usePdfTextEditorForms` como orquestador y extrae colocación (`usePdfTextEditorFormPlacement`) y estilo (`usePdfTextEditorFormStyling`) a hooks propios para respetar los ratchets. El autosave del editor reusa el pipeline existente del workspace (sanitizador + IndexedDB + máquina de estados).

**Tech Stack:** React, pdf-lib (AcroForm), IndexedDB/localStorage, Vitest.

---

## Decisiones clave

- **Pegar en la página visible:** `reduceFormFieldShortcut` ahora recibe `currentPageId`. Misma página → copia corrida (+0.025, como antes); otra página → misma posición del original re-anclada y acotada. Los nombres siguen únicos a nivel documento (el export rechaza duplicados).
- **Autosave del editor solo en modo diseño:** el editor modal devolvía las ediciones únicamente al cerrar con "Listo"; cerrar la pestaña perdía la sesión. Ahora empuja `currentEdits()` con debounce (900 ms) hacia `workspace.autosaveSnapshot`, que pasa por el mismo sanitizador de siempre (en modo llenar se siguen limpiando los valores → la plantilla no se contamina). Cancelar re-escribe el borrador con el doc confirmado. El editor general (Imprenta / modo `edit`) queda intencionalmente fuera: su semántica de "Listo/Cancelar" no cambia.
- **Estilo visual exportable, no decorativo:** `color`, `bgColor`, `borderColor`, `align` son opcionales y en hex plano. Sin declarar → el casillero sigue transparente (no tapa el PDF base, contrato previo). La "transparencia" del plan se materializa como "Sin fondo"/"Sin borde" (fidelidad AcroForm) en vez de una opacidad numérica que el PDF no puede representar.
- **Un solo inspector (1..n):** variable y valor inicial de a uno; tamaño/negrita/color/fondo/borde/alineación y flags a toda la selección; ordenar/distribuir con multi. `FormFieldSelectionInspector` se elimina (quedaba redundante).
- **Estilo inicial recordado:** "Usar como estilo de nuevos casilleros" persiste en localStorage por usuario (validación campo a campo al cargar; storage corrupto no rompe).
- **Colocación con fantasma:** preview punteado que sigue el cursor en cualquier página (misma matemática del click de colocación, corrige rotación y zoom). Esc cancela la colocación en fase de captura antes de que el Escape del editor deseleccione o cierre.

## Tasks

- [x] `fix(planillas)`: pegar casilleros en la página visible + tests (misma página, otra página, clamping, nombres únicos).
- [x] `state(planillas)`: `usePdfTextEditorAutosave` (debounce, skip-mount, gated a diseño) + `autosaveSnapshot` en el workspace + badge de estado dentro del editor + reset al cancelar + tests de hook y workspace.
- [x] `feat(planillas)`: modelo con estilo visual, render (`formFieldChromeCss`/`formFieldTextCss`), export con `formFieldAppearanceValues` (mapping puro testeado) + alineación pdf-lib + test real de AcroForm.
- [x] `ui(planillas)`: `FormFieldInspector` unificado + secciones presentacionales + `usePdfTextEditorFormStyling` + defaults persistentes (`pdfFormFieldStyleDefaults`) + tests de componente y de persistencia.
- [x] `ux(planillas)`: `FormFieldPlacementPreview`, Esc cancela colocación, hover/anillo de selección/cursor de arrastre en diseño, tooltips en handles + tests.

## Evidencia de validación

- `npm test`: 736 archivos / 4848 tests verdes (suite completa).
- `npm run typecheck`, `npm run build`, `node scripts/check-bundle-size.mjs`: OK (chunks dentro del budget; sin dependencias nuevas).
- `npm run lint`, `npm run format:check`, `npm run check:knip`, `npm run check:architecture`, `npm run check:structure-ratchets`, `npm run check:pdf-lazy-entrypoints`: OK.
- Ratchets respetados extrayendo responsabilidades (colocación/estilo fuera de `usePdfTextEditorForms`; sección "Ordenar" fuera del inspector; fantasma en `PdfTextEditorPageFormLayer`), no subiendo límites.

## Fuera de alcance (queda para packs siguientes)

- Selección múltiple por marco (marquee) sobre casilleros y alineación vertical arriba/medio/abajo (Layout Tools Pack).
- Presets con nombre (limpio/formulario/firma/énfasis) sobre la base de estilo ya creada (Field Presets Pack).
- Export de la fuente elegida en AcroForm (hoy los campos exportan Helvetica; la fuente sí se respeta en pantalla y al aplanar anotaciones): requiere embeber fuentes en `writePdfFormFields` vía fontkit.
- Metadatos de plantilla (tags, miniatura, borrador/lista) y mejoras del modo llenar (Template Library / Fill Mode packs).
