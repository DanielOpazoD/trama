# Tareas: un solo control de orden, no uno por semana

## Problema

`sortMode` es **un** estado de la vista (`useState<SortMode>('created')`), pero
su menú se renderizaba dentro de `renderWeek`, es decir **una vez por cuadro
semanal** — cuatro o cinco por mes.

No era sólo ruido visual. El control se leía junto a una semana concreta, con la
etiqueta «Ordenar — Fecha de ingreso» pegada a su cabecera, y cambiarlo
reordenaba **todas las demás semanas** en silencio. El usuario pide una cosa
—«ordena esta semana por prioridad»— y obtiene otra.

## Lo que cambió

El menú sube a la cabecera de la vista, donde vive una vez y significa lo que
dice: el orden de toda la hoja mensual. La etiqueta sigue anunciando el criterio
activo (`Ordenar — Prioridad`), que ahí sí describe el estado real.

**Lo que NO se movió, a propósito:** el botón «Fotos de la semana» también se
repite por cuadro, pero ése sí es estado por semana (`photosOpen` es un `Set`
indexado por semana). Repetirlo es correcto; moverlo sería el error simétrico.

## Lo que encontró la autorrevisión

CodeRabbit no revisó este PR —su check pasó con «Review rate limited», que es un
verde sin revisión—, así que el diff se releyó a mano. Y salió algo:

**El disparador quedaba como icono suelto en el slot `action` del `ViewHeader`,
y ahí la convención del repo es texto.** Citas usa `icono + «Imprenta» + ⌄`;
Claves usa «Añadir» y «bloquear vault»; Twitter usa «Sincronizar». Un icono a
secas habría sido el único `action` de cabecera solo-icono de la app — y
precisamente en la vista donde el criterio de orden vale para TODA la hoja
mensual, de modo que obligaba a abrir el menú para saber cómo estaba ordenado.

Ahora el disparador muestra `⇅ Fecha de ingreso ⌄`: dice qué hace y en qué
estado está, sin hover ni clic. 194px de ancho, cabe en 375px sin desborde.

## Validación

En el navegador (demo): **4 hojas semanales, 1 control de orden**, situado en
`y=83` —por encima de la primera hoja, en `y=344`— y fuera de todo `<article>`.
Al elegir «Prioridad» la etiqueta pasa a `Ordenar — Prioridad` y el orden cambia
en las hojas con más de un pendiente.

Los tests que ya existían pasaban **igual con el menú duplicado**: ninguno
miraba el orden. Ese verde no decía nada sobre este cambio, así que se
escribieron los cuatro que faltaban — tres sobre dónde vive el control y cómo
se comporta, y un cuarto, salido de la autorrevisión, sobre que su estado se
lee sin abrirlo.

| mutación                                          | qué falla                                             |
| ------------------------------------------------- | ----------------------------------------------------- |
| el menú vuelve a repetirse en cada cuadro semanal | «aparece una sola vez» + «anuncia el criterio activo» |
| el menú deja de anunciar el criterio activo       | los tres tests que leen su etiqueta                   |
| el disparador vuelve a ser un icono suelto        | «el criterio activo se lee sin abrir el menú»         |

`typecheck`, `lint`, `format:check`, **los 33 gates no-DB** y la suite completa.

## Fuera de alcance

- **SecretCard**: 5 controles siempre visibles por tarjeta (100 con 20 claves).
- **`CopyImportPromptButton`** en Citas: icono incondicional cuyo significado
  necesita una oración entera de tooltip.
- **La barra del documento PDF no tiene cobertura visual.** El guardián de #370
  protege `EditorToolbar`; `PdfStudioDocumentToolbar` —la que #369 rediseñó— no
  entra en su lista de paths.
