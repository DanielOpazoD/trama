# La barra deja de esconderse, y aparece cómo llegar a la hoja 480

## Problema

Pendiente declarado en #404. La barra del documento vive **dentro** del área
scrolleable, junto a la grilla, así que al bajar por un libro largo se iba de la
vista: para exportar había que volver arriba del todo. Con 600 hojas la grilla
mide ~16.000px, o sea catorce pantallas de vuelta.

Y una vez restaurado el scroll (#404), seguía sin haber forma de llegar a una
hoja concreta que no fuera arrastrar la barra de scroll a ojo.

## Cambios

- **La barra pasa a `sticky top-0`** con fondo opaco y `backdrop-blur`, porque
  ahora tiene contenido pasando por debajo. El título del documento sigue
  desplazándose: lo que se queda son las acciones.
- **El contador de hojas se convierte en salto** a partir de 60 hojas (dos
  pantallas de grilla). Por debajo de ese umbral sigue siendo el rótulo que era:
  llegar a cualquier hoja es un scroll corto y un control más sería ruido.
- **`PageCard` gana `data-page-index`**, para que el salto encuentre la hoja por
  identidad y no por «la enésima tarjeta de la lista».

## Decisiones

- **Sólo la barra es pegajosa, no todos los controles del documento.** Fijar
  también el título, el estado de autoguardado y los banners dejaría media
  pantalla de cromo permanente. Lo que se necesita arriba son las acciones.
- **El umbral hace crecer la interfaz con el trabajo**, que es la regla que esta
  barra ya seguía: con el documento vacío se reduce a «Importar», y con un libro
  largo el contador se vuelve útil en vez de decorativo.
- **Un número fuera de rango se acota en vez de ignorarse.** Escribir 999 en un
  libro de 90 es un dedazo; llevar al final es más útil que no hacer nada y
  dejar al usuario adivinando por qué no pasó nada.
- **`scrollIntoView({ block: 'center' })` se queda aunque sea indistinguible en
  Chromium.** Medido en el navegador: `focus()` por sí solo deja el MISMO
  `scrollTop` (12195) y desviación 0 del centro. Pero la alineación que elige un
  navegador al enfocar no está especificada y otros alinean al borde más
  cercano, así que la llamada explícita fija el resultado. El comentario en el
  código dice exactamente esto, en vez de atribuirse un efecto que no se puede
  demostrar acá.

## Hallazgo de revisión (Greptile, corregido)

`input[type=number]` acepta notación científica, y `parseInt('1e2', 10)` devuelve
**1**: pedir la hoja 100 habría llevado a la 1 sin decir nada. Pasa a `Number` +
`Math.round`, que además hace que un `11,6` vaya a la hoja 12 en vez de no hacer
nada — la misma regla que ya aplicaba a los números fuera de rango.

## Validación

- Suite completa: **5392 tests** en verde (791 archivos).
- `typecheck`, `lint`, `format:check`, `build`, `check-bundle-size` y 12 gates
  `check:*` en verde.
- e2e `imprenta-muchas-hojas`: 3 pruebas, todas pasando.

**Verificado por mutación:**

- Quitar `sticky` → el e2e falla: la barra deja de estar en el viewport al 80%
  del scroll.
- Anular el salto entero → el e2e falla: la hoja 72 no llega a la vista.
- Quitar sólo `scrollIntoView` → **el e2e NO falla**, y eso está dicho arriba y
  en el propio test. No se deja pasar como si estuviera cubierto.

**Verificado en el navegador** con 600 hojas: la barra queda fija con Importar,
deshacer, el salto, Ajustes y Guardar PDF alcanzables en la hoja ~490; y saltar
a la 480 aterriza con la tarjeta centrada y enfocada.

## Pendiente

- El salto es un campo numérico. Un carril de posición vertical —un minimapa que
  muestre dónde estás dentro de las 600— sería mejor affordance, pero es otra
  decisión de diseño y otro PR.
