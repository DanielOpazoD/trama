# El buscador aprende gramática de teclado, y deja de tumbar la app al preguntar

## Problema

La propuesta del «omnibox único» decía que conviven cinco medios sistemas (el
campo Buscar, la paleta de comandos, `/api/search`, `/api/query/nl` y las
consultas guardadas) y pedía uno solo, con gramática de teclado, que busque,
pregunte en lenguaje natural y ejecute comandos.

Un mapa del terreno en solo lectura (cinco lectores y una síntesis) mostró que
la paleta ⌘K ya reúne los cinco desde el #215. Lo que sigue separado es el
diálogo «Buscar en Notas», con el mundo Notas entero sin ⌘K, y un teclado sin
gramática: Enter solo preguntaba si «preguntar» era la única fila.

Este PR hace la mitad que se valida entera sobre la paleta actual: gramática,
teclado y fiabilidad. El omnibox en los dos mundos va en el siguiente, sobre
`main`.

## Lo que ya estaba roto (medido antes de tocar nada)

Con un e2e temporal, en el navegador:

1. **Preguntar desde la paleta en modo prueba tumbaba la app entera.** La demo
   respondía `{ ok: true }` a `POST /api/query/nl`, la paleta leía `length` de
   `undefined` y, como vive fuera de los ErrorBoundary de las vistas, el error
   llegaba al de la raíz: «La trama se rompió».
2. **Teclear dos letras en la paleta con el backend de los e2e también la
   tumbaba.** El mock de `/api/search` no mandaba momentos, crónicas ni chat, y
   el modelo los recorre. `sidebar-search.spec.ts` pasaba igual, porque
   afirmaba antes de que llegara la respuesta del servidor.
3. **Enter en «nombre de la consulta» no guardaba:** abría el resultado
   enfocado (`?entity=…`) y cerraba la paleta. El listener de la paleta
   interceptaba Enter viniera del control que viniera.
4. **«/» en el grafo abría la paleta** en vez de enfocar su buscador, aunque el
   campo lo anuncia («buscar nodo · /»).
5. **⌘K no hace nada en el mundo Notas.** Queda para el PR siguiente.

Y dos que destaparon los tests nuevos:

6. **Enter justo después de escribir abría la fila de la búsqueda anterior:**
   con «momentos» recién escrito, «Inicio». `useDeferredValue` retrasa la lista
   un render, y el listener leía la vieja.
7. **Dos tests verdes no probaban lo que decían.** El que vigilaba supresiones
   de `exhaustive-deps` leía `CommandPalette.tsx`, pero los listeners ya vivían
   en `commandPalette/`. Y «expone consultas guardadas y las corre» nunca las
   corría.

## Cambios

- **Gramática** (`src/hooks/commandSearchGrammar.ts`): `?` pregunta, `>` deja
  comandos, `@` entidades y `#` secciones de Notas; sin sigilo se busca en
  todo. El modelo acota los grupos por alcance, y solo `todo` y `entidades`
  consultan el servidor.
- **Teclado** (`commandPaletteKeys.ts`): ⌘Enter pregunta lo escrito. Enter y
  las flechas solo gobiernan la lista desde el campo o sin foco, respetan la
  composición con IME y, si la lista aún no alcanzó lo escrito, esperan y
  abren lo escrito. Al pasar a resultados, el foco vuelve al campo.
- **Consultas** (`useCommandPaletteQueries.ts`): cada consulta abre un turno y
  una respuesta vencida se descarta; «consultando tu trama…» se ve mientras
  corre; una respuesta sin `items` avisa en vez de romper; guardar solo borra
  el nombre si se guardó, avisa si falla y no se ofrece sobre una consulta que
  ya es guardada.
- **Descubrible:** el pie enseña la gramática con la búsqueda vacía, el alcance
  se anuncia sobre la lista y el modal de atajos lista la gramática, `/` y el
  Enter real del AskBar.
- **Demo** (`src/lib/demoQuery.ts`): `/api/query` y `/api/query/nl` responden
  con el fallback de texto libre, como producción con la IA apagada. Los tipos
  del motor salen a `src/api/queryTypes.ts`: la demo los usa sin cerrar un
  ciclo con `request.ts`, que la carga.
- **Contrato de lectura `search`** para `/api/search`. Los fixtures de e2e
  mandan la forma completa, y `/api/saved-queries` responde `{ items }`.
- **Atajos:** el «/» del grafo escucha en captura y el atajo global respeta
  `defaultPrevented`; ⌘K funciona con Bloq Mayús.
- **Trinquetes:** el ranking sale del modelo (`commandSearchRanking.ts`) y las
  consultas del controlador. Bajan los topes del controlador (220 → 180) y del
  modelo (520 → 500).
- **Documentación:** `search-command-palette.md` con la gramática y el teclado;
  `quality-gates.md` y `frontend-structure.md` alineados con ADR-0016, que no
  permite subir un trinquete.

## Decisiones

- **Sigilos de editor.** `>` y `@` son la convención que ya conoce quien usa el
  teclado, `?` coincide con el recall de WhatsApp y `#` ya abría secciones.
- **Sin sigilo, «preguntar» sigue al final** para no tapar hits concretos; con
  `?` la pregunta es la intención y va primero.
- **Un solo módulo puro para la gramática**, que usan el modelo, la búsqueda del
  servidor y la ayuda del pie.
- **El Enter prematuro se recuerda en vez de descartarse:** el usuario lo pulsó
  sobre lo que escribió.
- **La demo contesta con texto libre, no con una IA simulada:** es lo que da
  producción sin IA, y así la demo no promete lo que no hace.
- **Contrato para la lectura, guarda para las consultas.** `/api/search` es un
  GET y entra en los contratos de runtime, donde cumple quien produce la
  respuesta. `/api/query` y `/api/query/nl` son POST y no tienen contrato, así
  que la paleta exige `items` antes de pintar.
- **Alcance: la paleta de Trama.** Unificar «Buscar en Notas», llevar ⌘K a
  Notas, el PIN y móvil van en el PR siguiente, sobre `main`: un PR apilado no
  dispara CI.

## Validación

- **E2E nuevo `omnibox-teclado.spec.ts`**, en demo y con el cableado real: «?»
  con Enter pregunta y la app sigue en pie; ⌘Enter pregunta; Enter justo
  después de escribir abre lo escrito; «>» deja solo comandos; Enter en
  «Nombre de la consulta» guarda y la paleta sigue abierta; «/» en el grafo
  enfoca su buscador. Seis de seis, más los dos de `sidebar-search.spec.ts`,
  que ahora espera la respuesta del servidor antes de dar por bueno el
  resultado, y la auditoría de accesibilidad de la paleta.
- Una corrida de los e2e a la vez que la suite unitaria dio un falso rojo en
  «⌘K se cierra con Escape»: sola, pasa. Los e2e de este PR se validan solos.
- **Mutaciones: 29 sondas, las 29 caen**, cada una en el test pensado para
  ella. Entre las más informativas: pintar la respuesta de una consulta
  vencida; que un Enter prematuro abra la fila vieja; que las teclas de otro
  control, o las del IME, gobiernen la lista; que el «/» del grafo vuelva a
  escuchar en burbuja; que guardar borre el nombre aunque falle; y que el
  contrato `search` deje de exigir momentos.
- Suite completa (5 602 tests en 815 archivos), `typecheck` y los 37 gates
  requeridos que corren sin Postgres, con `lint` y `format:check`, en verde.
- Build, presupuesto de bundle (la paleta, 7,9 KB gzip de 8; la carga inicial,
  195 KB de 210), grafo de chunks sin ciclos, carga perezosa de PDF y humo del
  bundle de producción, en verde.

## Pendiente

- «Buscar en Notas» sigue siendo otro diálogo: en ese mundo no hay ⌘K, el
  diálogo no tiene teclado ni consulta el servidor, y no respeta el PIN de
  secciones. Además, «Sin resultados.» nunca aparece y el diálogo pide todas
  las notas al abrirse. Es el PR siguiente (resuelto: un solo buscador en los
  dos mundos).
- «Preguntar» significa tres cosas sin puente entre ellas: la paleta devuelve
  una lista (`/api/query/nl`), y el AskBar y el Chat responden prosa. Además,
  `DescriptionEditor` usa `/api/ask` como LLM genérico y crea hilos que nadie
  abrió, y `VALID_VIEWS` deja fuera cinco vistas. Es una decisión de producto
  antes que de código.
- `/api/search` y `/api/query` cubren tipos distintos: las notas solo aparecen
  al preguntar, y las crónicas y el chat solo al teclear.
- La paleta no tiene semántica de combobox (`role="combobox"`, `listbox`,
  `aria-activedescendant`): las filas son botones y el foco activo es una clase.
- En Trama, en móvil, no hay ningún disparador del buscador: sin teclado
  físico, la paleta queda inaccesible (resuelto: el TopBar móvil ofrece
  «Buscar»).
- `useCommandServerSearch` descarta respuestas viejas pero no aborta el fetch.
- Hipótesis sin probar: en teclados ES/LatAm, `\` necesita AltGr, y la guarda
  `!e.altKey` de los atajos globales lo bloquearía.
- `useCommandSearch.ts` quedó a una línea de su tope (119 de 120): el próximo
  cambio ahí tiene que empezar extrayendo (resuelto: la visibilidad salió a su
  propio hook).
- El chunk de la paleta quedó en 7,9 KB gzip de 8: llevar el omnibox a Notas
  exige traer sus proveedores en otro chunk antes de sumar código (resuelto: la
  ficha salió a su propio chunk y el contenido de Notas viaja con Notas).
