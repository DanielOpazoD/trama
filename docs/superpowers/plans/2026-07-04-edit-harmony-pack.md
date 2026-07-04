# Edit Harmony Pack — editar es volver a poner la pluma sobre el mismo papel

## Problema

Tras el Composer Harmony Pack (#344), _crear_ una nota o un prompt era
papel desnudo que se enciende con el acento — pero _editar_ esa misma
pieza reabría el «formulario»: inputs encajonados (`input-paper`) en
PromptCard y TaskItem, botones sueltos sin pie en NoteCard, y ninguna
tarjeta encendida mientras se edita. La asimetría crear↔editar era la
última costura visible del mundo Notas.

## Piezas

- **`composerChrome.tsx` crece con dos piezas**:
  - `editingFrameStyle(accent, accentSoft)`: el marco encendido de una
    tarjeta EN EDICIÓN — el mismo borde+halo del foco del composer, fijo
    mientras dura la edición.
  - `ComposerFooter` gana `secondaryLabel`/`onSecondary` (cancelar como
    btn-ghost junto al CTA) sin tocar a sus consumidores existentes.
- **NoteCard**: la edición ya era papel desnudo; ahora además se enciende
  (`--accent-primary-soft`), el título usa `composerTitleClass`, el pie es
  el `ComposerFooter` con pista «⌘↵ guarda · Esc cancela», y Escape
  cancela (antes solo ⌘↵).
- **PromptCard**: edición reescrita al espejo del PromptComposer — título
  serif desnudo, cuerpo transparente (focus-ring-exempt: el marco marca el
  foco), colección sutil en el pie con ArchiveIcon, ⌘↵ guarda / Esc
  cancela. Desaparecen el grid `1fr/180px` y los tres `input-paper`
  (también bajan 3 `text-sm` del ratchet).
- **TaskItem**: título y detalle desnudos sobre el papel encendido; la
  fila de metadatos (prioridad/semana/fecha + cancelar/guardar) se asienta
  como pie con la misma línea `border-t` del lenguaje; Escape también
  cancela desde el detalle.
- **TareasView (WeekComposer)**: el alta rápida emite el mismo ripple de
  «guardado» de los composers (700ms, timer con cleanup) — confirma el
  gesto sin toast ni salto de layout.

## Decisiones

- Claves queda FUERA a propósito: sus formularios de credenciales
  (usuario/contraseña/URL) se benefician de inputs delimitados.
  Coherencia no es uniformidad.
- El título de tarea es sans `font-medium` (no serif): en su cara de
  lectura la tarea no es serif; el serif es de notas y prompts.
- Contratos conservados: aria-labels de todos los campos y los textos
  «guardar»/«cancelar» no cambian.

## Validación

- Suite completa 4961 pass (los 650 del mundo Notas sin modificar), lint,
  prettier, gates (design-tokens, knip, dead-code, ratchets, icon-button,
  focus-ring, form-control-labels, boundaries), build. E2e locales de
  notas en verde.
- Navegador (demo): edición de nota y de tarea encendidas con el marco
  salvia, campos desnudos, pie sereno con pista de atajos; el composer y
  la tarjeta en edición son la misma superficie.
