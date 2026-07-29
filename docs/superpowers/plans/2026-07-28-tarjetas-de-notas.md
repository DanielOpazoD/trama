# Las notas se leen mejor: recorte, fundido, fotos y densidad

## Problema

Cuatro cosas, las cuatro medidas antes de tocar nada.

**1. El recorte partía renglones por la mitad.** El colapso de una nota larga
era `max-height: 320px` con renglones de 26px: caben **12,31 líneas**, así que
la número trece aparecía cortada —8px de una de 26—, una banda de medias letras
bajo el texto.

**2. El fundido pintaba un color que la tarjeta no tiene.** El degradado
superpuesto terminaba en `paper-100` sólido, pero el fondo ahí es
`card-paper-soft`, un degradado que a esa altura ya va por `paper-50/0.42` y que
además cambia con el tema. Resultado: un rectángulo gris pegado bajo el texto,
sutil en día y **muy visible en noche y vela**.

**3. Las fotos se recortaban.** El marco era `aspect-[16/9]` + `object-cover`
para todo. Es correcto para la imagen de un enlace —el sitio la publica en 16:9
en su Open Graph, así que encajarla ahí la muestra entera— y destructivo para
una foto propia: una vertical de móvil (3:4) pierde más de la mitad del alto, y
lo que se recorta es la franja central, justo donde suele estar lo fotografiado.

**4. La tarjeta no tenía diseño de escritorio.** Medía **278px de alto igual a
375px que a 1280px**, con cada pieza en la misma coordenada. No es que fuera
aireada: `RecorteCard.tsx`, `NoteCard.tsx` y `NotasFeedView.tsx` no tienen **un
solo breakpoint** —ni `sm:`, ni `md:`, ni `lg:`—, mientras sus vecinas del mismo
mundo (Inicio, Tareas, el calendario) sí. Consecuencias medidas: la miniatura se
quedaba en 258px dentro de una fila de 930, el texto caía debajo, y
`justify-between` mandaba la etiqueta de tipo **a 617px de la imagen que
describe**.

## Cambios

- **`.text-clamp` / `.text-clamp-fade`** — recorte por renglones con `1lh`
  (múltiplo entero, nunca parte una línea) y desvanecido por **máscara**.
- **`RecorteCardBody`** — el mismo botón de texto que la nota, en el flujo, en
  lugar del disco flotante con borde, sombra y `backdrop-blur`.
- **`LinkMediaPreview`** — `encuadre: 'enlace' | 'foto'` y `cajaDeFoto`.
- **`RecorteCard`** — miniatura al lado del texto desde `md`, etiqueta pegada al
  título.

## Decisiones

**Máscara y no degradado superpuesto.** Un overlay tiene que acertar el color
del fondo, y aquí el fondo cambia con la altura y con el tema — por eso fallaba.
Una máscara no tiene nada que acertar: desvanece el texto y deja ver lo que haya
debajo. Es la misma técnica y el mismo motivo que en el carril del PR #365.

**La caja de la foto se calcula.** Dejarlo al dimensionado implícito del
navegador tenía dos trampas encadenadas, ambas vistas en pantalla durante el
trabajo:

1. `w-fit` en el marco con un tope en porcentaje en la imagen se definen el uno
   al otro; el navegador resuelve el ciclo en **cero** y la miniatura desaparece
   entera.
2. Una `<img>` sin cargar mide cero, y `loading="lazy"` **no carga lo que mide
   cero**: la imagen se quedaba esperándose a sí misma para siempre.

Con dos números —proporción real encogida hasta el tope, nunca ampliada— no hay
ciclo que resolver. Antes de cargar se reserva una caja neutra; reservar la
exacta pediría guardar las dimensiones en la base, desmedido para lo que se gana.

**El mismo control de expandir en los dos sitios.** La nota usaba un botón de
texto en su pie y la captura un disco flotante sobre el degradado: dos
tratamientos para lo mismo dentro del mismo hilo, y el más pesado plantando
cromo justo donde el ojo termina de leer.

**Móvil no se toca.** Ahí el apilado es correcto y está medido; el cambio entra
desde `md`.

## Resultados medidos

|                               | antes                     | después               |
| ----------------------------- | ------------------------- | --------------------- |
| renglones visibles            | 12,31 (el último partido) | entero                |
| color sólido bajo el texto    | `rgb(250,250,250)`        | ninguno (máscara)     |
| proporción de una foto        | forzada a 16:9            | la suya               |
| alto de la tarjeta de captura | 278px                     | **214px** (−23%)      |
| etiqueta ↔ miniatura          | 617px                     | **104px**             |
| alto a 375 vs 1280            | 278 / 278                 | adapta: texto al lado |

## Validación

Cada invariante verificado **en rojo** por mutación:

| mutación                        | qué falla                    |
| ------------------------------- | ---------------------------- |
| volver al recorte en píxeles    | «cae en frontera de renglón» |
| volver al degradado superpuesto | «no pinta color sólido»      |
| quitar el diseño de escritorio  | «el texto va al lado»        |
| la etiqueta al extremo opuesto  | «junto a lo que etiqueta»    |

Y el cálculo de la caja, en unitarios: proporción horizontal y vertical, encoger
por el lado que se pasa, no ampliar nunca, y no devolver cero sin dimensiones —
que es lo que provocaba el bloqueo mutuo.

### Un falso positivo propio, corregido

La primera versión del test de adaptación comparaba el **alto** de la tarjeta
entre móvil y escritorio. Pasaba… y seguía pasando tras quitar el diseño de
escritorio entero: el alto también baja al ensanchar por el simple reflujo del
texto, y en la demo la foto no carga a 375px, lo que ensanchaba la diferencia
por un motivo ajeno. Reescrito para medir lo que de verdad se afirma: **la
posición del texto respecto de la miniatura**. Detectado mutando, no leyendo.

### Hallazgos de CodeRabbit

Los dos que encontró eran reales y **los dos los introduje yo**:

- **Crítico: el plegado se rompía tras expandir.** Cambié la detección a
  `scrollHeight > clientHeight` y añadí `expanded` a las dependencias. Una vez
  abierto, el elemento ya no recorta, la comparación da `false`, `overflowing`
  se apaga y con él desaparece el botón de «Mostrar menos»: la nota se quedaba
  abierta sin forma de volver. Ahora sólo se mide en plegado, y hay un e2e del
  viaje de ida **y vuelta** — mis pruebas sólo miraban el estado plegado, que
  es exactamente por lo que se me escapó.
- **El GIF 1×1 contaba como imagen.** Mientras resuelve el blob autenticado se
  muestra un transparente de 1×1 que también dispara `load`: la caja se habría
  fijado en 1×1 y el esqueleto se habría apagado antes de tiempo.

### Un segundo falso positivo, en el test del arreglo

La prueba del guard de carga afirmaba sobre el esqueleto, pero
`showSkeleton = imageLoading || !imageLoaded`: con `imageLoading` activo el
esqueleto se pinta igual, así que la aserción no podía distinguir si el guard
servía. Reescrita para mirar la **caja**, que es lo que el guard decide.

### Verificado como ajeno

En la demo, a 375px, las imágenes no terminan de cargar. Comprobado contra
`main` con los cambios guardados aparte: **falla igual sin ellos**. Es previo y
queda fuera de este PR.

### Resto

Suite completa (5084 tests + los nuevos), `typecheck`, `lint`, `format:check`, trece gates,
`build`, budget de bundle y 31 e2e con a11y, el gate anti-oclusión, la captura
de Notas y el carril.
