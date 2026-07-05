# La ficha de entidad como página editorial

## Problema

La ficha de detalle (`NodeDetailPanel`, lo que abre cada clic en una
entidad) es la vista más rica del mundo Trama —sello, ensayo, citas,
conexiones— pero se había quedado atrás: sus citas usaban un render propio
(`QuoteCard`) con guillemets `«»` y filete gris fijo, sin el tratamiento
editorial de #349; sus conexiones mostraban solo el nombre, planas; el
campo `essay` existía pero no se renderizaba; y el nombre usaba `text-xl`
legacy. Justo donde el usuario profundiza, el lenguaje premium no había
llegado.

## Piezas

### Citas editoriales (`QuoteCard`)

- La comilla ornamental compartida (`QuoteMark`, de #350) reemplaza los
  guillemets `«»` — el mismo epígrafe impreso de la vista Citas.
- El filete izquierdo se tiñe por el tipo de la entidad fuente
  (`color-mix(typeAccent 65%, ink-200)`), como en `QuoteItem`. La ficha ya
  tenía `useEntitiesQuery`, así que resolver la entidad de la cita fue
  gratis.

### Conexiones con cara (`RelationshipLine`) — la sorpresa

- Cada conexión (escribió/influyó/menciona) ahora lleva el **`EntitySigil`**
  de la entidad enlazada: su monograma en el color de su tipo. Aquí
  `otherEntity` SÍ viene resuelto con `type` (a diferencia de la vista
  Vínculos, donde era `undefined` y por eso el sello no era posible).
- De paso, el botón de borrar gana `focus-visible:opacity-100` (a11y).

### Ensayo y tipografía

- El campo `essay` (largo) se renderiza como cuerpo de libro: serif,
  leading relajado, respetando saltos de línea. Condicional — solo si la
  entidad lo tiene.
- Nombre a `text-h1` (semántico, ya era 32px). Burn-down completo de
  `text-sm/xs` en `nodeDetail/` (EntityActionsMenu, DescriptionEditor,
  VozDe, QuickNoteForm, EntityHeader) → el ratchet baja.

## Decisiones

- `QuoteCard` (ficha) sigue siendo un componente distinto de `QuoteItem`
  (vista Citas): comparten el lenguaje (`QuoteMark`, filete por tipo) pero
  la ficha no tiene resonancia/favorito. Coherencia sin fusión forzada.
- El ensayo no lleva comilla ni drop-cap: es prosa, no cita.

## Validación

- Suite completa 4964 pass, typecheck, lint, prettier, gates
  (design-tokens con menos aliases, knip, dead-code, ratchets, icon-button,
  focus-ring, form-control-labels, boundaries), build y budget de bundle.
- Navegador (demo, ficha de Borges con datos reales): citas con la comilla
  en oro y sin guillemets; conexiones con los sellos FI (Ficciones) y JC
  (Julio Cortázar) en su color de tipo; nombre serif. El ensayo no se pudo
  ver (Borges no tiene `essay` en el demo) pero el render es condicional y
  cubierto por typecheck.
