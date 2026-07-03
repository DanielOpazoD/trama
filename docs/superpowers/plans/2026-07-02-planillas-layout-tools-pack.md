# Planillas Layout Tools Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productividad con selección múltiple: marco de selección sobre casilleros, alineación en 6 ejes, igualar tamaños y duplicar grupos. Continúa el Premium Editing Pack (PR #328).

**Architecture:** El marco reusa el gesto existente de anotaciones: `usePdfTextEditorInteractions` gana un callback `onMarqueeBox` (ratios de página) que los casilleros consumen primero en modo diseño; si no capturan, las anotaciones siguen como siempre. Las operaciones de layout son funciones puras en `pdfFormFieldArrange` y el duplicado comparte la lógica del atajo ⌘D. La selección de casilleros (clic + marco) sale a `usePdfTextEditorFormSelection` para mantener `usePdfTextEditorForms` bajo su ratchet.

**Tech Stack:** React, Vitest.

---

## Decisiones clave

- **Prioridad del marco en diseño:** si el marco toca casilleros, los selecciona y apaga la selección de anotaciones (evita dos inspectores solapados). Marco vacío o clic simple limpia ambas selecciones (aditivo con shift conserva). El lasso (alt) sigue siendo solo de anotaciones.
- **Alineación vertical con la misma semántica que la horizontal:** contra el bounding box de la selección; con un solo casillero, contra la página completa.
- **Igualar tamaños toma como referencia el casillero activo** (último seleccionado), acotado para no salirse de la página (mínimo 0.018, mismo piso que el modelo).
- **Duplicar grupo = ⌘D con botón:** `duplicateFormFields` puro compartido entre el reducer de atajos y el botón del inspector; las copias quedan corridas, con nombres únicos y seleccionadas.

## Tasks

- [x] `formFieldIdsInBox` + `mergeSelectedFormFieldIds` (puros) + `onMarqueeBox` en interactions + `usePdfTextEditorFormSelection` + wiring por ref en `PdfTextEditor`.
- [x] `alignFormFields` con top/middle/bottom, `matchFormFieldsSize`, `duplicateFormFields` compartido; hook de arrange ampliado.
- [x] Sección "Ordenar selección" del inspector: 6 ejes, = Ancho / = Alto, Distribuir (≥3), Duplicar selección.
- [x] Tests puros (alineación vertical, igualar + clamping, marco por página/solape/clic, merge de selección, duplicado) y de componente (botones nuevos).

## Evidencia de validación

- `npm test`: 4860 tests verdes (suite completa); typecheck, build y bundle budget OK.
- Gates: lint, format, knip, architecture, structure-ratchets (extracción de `usePdfTextEditorFormSelection`, no subida de límites), pdf-lazy-entrypoints OK.
- Manual en navegador (modo prueba): marco seleccionó 3 casilleros → inspector "3 casilleros"; alinear arriba igualó los tops; duplicar pasó 3→6 con las copias seleccionadas; clic en vacío cerró el inspector; marco de nuevo → "6 casilleros".

## Fuera de alcance

- Presets con nombre (Field Presets Pack), biblioteca de plantillas y modo llenar (packs 4-5).
- Lasso (selección a mano alzada) sobre casilleros: el marco rectangular cubre el caso real; el lasso queda de anotaciones.
