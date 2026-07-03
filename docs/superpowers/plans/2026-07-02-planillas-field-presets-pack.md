# Planillas Field Presets Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los casilleros se vean bien con un clic, sin configuración repetitiva: presets de estilo sobre el sistema del Premium Editing Pack (#328), aplicables a la selección completa. Y que lo que se ve sea lo que exporta: la fuente y la negrita del casillero ahora salen de verdad en el AcroForm.

**Architecture:** Los presets son parches puros (`pdfFormFieldPresets.ts`) compuestos de `patchFormFieldTextStyle` + `patchFormFieldVisual`; el hook de estilo los aplica a la selección igual que cualquier otro cambio. El export reusa `createPdfFontResolver` (el mismo de las anotaciones: Inter/Spectral/Caveat embebidas con subset, fallback a las estándar).

**Tech Stack:** React, pdf-lib + fontkit, Vitest.

---

## Decisiones clave

- **Primero la fuente, después el preset Firma:** exportar siempre Helvetica (gap documentado del pack 1) haría deshonesto un preset manuscrito. `writePdfFormFields` ahora resuelve la fuente por campo, y `updateAppearances` corre DESPUÉS de fijar el chrome (si corriera antes, hornearía el borde default en el appearance stream y save() no lo regeneraría).
- **Presets = solo lo que declaran:** `null` limpia, lo ausente se conserva. El tamaño de letra nunca cambia por un preset; Formulario no toca el texto; Limpio no toca la fuente. Así componen entre sí y con el resto del inspector.
- **Cuatro presets:** Limpio (solo texto), Formulario (borde tinta), Firma (Caveat sin marco), Destacado (fondo amarillo + negrita). Componen con "usar como estilo de nuevos casilleros" para volver cualquier preset el default.
- **"Invisible al imprimir" se difiere al pack 5:** requiere semántica de export (excluir/ocultar campos) que pertenece al preflight del modo llenar, no a un parche de estilo.
- **Test de export en vitest fija el cableado, no el embed:** sin servidor no hay fetch del woff, así que el resolver cae a las estándar (Helvetica-Oblique/Bold, Courier) — eso ya prueba que fuente y negrita por campo llegan a la DA. El embed real lo ejerce el navegador con el mismo resolver que assemble usa en producción.

## Tasks

- [x] `export(planillas)`: resolver de fuentes por campo en `writePdfFormFields` + registerFontkit + regeneración de apariencia post-chrome + tests reales pdf-lib (DA por fuente/negrita, chrome transparente conservado).
- [x] `feat(planillas)`: `pdfFormFieldPresets.ts` (mapeos puros) + `applyDraftFieldPreset` en el hook de estilo + fila "Presets" en el inspector (single y multi) + tests de mapping y de UI.

## Evidencia de validación

- `npm test`: 4869 tests verdes (suite completa); typecheck, build y bundle budget OK.
- Gates: lint, format, knip, architecture, structure-ratchets, pdf-lazy-entrypoints OK.
- Manual en navegador (modo prueba): Destacado → fondo amarillo + weight 700; Firma → Caveat sin marco; Formulario → borde tinta conservando fuente/negrita previas; Limpio → quita chrome y negrita conservando tamaño. La composición entre presets se verificó encadenándolos sobre el mismo casillero.

## Fuera de alcance

- "Invisible al imprimir" (pack 5, preflight del modo llenar).
- Biblioteca de plantillas (pack 4) y calidad del modo llenar (pack 5).
