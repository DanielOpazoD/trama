# Planillas Hands Pack — guías magnéticas, llenado guiado y atajos descubribles

## Problema

Tres fricciones que hacían sentir el editor "artesanal" frente a un producto
de pago: alinear casilleros exigía pasar por el menú de organizar (nada se
alineaba solo al arrastrar), llenar una planilla larga obligaba a ir clicando
campo por campo, y los atajos existentes (shift+clic, ⌘Z, ⌘D, flechas…) eran
invisibles para quien no los conocía.

## Piezas

### 1. Guías magnéticas (diseño)

- `planillas/pdfFormFieldSnap.ts` (puro): al arrastrar, bordes y centros del
  casillero ancla se imantan a los de otros casilleros de la misma página y a
  bordes/centro de página; al redimensionar se imanta sólo el borde en
  movimiento (el opuesto queda fijo) y nunca encoge bajo el mínimo. Umbral de
  10 px de PANTALLA (consistente a cualquier zoom). Alt desactiva el imán.
- Reusa `nearestSnap`/`snapBoxAnchors` exportados de `pdfAnnotationSnap`; las
  líneas se pintan con `SnapGuideLines` (extraído de `AnnotationLayer`, ahora
  compartido). En arrastre múltiple se imanta el casillero agarrado y el grupo
  hereda el delta ajustado.
- Estado en `usePdfFormFieldSnapGuides` (hook chico aparte: el grupo ratchet
  `pdf-studio-forms` iba justo); las guías fluyen PdfTextEditor → PageSurface
  → PageFormLayer y se muestran sólo en la página activa en modo diseño.

### 2. Llenado guiado (relleno)

- `fill/usePdfTemplateGuidedFill.ts`: Enter salta al siguiente campo en orden
  visual (⇧Enter retrocede) reutilizando `jumpToFormField` — la página sigue
  al foco entre páginas. Los `<select>` quedan fuera del intercept (Enter ahí
  confirma la opción). En el último campo Enter no roba el foco.
- Header de relleno: botón «Empezar a llenar ⏎ / Siguiente pendiente ⏎» que
  salta al primer campo pendiente, y barra de progreso (role=progressbar) bajo
  el estado "X de Y".

### 3. Atajos descubribles

- `planillas/PdfStudioShortcutsHelp.tsx`, autocontenido (botón «?» flotante +
  ⌘//Ctrl+/): hoja modal con `useModalOverlay` (trap, Esc, restauración) con
  los atajos del modo activo — diseño o relleno. Sólo en Planillas, no en
  Imprenta.

## Validación

- Focales nuevos: snap (6: drag a bordes/centros/página, umbral, resize con
  borde fijo y mínimo), llenado guiado (4: primer pendiente, avance/retroceso
  saltando readOnly, último campo, select excluido, disabled), cheatsheet (2).
- Suite completa 4938 pass, typecheck, build, gates (ratchets — PdfTextEditor
  577/582 —, design-tokens 499/499, modal-overlay, icon-button, knip, etc.).
- Navegador (demo): arrastre sintético mostró la guía vertical durante el
  gesto, la limpió al soltar y dejó el borde imantado exactamente (125=125);
  «Empezar a llenar» enfocó el primer campo, Enter avanzó al siguiente y la
  barra pasó 0→1 de 11; la hoja de atajos abre por botón y por ⌘/.

## Fuera de alcance (siguiente)

- Etiquetas de distancia entre casilleros y guías de espaciado igual.
- Detección automática de campos y perfil propio (pack "Inteligencia").
- Warning preexistente de forwardRef en Tooltip del toolbar (tarea aparte).
