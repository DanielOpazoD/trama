# Los prompts dejan de perder lo que había antes

## Problema

Un prompt no se escribe: se afina. Se prueba una redacción, se cambia una
palabra, se recorta. Y hasta ahora cada guardado **pisaba el texto anterior sin
dejar rastro**: si la versión nueva salía peor, la que funcionaba ya no existía
en ninguna parte. Ni papelera, ni deshacer, ni copia.

Para una sección que se llama «biblioteca reutilizable», perder la redacción que
funcionaba es perder el trabajo, no una versión.

De paso aparecieron dos cosas más en la misma sección:

- **La API acepta `?q=` desde siempre y la UI nunca lo expuso.** Una biblioteca
  pensada para crecer, sin forma de buscar dentro de ella.
- **En modo demo la sección estaba vacía** (`demoSeed.ts` sembraba
  `prompts: []`). El modo demo es como alguien prueba Trama, así que la sección
  nunca mostraba de qué va.

## Cambios

**Historial**

- `migrations/20260728120000_prompt_versions` — tabla append-only con `user_id`
  y su FK, RLS forzado y soft delete, siguiendo el patrón que ya existía en
  `pdf_studio_template_versions`. Registrada en `PRIVATE_TABLE_CONTRACTS`.
- `_lib/prompt-versions.ts` — el servicio de dominio. Un único camino de
  escritura del prompt, que usan tanto editar como restaurar.
- `prompts.mts` — `GET /:id/versions` y `POST /:id/versions/:versionId/restore`.
- `PromptVersionsPanel.tsx` + `promptVersionModel.ts` — el panel y el modelo.
- `demoRouter` / `demoSeed` — mismo contrato en demo, con historial sembrado.

**Buscador y tarjeta**

- Búsqueda en título, contenido, colección y variables, sin tildes ni mayúsculas.
- Pie de la tarjeta que envuelve en móvil.
- `text-sm` → `text-body` en la tarjeta (baja el ratchet de aliases legacy).

## Decisiones

**El snapshot va en el MISMO statement que la escritura.** Una CTE, no dos
consultas. Las sub-sentencias de una CTE ven la misma foto de la base, así que
el `INSERT` lee la fila previa aunque el `UPDATE` la esté cambiando en la misma
pasada. No existe el instante en el que el texto viejo ya se pisó y todavía no
se guardó.

**Y quién decide si hay que versionar es el propio SQL.** La primera versión lo
decidía en JS a partir de una lectura previa, y eso dejaba una ventana: si otra
pestaña guardaba un texto entre la lectura y la escritura, la decisión se tomaba
sobre un texto que ya no estaba y esa edición ajena se pisaba **sin
registrarla** — justo la pérdida que la función existe para impedir. Ahora la
comparación (`IS DISTINCT FROM`, que no `<>`, porque `collection` puede ser
NULL) usa las mismas expresiones que el `SET` y se evalúa contra la fila viva.
Queda una lectura previa sólo para derivar `tags` y `variables`, que se calculan
en JS; si algo se cuela ahí, lo peor es que las etiquetas queden un guardado por
detrás y se recalculan enteras en la siguiente edición.

**Restaurar pasa por el mismo camino de escritura que editar**, y por eso no
destruye: guarda antes lo que había. Se puede ir y volver sin perder ninguno de
los dos textos. Es la mitad de la garantía que más fácil se olvida — un
«restaurar» que pisa lo actual es otra forma de perder.

**Sólo se versiona el texto.** Marcar favorito o copiar un prompt son `PATCH`
también, pero no hay nada ahí que se pueda perder; versionarlos llenaría el
historial de ruido y escondería las ediciones de verdad.

**Cada fila dice qué cambió.** Un historial es una pila de textos casi idénticos:
sin señalar el campo hay que leerlos enteros para encontrar la diferencia. Como
cada fila guarda el estado ANTERIOR a una edición, la comparación va hacia
adelante — contra la fila más nueva, o contra el prompt actual si es la última.

**Retención de 50 por prompt**, podadas con soft delete. Son unos KB de texto
cada una; el tope existe para que un prompt editado a diario durante años no
crezca sin techo.

**La búsqueda se resuelve en el cliente** pese a que el endpoint acepta `?q=`:
la lista ya viene entera en memoria, así que filtrar ahí es instantáneo,
funciona sin red y no añade una consulta por pulsación. Con decenas de prompts,
el servidor no aporta nada que compense esa latencia.

**Las métricas no siguen a la búsqueda.** Describen la biblioteca; si cambiaran
al escribir dejarían de ser una referencia estable.

## Lo que quedó fuera

- **Un diff palabra a palabra.** Señalar el campo que cambió resuelve el 90% con
  una fracción del código. El diff se justifica si el historial se usa mucho.
- **Contador de versiones en la tarjeta cerrada.** Obligaría a un subquery en las
  cuatro variantes del listado para un dato que se ve al abrir el panel.
- **Expandir prompts largos sin entrar en edición.** La filosofía del repo pide
  preferir lo que quita; el recorte a cinco líneas ya es una decisión tomada.

## Validación

Cada comprobación verificada **en rojo** por mutación antes de darla por buena.

Backend (19 tests de endpoint):

| mutación                                | qué falla                                   |
| --------------------------------------- | ------------------------------------------- |
| quitar el guard `!versionId`            | 3 tests — las dos rutas `/restore` se pisan |
| versionar siempre, cambie o no el texto | «un PATCH que no cambia el texto…»          |
| restaurar sin guardar lo actual         | 2 tests                                     |
| listado sin acotar el prompt al usuario | «GET /:id/versions…»                        |

De punta a punta (5 e2e):

| mutación                                | qué falla                          |
| --------------------------------------- | ---------------------------------- |
| no guardar nada al editar               | «editar guarda el texto anterior…» |
| restaurar sin guardar lo actual         | «restaurar no destruye…»           |
| versionar cambios que no tocan el texto | «un cambio que no toca el texto…»  |

Buscador (8 tests de modelo): quitar la normalización de tildes, cambiar `every`
por `some`, y hacer que las métricas sigan a la búsqueda — las tres caen.

### Tres falsos positivos propios, corregidos

**`expect(values).toContain(true)` no podía fallar.** El array de parámetros del
`UPDATE` ya lleva otros booleanos (`favorite`, `collection !== undefined`,
`tags !== null`), así que contiene `true` y `false` en cualquier caso. Con esa
aserción, desactivar el snapshot entero pasaba los 19 tests. Sustituida por la
consecuencia observable: la poda sólo corre después de registrar.

**Ningún e2e editaba un prompt.** Los cinco partían del historial sembrado, así
que se podía desactivar el guardado al editar —el bug original— y la suite
seguía verde. Añadido el test que edita de verdad por la interfaz.

**El «guard» que medía la región equivocada.** Al mover la decisión a SQL, la
aserción cortaba el statement por `IS DISTINCT FROM` y comprobaba que el trozo
resultante trajera `COALESCE(?, title)`. Pero ese trozo seguía hasta el `SET`
del `UPDATE`, que también lo trae: la comparación podía degradarse a `title` vs
`title` —que nunca versiona nada— y los 19 tests seguían verdes. Acotado al
paréntesis de la comparación. (Y antes hubo que quitar los comentarios del SQL
para cortar: uno de ellos nombra «IS DISTINCT FROM» y partía por ahí.)

Los tres se descubrieron mutando, no leyendo.

### En el navegador

Ida y vuelta completa medida en demo: restaurar la versión más antigua cambió el
prompt, el historial pasó de 2 a 3 versiones, y el texto que era el actual sigue
localizable en el historial. Buscador: `investigación`, `investigacion` e
`INVESTIGACION` devuelven resultados idénticos.

Y una medida que motivó el `flex-wrap`: sin él, con el control nuevo el botón de
borrar cae en x=376 a un viewport de 375px — **fuera de la pantalla**. El pie ya
estaba al límite con cinco controles; el sexto lo rompía.

### Hallazgos de CodeRabbit

Los dos que encontró eran reales y están arreglados:

- **La carrera al decidir el snapshot en JS** (Major, integridad de datos) — el
  arreglo está descrito arriba.
- **`{{párrafo}}` sembrado en la demo.** `extractPromptVariables` sólo acepta
  identificadores ASCII, así que esa variable no se deriva de ningún texto: el
  chip existía sólo porque se escribió a mano y desaparecía al primer guardado.
  Alineada la semilla con la gramática del parser, y añadido
  `demoSeed.test.ts`, que fija que **todo lo sembrado sea exactamente lo que el
  sistema derivaría** — variables, tags, y que ninguna versión del historial sea
  idéntica al prompt actual.

### Resto

Suite completa (5070 tests), `typecheck`, `lint`, `format:check`, veinte gates
—incluidos `auth-rls-contracts`, `user-id-writes`, `migration-duplicates`,
`cte-regression`, `client-api-contracts`, `runtime-api-routes` y
`form-control-labels`—, `build`, budget de bundle y 31 e2e con a11y, deep links
de Notas y el gate anti-oclusión.
