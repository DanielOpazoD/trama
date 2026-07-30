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

**Un chip «Todo»** suelta los cuatro filtros de un golpe: con tema + autor + año

- búsqueda puestos, volver al estado limpio era cuatro gestos.

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

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB**, `build`, budget de
bundle y la suite completa.

## Fuera de alcance

Momentos móvil (~300px de controles antes de la primera foto), SecretCard (5
controles por tarjeta ×20 claves), el «Ordenar» duplicado por semana en Tareas,
y el icono de importación incondicional en Citas.
