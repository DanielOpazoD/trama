# Planillas Template Library Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la biblioteca de plantillas escale: descripción, tags y estado (borrador/lista) por plantilla, búsqueda que cubra los tres, y crear una planilla nueva desde una existente — cuidando la compatibilidad con los registros IndexedDB ya guardados.

**Architecture:** `SavedDoc` gana tres campos opcionales (sin migración: los registros viejos cargan tal cual y sin `status` se leen como 'lista'). El filtro es un modelo puro (`workspaceTemplateFilter`). El card delega en dos componentes extraídos (menú y detalles) y queda más liviano que antes bajo su ratchet; el editor de detalles se monta solo mientras se edita para partir fresco.

**Tech Stack:** React, IndexedDB (persistencia existente), Vitest.

---

## Decisiones clave

- **Compat sin migración:** los campos nuevos son opcionales; `savedTemplateStatus()` centraliza el default `'ready'` — las plantillas guardadas antes de este campo ya estaban en uso y no se degradan a borrador. Sin bump de `DB_VERSION` (no hay stores nuevos).
- **Duplicar hereda metadatos pero nace borrador:** una copia es una plantilla derivada que aún no está lista. `duplicateSaved` ahora devuelve la copia para encadenar "Duplicar y editar copia" (duplica + abre en diseño), que es la forma de "crear una planilla nueva desde una existente".
- **Búsqueda por tokens sobre nombre + descripción + tags** (todos deben calzar) + chips de estado con conteos. Tags se ingresan separadas por coma y se normalizan (trim, sin `#` inicial, sin duplicados case-insensitive).
- **Mock del test de vista actualizado:** `PdfStudioView.test` mockea el módulo `persistence` completo con factory explícita; toda export nueva del módulo debe agregarse ahí o la vista crashea en silencio (cuerpo vacío). Quedó documentado con `savedTemplateStatus` en el mock.
- **Miniatura ya existía** (`WorkspaceTemplateThumb`): no se rehízo.

## Tasks

- [x] `state(planillas)`: SavedDoc con description/tags/status + `updateSavedMeta` + `duplicateSaved` devuelve copia (borrador, metadatos heredados) + tests del hook.
- [x] `ui(planillas)`: badge de estado, detalles visibles y editor inline (`WorkspaceTemplateDetails`), menú extraído (`WorkspaceTemplateCardMenu`) con "Duplicar y editar copia" y "Editar detalles", filtro puro + chips de estado en la sección; tests de modelo, componente y panel.

## Evidencia de validación

- `npm test`: suite completa verde (4883 tests tras el fix del mock); typecheck, build y bundle budget OK.
- Gates: lint, format, knip, architecture, structure-ratchets (el card BAJÓ de 188 a ~146 líneas gracias a las extracciones) OK.
- Manual en navegador (modo prueba): guardar plantilla → badge "Lista" (default compat); editar detalles → descripción + #tags + Borrador persisten y se ven en el card; chips filtran por estado con conteos correctos; búsqueda por tag encuentra la plantilla; "Duplicar y editar copia" crea "X copia" (Borrador, descripción heredada) y abre el editor; **todo sobrevive la recarga del navegador** (IndexedDB).

## Fuera de alcance

- Pack 5 (Fill Mode Quality): panel de variables, requeridos vacíos, saltar al siguiente, preflight e "invisible al imprimir".
- Sincronización de metadatos al servidor (la biblioteca sigue siendo local por dispositivo, como el resto del studio).
