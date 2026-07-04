# NoteCard Rebuild — la nota guardada aprovecha su espacio y edita en calma

## Problema (reportado con screenshots)

1. **Borde inferior asimétrico y espacio desperdiciado**: la nota colapsada
   cortaba el texto pronto (220px) y, sobre todo, el botón de «desplegar»
   (chevron) vivía en su PROPIA fila centrada — debajo quedaba un bloque de
   blanco muerto entre el botón y el borde de la tarjeta. El borde inferior
   acumulaba más aire que el superior.
2. **Doble marco verde al editar**: en edición se veían DOS marcos de acento
   — el de la tarjeta (`editingFrameStyle`: borde pleno + halo de 3px) y el
   anillo de foco propio del `<textarea>` (el MarkdownField de NoteCard no
   traía `focus-visible:outline-none`, a diferencia del composer).

## Cambios

### Cara de lectura reconstruida

- **El «Leer más» vive SOBRE el degradado**, no en una fila aparte: el
  botón ocupa el fade inferior (`h-14`, texto al pie) — cero altura extra,
  el affordance aparece justo donde el texto se desvanece. Desaparece la
  fila centrada del chevron y su espacio muerto.
- **Fila inferior `justify-between`**: a la izquierda lo informativo
  («Mostrar menos» al estar expandida + estado: fuente/fijada/fotos); a la
  derecha las acciones (hover + menú). El borde inferior queda simétrico
  respecto al superior (`p-3.5` uniforme).
- **Más texto antes de cortar**: `COLLAPSED_MAX_PX` 220 → 320 (~14 líneas)
  — aprovecha el ancho de la tarjeta sin que una nota domine la lista.

### Edición en calma (marco único y sutil)

- **`editingFrameStyle` rehecho** (compartido por NoteCard, PromptCard,
  TaskItem — coherencia): de borde de acento PLENO + halo 3px a un borde
  `--accent-primary-ring` (25%) + halo mínimo de 1px `--accent-primary-soft`.
  Medido en vivo: `rgba(74,124,58,0.25)` de borde, halo `0.1` a 1px.
- **Sin segundo anillo**: el `<textarea>` del MarkdownField en NoteCard
  recibe `focus-visible:outline-none` (con su marcador de exención) — el
  marco de la tarjeta es el único que marca el foco. `outline-style: none`
  confirmado en vivo.

## Segunda pasada (feedback del usuario)

- **Espacio inferior «prácticamente virtual»**: el «Leer más» dejó de
  flotar sobre un degradado alto (que dejaba hueco hasta las acciones) y
  ahora comparte UNA fila con las acciones (`justify-between`, mismo toggle
  para colapsar/expandir). El degradado quedó corto (`h-8`) y solo visual;
  el borde inferior queda pegado a esa fila, sin blanco muerto.
- **Borde verde → gris-verde apagado**: (1) `editingFrameStyle` pasó de
  sage 25% a `rgb(122 134 116 / 0.6)` con halo mínimo — verificado en vivo.
  (2) La nota activa del feed usa una variante nueva `.selection-ring-soft`
  (gris-verde a 50%, 3px) en vez del `.selection-ring` sage saturado; los
  otros contextos (biblioteca, pdf-studio) conservan el sage.

## Validación

- Suite completa 4964 pass, typecheck, lint, prettier, gates
  (design-tokens, knip, dead-code, ratchets, icon-button, focus-ring,
  form-control-labels, boundaries), build y budget de bundle.
- Navegador (demo, nota larga creada al vuelo): colapsada con «Leer más»
  sobre el fade y sin fila muerta; expandida con «Mostrar menos» en fila
  simétrica; edición con marco único y tenue (sin doble verde).
- Los 15 tests de NoteCard/PromptCard intactos (los contratos —menú,
  editar, guardar, «Nota fijada»— no cambian).
