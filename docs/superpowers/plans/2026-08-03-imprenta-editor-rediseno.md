# Imprenta: el editor de PDF deja de parecer amateur

## Problema

El editor funcionaba pero se leía como un prototipo: una sopa de iconos grises
de 14px sin límites visibles entre grupos, la acción más importante (crear un
cuadro de texto) indistinguible de los modos, un inspector que mostraba la
misma información dos veces (chips `x 33%` de solo lectura + inputs con los
mismos números), unidades que había que adivinar, y —lo peor— **ninguna pista
de hover funcionaba**.

## El hallazgo que ordena todo lo demás

`Tooltip` clona su hijo y le inyecta un `ref` para medir dónde posicionarse; si
el ref no llega, sale temprano y **no se abre nunca**. `IconButton` era un
function component sin `forwardRef`, así que **cada
`<Tooltip><IconButton/></Tooltip>` del repo era una pista muerta** — la barra
del editor entera, entre otros. Era además el warning de React que la
evaluación de esta sesión ya había señalado como ruido de consola.

El arreglo es una línea conceptual (`forwardRef`) y beneficia a los ~250
IconButtons del repo. Fijado con test (un Tooltip sobre IconButton abre de
verdad) y verificado por mutación (quitar el reenvío del ref lo tumba) y en
navegador real (`role="tooltip"` presente tras hover).

## Rediseño (dentro del sistema: papel/tinta, salvia, escala semántica)

**Barra de herramientas**

- Grupos separados por hairlines (`ToolbarSeparator`) en vez de chips de fondo
  casi invisibles. El test «evita bordes anidados» sigue en pie.
- La acción primaria es la ÚNICA con etiqueta visible («Texto» / «Casillero»
  en planillas): crea contenido, lo demás son modos. El nombre accesible largo
  (`Agregar cuadro de texto`) se conserva vía aria-label — los 7 usos del e2e
  siguen matcheando.
- Estado activo en **salvia sólida** (antes: paper sobre gris, confundible con
  un hover). Es la única apuesta visual fuerte del pack, y está justificada:
  el modo en que está el editor debe leerse de un vistazo.
- Iconos 14 → 16px, controles a h-8, barra sobre paper-50.

**Inspector de selección**

- Fuera la fila de chips duplicada: los inputs son la única fuente de verdad.
- Secciones con eyebrows del sistema (`section-eyebrow`): «Posición y tamaño»,
  «Organizar», «Apariencia».
- `%` visible dentro de cada input (antes había que adivinar la unidad) y
  lectura numérica junto al slider de opacidad.
- Contador «· N objetos» en el título cuando hay selección múltiple.

**Cabecera**

- Migrada a la escala semántica (`text-caption`); controles a h-7. El ratchet
  de aliases legacy bajó 423 → 403 y el piso quedó congelado (5 de acá, 15 que
  ya no estaban en main con el baseline viejo).

## Lo que a propósito NO se tocó

- Arquitectura del carril con scroll y `flex-nowrap` (contrato de e2e móvil).
- Los menús desplegables (Formas, Estilo, X, Formularios): mismo contenido,
  heredan los tamaños nuevos.
- `pdf-studio-visual.spec.ts` (snapshots opt-in con `PDF_STUDIO_VISUAL=1`): las
  referencias visuales cambiarán cuando se corra con el flag; refrescarlas es
  parte del próximo ciclo visual, no de este PR.

## Validación

- Suite completa: **5295 tests / 776 archivos** en verde (con el dev server
  encendido y sin flakies esta vez).
- `typecheck`, `lint`, `format:check`, build, budget y 11 gates de frontend OK.
- **Mutación**: quitar el reenvío del ref en `IconButton` tumba el test nuevo;
  el resto de contratos del rediseño quedaron fijados en los tests actualizados
  (etiqueta visible «Texto», inputs como única fuente, chips ausentes).
- **Navegador real** (demo + borrador recuperado): barra con grupos legibles y
  activo en salvia sólida; inspector con las tres secciones y `%` visible;
  tooltip abierto por hover con su texto. Sin errores de consola nuevos — y el
  warning de refs `Tooltip→IconButton` **desapareció**.
- Sin capturas adjuntas a propósito: el documento usado para verificar era un
  borrador real con datos de salud de un tercero.
