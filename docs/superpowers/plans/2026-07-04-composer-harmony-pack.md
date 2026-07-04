# Composer Harmony Pack — un solo cuadro de escritura para el mundo Notas

## Problema

Los dos cuadros donde se escribe (capturas en Notas, biblioteca de Prompts)
hablaban idiomas distintos. Notas era «papel desnudo»: título serif sin
caja, cuerpo transparente, la tarjeta entera se enciende con el acento al
enfocar. Prompts seguía siendo «formulario»: tres inputs encajonados
(`input-paper`), sin estado de foco en la tarjeta, la colección como campo
protagonista pese a ser de uso poco frecuente.

## Piezas

- **`composerChrome.tsx` (nuevo)** — chrome compartido de los composers:
  - `ComposerCard`: papel suave en reposo, marco de acento + halo al
    enfocar, borde punteado al arrastrar; guard de blur interno (el foco
    moviéndose entre campos no pliega el composer) — una sola copia del
    fix de Safari del pack #342.
  - `composerTitleClass`: el título serif desnudo, compartido.
  - `ComposerFooter`: el pie sereno con slot izquierdo (acciones de ícono
    y campos sutiles + pista) y CTA con ripple de «guardado».
  - `composerIconButtonClass`: la acción de ícono del pie.
- **`NotasFeedComposer` y su pie** re-cableados al chrome (cero cambio de
  conducta: sus 650 tests del mundo pasan sin tocar uno).
- **`PromptComposer` reescrito al lenguaje papel**:
  - En reposo, una línea limpia («Nuevo prompt…»). Al enfocar, esa misma
    línea SE CONVIERTE en el título serif — no hay salto de campos.
  - Cuerpo transparente sin caja (focus-ring-exempt: el marco de la
    tarjeta ya marca el foco), placeholder que enseña las variables.
  - **La colección baja al pie**: ícono de archivo + campo sutil junto a
    adjuntar — lo poco frecuente detrás, no en la primera fila. El grid
    `1fr/180px` desaparece.
  - Enter en el título salta al cuerpo (paridad con Notas).
  - `justSaved`: PromptsView emite el mismo ripple de guardado que Notas
    (700ms, timer con cleanup).

## Decisiones

- El acento es el del mundo (sage) en ambos: los composers son «el mismo
  mueble» del mundo Notas, no piezas por sección.
- `NotasFeedComposerFooter` queda como wrapper fino del `ComposerFooter`
  (API pública intacta → tests intactos); las acciones específicas del
  feed (capturar media) viven en el wrapper, no en el chrome.
- Contratos de tests/e2e conservados: aria-labels («Título del prompt»,
  «Colección», «Contenido del prompt»), placeholder plegado
  («Nuevo prompt…»), CTA «guardar prompt».

## Validación

- Suite completa 4961 pass (los 650 del mundo Notas sin modificar),
  typecheck, lint, prettier, gates (design-tokens, knip, dead-code,
  ratchets, icon-button, focus-ring, form-control-labels, boundaries),
  build. E2e locales de prompts y captura (notas-attachments,
  notas-capture) en verde.
- Navegador (demo): Prompts en reposo = línea limpia; enfocado = título
  serif + cuerpo transparente + pie con colección sutil; lado a lado con
  el composer de Notas — gemelos.
