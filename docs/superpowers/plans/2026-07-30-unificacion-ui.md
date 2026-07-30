# Unificación: la misma cosa, con la misma forma en todas partes

## Cómo se eligió el alcance

Un barrido de siete lectores en paralelo inventarió la deuda visual del
frontend en siete dimensiones (controles siempre visibles, duplicación de
patrones, inconsistencia de acciones, copy, huecos responsive, iconos,
densidad). Cada hallazgo se **verificó contra el código** antes de aceptarlo —
el barrido visual de hace unos PRs entregó 12/12 falsos positivos, así que aquí
ninguno entró sin releer el fichero.

Dos hallazgos «altos» se descartaron por falsa alarma, y vale dejarlo escrito:

- **«Borrar sin confirmación en citas/tareas/prompts»** — los tres tienen toast
  de Deshacer; el borrado a un clic con undo es el patrón deliberado del repo,
  no un descuido. Lo que sí estaba roto era que PromptCard ofreciera ese borrado
  como icono suelto siempre visible (ver abajo).
- **«DensityToggle duplicado»** — es un componente compartido y documentado
  («discreto a propósito»). No es deuda.

## Lo que cambió

**1. Un solo menú ⋯ en toda la app.** Convivían tres implementaciones: el
`OverflowMenu` compartido, `QuoteActionsMenu` (copia casi literal — mismo hook,
mismo portal, misma fila) y un menú artesanal en `MomentoEntry` que **no se
cerraba ni con Escape ni con clic afuera**: en teclado o táctil quedaba abierto
hasta pulsar el propio botón otra vez. Ambos duplicados pasaron a `OverflowMenu`;
`QuoteActionsMenu` se eliminó. El bug del cierre queda fijado con test.

**2. PromptCard se alinea a la convención de las otras seis tarjetas.** Era la
única con seis controles siempre visibles en la cara (y los anexos desplegados
debajo, en cada tarjeta). Ahora: **Copiar** visible con nombre —es a lo que se
viene a una biblioteca de prompts—, favorito/editar al hover, y el resto
(duplicar, historial, anexos, borrar) tras el ⋯. El borrado pide confirmación
dentro del menú, como NoteCard y RecorteCard: antes era un icono de basura a un
clic.

**3. FavoritoCard recibe el diseño de escritorio que #367 le debía.** Es la
tarjeta hermana de RecorteCard en el mismo feed: miniatura OG a ancho completo
(~930×524px para dos líneas de texto), cero breakpoints, y el botón de eliminar
sólo-hover (invisible en táctil). Ahora: miniatura `mediana` al lado del texto
desde `md`, y el eliminar con el guard `sm:` que biblioteca ya usa.

**4. `MetricTile` compartido.** El gesto número+etiqueta estaba implementado
cuatro veces con cuatro tamaños de número (text-lg/xl/2xl/3xl, aliases legacy),
dos alineaciones y tres colores de etiqueta; `PromptMetric` y `VaultMetric` eran
clones línea a línea. Una pieza, en la escala semántica (`text-h2`), con
`tone="danger"` que sólo alarma cuando el valor es mayor que cero. Sustituye a
PromptMetric, VaultMetric y el strip inline de LogsExtractionList. `CountTile`
(panel de salud) queda: es un dashboard con su propio diseño centrado y
`text-3xl` está permitido.

**5. `FilterChip` en los tres clones del mundo Notas.** El chip de filtro con
conteo estaba reimplementado inline en el feed (tags), Claves (tipos) y Prompts
(colecciones), y los tres ya se habían desincronizado en hover, transición y
fondo activo. Ahora usan el `FilterChip` compartido del mundo trama; la
identidad de mundo la lleva el acento (`activeStyle`), no la forma del chip.

**6. `BibliotecaEmptyState` → `EmptyMessage`.** Clon con la misma tipografía
exacta y envoltorio propio; EmptyMessage ya lo usan 20 ficheros. De paso,
«aparecerán acá» → «aparecerán aquí» (regionalismo).

**7. El alta de Claves detrás de «Añadir».** Nueve controles siempre expandidos
encima de la lista, cuando crear una clave es la acción menos frecuente de la
vista; Entidades, Citas y Relaciones ya esconden el alta tras el toggle. El
vault vacío invita con «Añadir la primera».

**8. Detalles de significado.**

- `TaskItem` usaba `FileIcon` (=archivo adjunto en los otros 4 usos) para «Ver
  detalle»; ahora `InfoIcon`, que ya significa «información» en Biblioteca. Se
  descartó `TextIcon` a propósito: es la «T» de añadir texto del editor y
  reutilizarla crearía otro glifo con doble significado — el mismo error que se
  estaba arreglando.
- Voseo fuera de cuatro textos visibles («Elegí» ×3, «podés» ×1): tuteo neutro.
- `RecorteCardMenu` mezclaba cinco ítems en minúscula con cuatro capitalizados
  en el mismo menú; capitalizados como el resto de menús de la app.
- La Vitrola revelaba «añadir a la trama» sólo con hover, sin guard `sm:`:
  invisible e indescubrible en táctil. Ahora visible en táctil, discreto con
  puntero.

## Validación

Mutaciones sobre el fallo real, no sobre lo que el test mira:

| mutación                                                | qué falla                            |
| ------------------------------------------------------- | ------------------------------------ |
| el menú de Momentos vuelve a ser artesanal (sin Escape) | «se cierra con Escape y clic afuera» |
| borrar prompt a un clic, sin confirmación               | «borrar exige confirmación»          |
| el alta de Claves vuelve a estar siempre expandida      | 3 tests del flujo de alta            |

Tests reescritos al contrato nuevo donde fijaban el diseño anterior
(PromptCard.test, ClavesView.test, el e2e de historial que ahora abre el ⋯).
En el navegador: el menú de Prompts lista Editar/Favorito/Duplicar/Historial/
Anexos/Borrar y cierra con Escape; Claves muestra `Añadir · bloquear vault` sin
formulario; los chips y tiles comparten forma en las tres vistas.

`typecheck`, `lint`, `format:check`, los 33 gates no-DB, `build`, budget de
bundle y 33 e2e (a11y, oclusión, capturas, momentos, citas, historial de
prompts). La suite completa se corrió cuatro veces en local con la máquina
compartida con otra sesión de validación: cada pasada falló en ficheros
DISTINTOS, todos por `Test timed out in 5000ms` (una pasada registró un fichero
tardando 609s), y cada área salió verde al reejecutarla en aislamiento —
recortes 64, notas 669, momentos 183, quotes 39, biblioteca 89, planillas 146.
Es la firma del flaky por carga documentada del repo; el `unit` de CI, en
runner limpio, es el árbitro. Un fallo que SÍ era real salió de esas pasadas:
un test buscaba «→ momento» en minúscula tras la capitalización del menú —
corregido, no silenciado.

**Una regresión propia, cazada por el e2e de CI y corregida:** al mandar los
anexos de PromptCard al menú ⋯, un prompt CON archivo adjunto dejaba de
mostrarlo — `notas-attachments` falló en `e2e` y tenía razón. Esconder un
control poco frecuente es compactar; esconder un archivo que el usuario adjuntó
es perderlo de vista. La decisión la toma ahora el panel, que ya conoce el
conteo (`soloSiHay`): con anexos se muestra siempre, sin anexos no gasta una
fila y el control vive en el ⋯. Dos mutaciones, una por cada mitad de la regla,
y cada una tumba sólo su test.

Nota de proceso: `check:hard-delete-allowlist` lee los ficheros de
`git ls-files`, así que un borrado sin stagear lo hace fallar con ENOENT — se
resuelve al stagear, no es un fallo del gate.

## Fuera de alcance (siguientes packs)

- **TwitterView**: 4 filas de filtros siempre expandidas, la zona de chrome más
  cargada del repo. Refactor grande; merece PR propio.
- **Momentos móvil**: ~300px de controles antes de la primera foto.
- **SecretCard**: 5 controles siempre visibles por tarjeta (100 con 20 claves).
- **Ordenar duplicado por semana** en Tareas (controla estado global).
- **CopyImportPromptButton** en Citas: icono incondicional cuyo significado
  necesita una oración entera.
