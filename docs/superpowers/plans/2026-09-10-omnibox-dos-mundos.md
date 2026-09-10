# Un solo buscador en los dos mundos

## Problema

La propuesta pedía un omnibox único: uno solo, con gramática de teclado, que
busque, pregunte en lenguaje natural y ejecute comandos. Tras #457 (gramática y
teclado) y #458 (`#` y PIN al preguntar), el mundo Notas seguía con otro
buscador: sin ⌘K, sin teclado, sin preguntas ni consultas guardadas, y con
otras reglas. En Trama, en móvil, no había forma de abrir la paleta.

## Lo que ya estaba roto (medido antes de tocar nada)

Con e2e temporales, en demo, sobre `main` en `36b3f8ce`:

1. **⌘K no hacía nada en el mundo Notas:** 0 diálogos.
2. **«Buscar en Notas» no tenía teclado:** ↓ y Enter no hacían nada, y «Sin
   resultados.» nunca aparecía (se veían los cuatro encabezados vacíos).
3. **No encontraba sin tildes:** «edicion» no encontraba «Comprar la edición
   anotada de #Ficciones».
4. **Enseñaba contenido protegido:** con `notas:notas` protegida, la sección
   pedía el PIN y el diálogo enseñaba igual la nota.
5. **Pedía todas las tareas con la primera letra** (`GET /api/tasks` sin filtro).
6. **En Trama móvil no había disparador del buscador** (390×844): sin teclado
   físico, la paleta, las preguntas y las consultas guardadas quedaban fuera.
7. **«/» en Tareas no hacía nada.**

El chunk de la paleta estaba en 8 179 B gzip, con tope en 8 KB: no admitía el
contenido de Notas sin sacar algo antes.

## Cambios

1. **Margen antes de sumar.** El catálogo sale del modelo, la visibilidad de
   `useCommandSearch`, la lista y la ficha de `CommandPaletteSearchMode` (la
   ficha, a su propio chunk) y el buscador de Trama de `App.tsx`
   (`useShellOmnibox`). `CommandPaletteHost` es el único punto de montaje: baja
   la paleta con `singleFlightImport` y la aísla en su ErrorBoundary.
2. **Contenido aportado por el anfitrión.** `kind: 'content'` y
   `CommandSearchContentSource`, un hook que corre en el mismo render que la
   lista. La acción de la fila es un botón hermano; ⇧Enter la ejecuta.
3. **La fuente de Notas.** Notas, tareas y prompts con el ranking de la paleta,
   desde dos caracteres, cinco por grupo, y nada de una sección protegida, ni
   desde la caché. «copiar» marca el prompt como usado solo si la copia llegó.
4. **Destino en Trama desde otro mundo.** `goToTrama` y `pendingTramaTarget`;
   Trama monta ya en la vista pedida y aplica una vez la entidad, el hilo o el
   modal.
5. **Un solo diálogo.** `NotasOmnibox` monta la paleta en Notas, con ⌘K y «/».
   Se retiran `NotasGlobalSearch`, `matchModuleAlias` y la exención de
   `check:modal-shell`. Los disparadores de los dos mundos dicen «Buscar (⌘ K)»,
   con la tecla en `lib/platformKeys.ts`.
6. **Trama móvil.** El TopBar ofrece «Buscar» cuando no hay sidebar.

7. **Trinquetes al tamaño final**, lo medido + 5 y sin subir ninguno: `App.tsx`
   429, `useCommandSearch.ts` 118, `commandSearchModel.ts` 471, el controlador
   de la paleta 179, `CommandPaletteSearchMode.tsx` 64 con entrada propia, el
   modelo y la selección de la paleta 74, y `NotasWorld.tsx` 377, nuevo.

## Decisiones

- **Un anfitrión por mundo, no un proveedor sobre los dos.** `WorldShell` monta
  un mundo a la vez: basta con que cada uno monte el mismo host. La paleta de
  Trama no cambia de lugar, y el PR se puede revertir por partes.
- **La paleta no sabe qué es una nota.** El contenido llega como filas
  genéricas desde el anfitrión, y su lógica viaja en el chunk de Notas.
- **Listas cacheadas con el ranking común, no `?q=` en el servidor.** Así se
  ignoran las tildes igual que en el resto de la paleta; en el servidor, `ILIKE`
  no las ignora y la demo no filtra.
- **Los mismos comandos en los dos mundos.** Desde Notas, una vista, una
  entidad, un hilo o una acción cruzan a Trama; «Configuración» abre la de
  Notas. `>nueva cita` responde igual en cualquier mundo.
- **PIN que esconde de más.** Mientras no respondan las preferencias del
  servidor, el buscador no enseña contenido de Notas.
- **⇧Enter para la acción de la fila,** que no cierra el buscador. Con la lista
  atrasada no hace nada: no se actúa sobre una fila que aún no se ve.
- **«/» es global en Notas, pero el feed conserva su filtro:** su listener
  escucha antes y el atajo global respeta `defaultPrevented`.
- **El disparador móvil de Trama va en el TopBar:** la barra inferior tiene sus
  huecos contados.
- **Un `lazy` de módulo para la paleta, renovado solo tras un fallo.** Un `lazy`
  creado con `useState` en un montaje que suspende se recrea en cada reintento:
  colgó `App.test.tsx` más de 240 s.

## Revisión adversarial

Con CI en verde y antes de fusionar, tres revisores de solo lectura (conducta,
privacidad y accesibilidad) propusieron defectos, y un escéptico por hallazgo
intentó refutarlos leyendo el código. Se confirmaron nueve y ninguno se
descartó:

1. **En Notas, ⌘K con Configuración abierta abría la paleta debajo del panel**,
   con el foco y el teclado. Comparten capa y decide el orden del DOM: el
   buscador va ahora después, como en Trama.
2. **La acción de la fila se quedaba con el foco** y, al desmontarse «hecha», el
   foco caía detrás del diálogo: la «n» del feed escribía en una nota. La acción
   ya no toma el foco y lo devuelve al campo.
3. **⇧Enter actuaba sobre un índice, no sobre una fila:** marcar una tarea la
   reordena al refrescarse y la siguiente acción caía en otra. La fila elegida
   se sigue por su clave.
4. **Un Enter rápido en Notas preguntaba a la IA** mientras llegaban las listas.
   La fuente devuelve `pending` y el Enter espera a la fila; una lista que falla
   avisa.
5. **Guardar una preferencia antes de tener las del servidor abría el PIN:** el
   guardado optimista dejaba en la caché un parche sin `pinnedSections`. Ahora
   espera a la respuesta.
6. **«hecha» desde el buscador no aplicaba el arrastre de Tareas.** La regla vive
   en `completionPatch`, que usan las dos.
7. **Marcar hecha era mudo:** avisa al acertar y al fallar, como «copiar».

Los dos restantes eran variantes de 2 y de 4. Uno queda pendiente: tras un fallo
de descarga, el reintento renueva la paleta pero no sus lazies internos.

## Validación

- **Sobre los arreglos de la revisión, 13 sondas más**, dos de ellas sobre e2e:
  caen todas. Una sobrevivió en la primera corrida: el e2e de «hecha» pulsaba con
  el ratón, y el `mousedown` ya impide que el botón tome el foco. Ahora activa la
  acción con el teclado, que es donde importa devolver el foco al campo, y la
  sonda cae.
- **Mutaciones: 27 sondas.** Las 25 que deben caer caen, cada una en el test
  pensado para ella, y los dos controles (el peso de la colección y el largo de
  la vista previa) sobreviven. Cinco son de e2e: sin ⇧Enter, sin el contenido de
  Notas, con la nota protegida a la vista, sin el disparador móvil o sin ⌘K en
  Notas, cae el e2e correspondiente.
- **Una sonda sobrevivió en la primera corrida.** Quitar la guarda que aplica una
  sola vez el destino en Trama no tumbaba nada: el test no montaba en
  StrictMode, que es donde los efectos corren dos veces. Ahora monta en
  StrictMode, como `main.tsx`, y la sonda cae.
- **E2E nuevos:** `buscador-notas.spec.ts` (nueve casos, en demo) y
  `buscador-movil.spec.ts` (dos, a 390×844). Con `omnibox-teclado`,
  `sidebar-search` y `omnibox-preferencias`, 22 de 22, corridos solos.
- **Axe:** el buscador de Notas con sus filas y acciones, el buscador móvil de
  Trama, la paleta y las secciones de Notas en escritorio y en móvil: 21 de 21.
- Suite completa (5 640 tests en 818 archivos), `typecheck`, `lint`,
  `format:check` y los 40 `check:*` que corren sin Postgres, en verde; los 5 que
  lo piden quedan para el CI.
- Build, presupuesto de bundle, grafo de chunks sin ciclos y humo del bundle de
  producción, en verde. La paleta pasa de 8 179 a 8 015 B gzip, con la ficha en
  su propio chunk (1 039 B) y el ranking compartido (386 B). `NotasWorld` pasa de
  23 867 a 23 970 B, de 25 KB, y la carga inicial de 195 a 196 KB, de 210.

## Pendiente

- Renombrar y borrar consultas guardadas: la API existe, pero faltan la
  interfaz, los casos de la demo y margen en el chunk de la paleta.
- Buscar notas, tareas y prompts desde Trama exige LIMIT y búsqueda sin tildes
  en el servidor, o un motor unificado: hoy ese contenido solo llega desde Notas.
- Abrir la nota, la tarea o el prompt concreto, no solo su sección: las vistas
  todavía no aceptan un id de foco.
- ⌘K con otro overlay abierto (Configuración, un lightbox, la escritura
  enfocada): la paleta queda debajo. Hay que medirlo y decidir un bloqueo común
  a los dos mundos.
- Tras un fallo de descarga, el reintento renueva la paleta pero no sus lazies
  internos: los resultados y la ficha siguen rechazados hasta recargar.
