# Twitter: cuatro filas de filtros pasan a una

## Problema

El barrido del pack anterior dejó esta vista señalada como **la zona de chrome
más cargada del repo**, y contradiciendo el patrón que la propia `NotasFeedView`
documenta en un comentario («todo lo demás es on-demand: el buscador se expande
desde el ícono de lupa…»).

Con datos reales y X conectado había **cuatro filas de filtros siempre
expandidas** —buscador+Autores, tema, año, mes— más la tarjeta de crónica: ≥10
controles fijos antes del primer tweet, más un chip por cada tema y por cada
año. A eso se sumaban tres controles que estaban de más:

- **«Clasificar temas»** fijo pero deshabilitado en el estado estable más común
  (todo ya clasificado) — un control muerto, permanentemente visible.
- **«Regenerar» y «Eliminar crónica»** fuera del bloque plegable: dos acciones
  operando sobre un texto que no se ve.
- **«Sincronizar»** en la cabecera y **«Sincronizar ahora»** en el estado vacío:
  la misma acción, dos veces en la misma pantalla.

## Lo que cambió

**Una sola fila.** Los temas —el filtro que se usa siempre— se quedan a la
vista; autor, fecha y buscador se expanden desde su icono, con el estado activo
marcado en el propio icono (fondo lavado) para que un filtro puesto nunca quede
invisible. Los chips pasan al `FilterChip` compartido, así que la forma es la
misma que en el resto de la app y la identidad de la vista la lleva el acento.

**Un chip «Todo»** suelta los cuatro filtros de un golpe: con tema, autor, año y
búsqueda puestos, volver al estado limpio era cuatro gestos.

**Los tres controles de más.** «Clasificar temas» sólo aparece cuando hay algo
que clasificar. «Regenerar» y «Eliminar» viven dentro de la crónica abierta
(sin crónica, «Generar» es la única acción y se queda). El «Sincronizar» de la
cabecera desaparece cuando el estado vacío ya ofrece el suyo — pero se mantiene
mientras carga, para que la cabecera no parpadee.

**El rail de chips en móvil.** A 375px los temas envolvían en tres líneas; el
`scroll-rail` del PR #365 los deja en una que se desliza, con la misma máscara
de degradado que las pestañas del mundo Notas. En escritorio el rail se apaga
(`md:[mask-image:none] md:overflow-visible`) y los chips vuelven a envolver.

**`XCronicaCard` extraído.** El fichero pasó su ratchet estructural (655/575) y
la regla del repo es extraer, no subir el umbral — que aquí acierta: un ensayo
generado y una lista filtrable son dos cosas. Queda en 573/575 **sin tocar el
umbral**.

## Decisión aparte: sembrar los bookmarks del demo

El modo demo devolvía `connected: false` para X «inerte en demo (necesita app de
X + red real)». Cierto para _sincronizar_, pero no para _mostrar_: con esa
decisión la sección entera era invisible en demo y **no había forma de revisar
este cambio** — ni yo, ni quien revise el PR. Ahora se siembran seis bookmarks
variados a propósito en autor, tema y año (las tres facetas que la vista ofrece
como filtro; con una sola combinación no habría nada que filtrar). Sincronizar y
clasificar siguen inertes.

## Validación

Medido en el navegador, modo demo:

|                                        | antes           | después                                  |
| -------------------------------------- | --------------- | ---------------------------------------- |
| chrome antes del primer tweet (1280px) | —               | **−131px** con los tres paneles plegados |
| alto de la fila de filtros (375px)     | 90px (3 líneas) | **44px** (una, deslizable)               |
| máscara del rail en escritorio         | —               | `none` (correcto), `overflow: visible`   |
| desborde horizontal a 375px            | —               | ninguno                                  |

Mutaciones, cada una sobre el fallo real:

| mutación                                 | qué falla                              |
| ---------------------------------------- | -------------------------------------- |
| los tres paneles vuelven a abrirse solos | 2 tests de chrome on-demand            |
| vuelve el «Sincronizar» duplicado        | «con cero bookmarks sólo hay un botón» |
| «Todo» deja de limpiar el autor          | 2 tests                                |
| «Todo» deja de limpiar la búsqueda       | «suelta los cuatro filtros»            |

Nota honesta: la primera versión de la mutación de «Todo» **no** hacía fallar
nada — el test recorría el chip sin haber puesto los cuatro filtros a la vez.
Eso reveló que el control más nuevo estaba sin cubrir en su parte valiosa, no
que la sonda fuera mala. El test se reforzó hasta que la mutación muerde.

**Dos voseos que el barrido de #371 no cazó.** Aquel pack corrigió cuatro
textos visibles; al rebasar esta rama sobre él aparecieron dos más, y ambos son
copy que el usuario lee:

- `TwitterView.tsx` — el `confirm()` de borrar la crónica («Podés generar otra
  cuando quieras»). Cae dentro de esta vista.
- `settings/WhatsAppPanel.tsx` — «Podés desvincular cuando quieras». Es una
  palabra de la misma convención; se arregla aquí en vez de dejarla viva.

Quedan tres «querés» en **comentarios de código** (MusicPaletteCard, Sidebar,
QuoteEchoesPanel): no los ve nadie desde la app y no se tocan en este pack.

## Rebase sobre el main de #369/#370/#371

La rama salió de `1108fe58`, tres merges atrás. Al traer main hubo un conflicto
en `TwitterView.tsx`: #371 corrigió el voseo del tooltip de «Eliminar crónica»
justo en el bloque que este pack **extrae** a `XCronicaCard`. Se resolvió
quedándose con la extracción tras comprobar que el arreglo de #371 sobrevive en
el fichero nuevo —lo único que ese PR tocó aquí fue esa línea, y el componente
extraído ya la lleva en tuteo—.

## Validación

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle, **la suite completa (5098 tests, exit 0)** y 18 e2e (a11y, oclusión,
anexos) — todo sobre el main que ya lleva los tres PRs mergeados.

## Hallazgos de CodeRabbit, aplicados

Los cuatro eran válidos y se verificaron contra el código antes de tocar nada:

1. **El icono de autor no estaba condicionado a que haya autores.** El panel se
   renderiza con `authors.length > 0`, así que sin autores el botón alternaba
   estado y no abría nada — el mismo control muerto que este pack quita en
   «Clasificar temas», y `authors` sí puede quedar vacío: sólo cuenta bookmarks
   con `authorUsername`. Ahora lleva la misma guarda que el de fecha.

2. **El test contaba los botones de sincronizar por `textContent`.** Un
   duplicado solo-icono (con `aria-label` y sin texto) se le escapaba. Se
   comprobó de verdad: con un duplicado inyectado, **la sonda vieja pasaba en
   verde**; la nueva, por nombre accesible, lo caza.

3. **El borrado de bookmarks del demo no afectaba a la lista.** La ruta
   devolvía `{ ok: true }` pero la lectura siempre servía la semilla, así que
   el bookmark volvía en el siguiente refetch. Los bookmarks pasan al store
   como cualquier otra tabla del demo, con borrado suave. `normalizeStore` cae
   a la semilla —no a `[]`— para que un demo ya guardado en localStorage no se
   quede sin la sección entera.

4. **Una frase del plan partida en un bullet accidental** por el formateador.

Dos mutaciones nuevas, una por arreglo funcional: el borrado del demo vuelve a
ser un no-op → cae el test de borrado; se inyecta un «Sincronizar» solo-icono →
cae el test del duplicado.

**`XFilterPanels` extraído.** Aplicar el punto 1 dejó el fichero en 579/575 del
ratchet estructural. Extraer, no subir: los tres paneles a demanda —buscador,
autores, fechas— son la parte ocasional de la vista y salen juntos. Queda en
**519/575**. De paso unifica el Escape del buscador: limpia y repliega.

## Fuera de alcance

Momentos móvil (~300px de controles antes de la primera foto), SecretCard (5
controles por tarjeta ×20 claves), el «Ordenar» duplicado por semana en Tareas,
y el icono de importación incondicional en Citas.
