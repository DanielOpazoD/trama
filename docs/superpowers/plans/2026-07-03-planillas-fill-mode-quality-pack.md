# Planillas Fill Mode Quality Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el programa de Planillas: que llenar sea rápido, seguro y claro (requeridos, preflight, firma decente en el panel) y que el diseño se sienta premium — inspector movible con look moderno-minimalista y atajos de teclado (Shift + clic crea casilleros al instante).

**Architecture:** Los requeridos se derivan en el modelo puro de progreso (`requiredPending`, `requiredEmptyTemplateFields`) y fluyen por las props existentes (fillProgress → header slot; panel ya tenía onJump). El arrastre del inspector es un hook genérico (`useDraggablePanel`) cuyo offset vive en `FloatingFormTools` (persiste entre selecciones). Shift+clic reusa el gesto del marquee (clic sin movimiento) y la fábrica de colocación; el reorden de hooks en `PdfTextEditor` (forms antes de interactions) eliminó el patrón de ref del pack 2.

**Tech Stack:** React, Vitest.

---

## Decisiones clave

- **Requerido ≠ pendiente:** el estado del panel y del header priorizan los requeridos vacíos (clay) sobre los pendientes comunes (sage); los chips de "Requeridos vacíos" saltan directo al campo.
- **Preflight sin modal:** imprimir con requeridos vacíos pide confirmación en dos pasos inline en el header ("Seguir llenando" / "Imprimir igual") — nunca bloquea, siempre informa. Cubre también el espíritu de "invisible al imprimir" diferido del pack 3: lo que faltaba era avisar antes de imprimir, no ocultar campos.
- **Firma en el panel:** los campos de firma mostraban el dataURL crudo como texto; ahora son un botón Firmar que salta al campo y abre el diálogo, con miniatura y "Rehacer firma".
- **Shift+clic vs shift+arrastre:** el clic sin movimiento (umbral existente de 4px) crea el casillero; el arrastre sigue siendo selección aditiva por marco. Solo shift puro (sin meta/ctrl/alt).
- **El offset del inspector vive arriba:** montado en `FloatingFormTools` (que persiste), mover el panel se conserva aunque la selección cambie. Arrastre acotado al viewport; los controles del handle siguen clickeables.

## Tasks

- [x] `fill(planillas)`: requiredPending en progreso + chips y marcas en el panel + preflight de dos pasos en el header + firma como botón; tests de modelo, panel y header.
- [x] `ux(planillas)`: `useDraggablePanel` + handle con grip en `InspectorHeader` (extraído, ratchets ok) + restyle sobrio (rounded-xl, borde neutro, sombra profunda, blur); tests del hook (arrastre, clamp, controles no arrastran).
- [x] `interaction(planillas)`: `quickPlaceFormField` + `onShiftQuickCreate` en interactions + hint en el tooltip del toolbar; reorden de hooks que elimina el ref del marquee; tests del quick-place (centrado, clamp, sin página).

## Evidencia de validación

- `npm test`: **4895 tests** verdes (suite completa); typecheck, build y bundle budget OK.
- Gates: lint, format, knip, architecture, structure-ratchets (extracción de `InspectorHeader`; `PdfTextEditor` BAJÓ a 571 líneas), pdf-lazy-entrypoints OK.
- Manual en navegador (modo prueba, planilla real de 11 campos): shift+clic creó el casillero centrado y seleccionado; el inspector se arrastró, quedó acotado al viewport y **conservó su posición tras deseleccionar/reseleccionar**; en modo llenar el header mostró "1 requerido vacío", los chips saltaron al campo, imprimir pidió confirmación en dos pasos, y al llenar el requerido chips/aviso desaparecieron y la impresión volvió a ser directa.

## Cierre del programa

Con este pack quedan implementados los 5 packs del programa de Planillas (#328 Premium Editing, #329 Layout Tools, #330 Field Presets, #331 Template Library, este Fill Mode Quality + Premium UX).
