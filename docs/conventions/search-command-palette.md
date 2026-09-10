# Search + Command Palette

El `CommandPalette` es una superficie transversal: navegar vistas, revelar módulos
de Notas, abrir entidades/citas, consultar resultados remotos, preguntar en
lenguaje natural y correr consultas guardadas. Es el mismo buscador en los dos
mundos: en Notas suma notas, tareas y prompts. La regla de mantenimiento es
mantener la UI del palette delgada y las decisiones en funciones puras testeables.

## Gramática

Un sigilo como primer carácter acota la búsqueda
(`src/hooks/commandSearchGrammar.ts`):

| Sigilo    | Alcance   | Qué muestra                                                                                                                                                                                                  |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (ninguno) | todo      | Secciones, el contenido del anfitrión (en Notas: notas, tareas y prompts), vistas, acciones, consultas guardadas, entidades, citas, momentos, crónicas, chat y, desde tres caracteres, «preguntar» al final. |
| `?`       | preguntar | «Preguntar» primero (desde un carácter) y las consultas guardadas.                                                                                                                                           |
| `>`       | comandos  | Vistas, acciones y secciones de Notas.                                                                                                                                                                       |
| `@`       | entidades | Entidades, locales y del servidor.                                                                                                                                                                           |
| `#`       | secciones | Vistas y secciones de Notas, por nombre o alias; primero las de Notas. `#` solo las lista todas.                                                                                                             |

Con un espacio delante, el sigilo es texto. Solo `todo` y `entidades` consultan
`/api/search`: preguntar va por `/api/query/nl`, y comandos y secciones son
locales. El contenido del anfitrión se busca solo sin sigilo (`contentTextFor`).

## Teclado

- ↑↓ recorren y Enter abre la fila enfocada; ⌘Enter o Ctrl+Enter pregunta lo
  escrito sin depender de la fila. Las intenciones se deciden en
  `commandPaletteKeys.ts`.
- La lista la gobierna el campo de búsqueda, o nadie si el foco se perdió al
  cambiar de modo. Con el foco en otro control (volver, el nombre de la
  consulta, una fila alcanzada con Tab) la tecla hace lo que hace ese control.
- Una tecla compuesta con IME (`isComposing`) no actúa sobre la lista.
- Un atajo local reclama una tecla global escuchando en captura y llamando a
  `preventDefault`; el atajo global respeta `defaultPrevented`. Así «/» enfoca
  el buscador del grafo en vez de abrir la paleta.
- El feed de Notas ignora las teclas que nacen dentro de un diálogo modal
  (`[aria-modal="true"]`): con el buscador abierto, «n» no saca el foco al
  compositor.
- ⇧Enter hace la acción de la fila (marcar la tarea hecha, copiar el prompt) sin
  abrirla y sin cerrar el buscador; con la lista atrasada no hace nada.
- En Notas, ⌘K y «/» abren el buscador fuera de los campos. En el feed, «/» es de
  su filtro: su listener escucha antes y el atajo global respeta
  `defaultPrevented`.

## Fronteras

- `src/components/commandPalette/CommandPaletteHost.tsx` es el único punto de
  montaje, en los dos mundos: baja la paleta con `loadCommandPalette`
  (`lib/singleFlightImport.ts`) y la aísla en su ErrorBoundary. Si la descarga
  falla avisa y se cierra, y la siguiente apertura lo vuelve a intentar.
- Cada mundo es anfitrión: `appShell/useShellOmnibox.ts` en Trama (atajos,
  acciones rápidas y el destino al llegar desde Notas) y `notas/NotasOmnibox.tsx`
  en Notas.
- `src/components/CommandPalette.tsx` compone: foco del campo, modo y despacho.
- `commandPalette/CommandPaletteItemList.tsx` pinta la lista, y
  `CommandPalettePeekSlot.tsx` baja la ficha (`CommandPalettePeek.tsx`) en su
  propio chunk.
- `src/components/commandPalette/useCommandPaletteController.ts` lleva el modo
  búsqueda/resultados, la selección y el despacho de comandos.
- `src/components/commandPalette/useCommandPaletteQueries.ts` pregunta, corre y
  guarda consultas. Cada consulta abre un turno; cambiar la búsqueda o volver
  abre otro, y una respuesta con su turno vencido se descarta.
- `src/components/commandPalette/useCommandPaletteKeyboard.ts` traduce el
  teclado a intenciones.
- `src/hooks/useCommandSearch.ts` orquesta estado React y queries de datos. No
  debe volver a construir items inline.
- El contenido de un anfitrión llega por `CommandSearchContentSource`: un hook
  fijo por anfitrión que corre en el mismo render que la lista, así `settled`
  sigue diciendo la verdad. La paleta no conoce sus tipos: la fuente de Notas
  vive en `notas/omnibox/`.
- `useCommandSearchVisibility.ts` lee visibilidad, PIN y alias, y
  `commandSearchCatalog.ts` guarda las vistas y las acciones.
- `src/hooks/commandSearchModel.ts` arma, ordena, dedupea y acota items por
  alcance. Es puro: sin fetch, sin React, sin efectos. El puntaje vive en
  `commandSearchRanking.ts`.
- `src/hooks/useCommandServerSearch.ts` es el único dueño del debounce lexical,
  cancelación y protección contra respuestas stale.

## Ranking

El ranking local es deliberadamente simple:

- exact match o alias exacto.
- prefijo de label/nombre.
- prefijo de palabra.
- substring en label/nombre.
- match en hint, tipo o descripción.

No agrega IA ni motor nuevo. El server sigue usando `/api/search` en modo
`lexical` desde el palette para mantener bajo costo y latencia.

## Contratos

- Los resultados locales y remotos se dedupean por id antes de renderizar.
- Sin sigilo, `ask` va al final y no debe tapar hits concretos; con `?` va
  primero.
- Con `#`, las secciones de Notas van antes que las vistas, y un alias
  personalizado encuentra su vista o su sección.
- El contenido de una sección protegida con PIN no sale de ella. Una pregunta o
  una consulta guardada no enseña hits de nota si `notas:notas` está protegida:
  `useSectionPin().isContentHidden` esconde también mientras las preferencias
  sean las del espejo local, que puede estar viejo. `isPinRequired` es la de
  `SectionPinGate`.
- El contenido de Notas respeta el PIN dos veces: la consulta de una sección
  protegida no se pide, y el modelo no enseña un grupo protegido aunque esté en
  caché.
- Desde Notas, lo que vive en Trama (una vista, una entidad, un hilo o una
  acción) cruza de mundo con `goToTrama`; «Configuración» abre la de Notas.
- `/api/search` pasa por el contrato de lectura `search`. La paleta recorre los
  cinco grupos sin defensas, así que quien produce la respuesta (backend, demo o
  mock de e2e) entrega todos.
- `/api/query` y `/api/query/nl` no tienen contrato de runtime: la paleta exige
  `items` antes de pintar y, si falta, avisa en vez de romperse. La demo los
  responde con `src/lib/demoQuery.ts`.
- Todo nuevo `Item.kind` debe tener:
  - row visual en `CommandPaletteItems.tsx`.
  - key estable en `commandPaletteModel.ts`.
  - descripción diagnóstica en `commandSearchModel.ts`.
  - test single-axis en `commandSearchModel.test.ts`.
  - si trae acción, un botón hermano de la fila, nunca anidado, cuyo nombre
    contenga el texto visible.

## Ratchets

`CommandPalette.tsx`, `CommandPaletteSearchMode.tsx`,
`useCommandPaletteController.ts`, `useCommandSearch.ts`, `commandSearchModel.ts`,
`useCommandServerSearch.ts` y `NotasWorld.tsx` están bajo
`check:structure-ratchets`. Cuando un tope estorba se extrae, no se sube
(ADR-0016), y el tope del archivo que adelgaza baja en el mismo PR.
