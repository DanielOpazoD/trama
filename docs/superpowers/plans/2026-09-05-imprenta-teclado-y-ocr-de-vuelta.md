# Imprenta: elegir hojas sin apuntar, y un OCR que vuelve

## Problema

Dos fricciones de Imprenta que quedaron abiertas tras #414, las dos del mismo
tipo: el mecanismo existía y no llegaba al usuario.

- **Elegir muchas hojas** obligaba a acertar el tick de 20 px de cada
  tarjeta. Shift para rango ya existía, pero solo sobre ese tick; ni
  ⌘/Ctrl+clic, ni teclado, aunque la tarjeta ya tenía foco y flechas para
  reordenar. Es el flujo que disparó #404: dieciséis hojas de un libro de
  seiscientas.
- **El OCR no volvía.** «Crear PDF buscable» ensamblaba, reconocía, descargaba
  un `.pdf` y un `.txt`… y dejaba el documento abierto tal como estaba. El
  resultado vivía en la carpeta de descargas; para seguir trabajando con la
  versión buscable había que importarla a mano.

## Cambios

- **`PageCard`**: ⌘/Ctrl+clic en cualquier punto de la tarjeta alterna la
  hoja; Shift+clic extiende el rango desde la última marcada; con la tarjeta
  enfocada, Espacio marca y Shift+Espacio extiende. El clic simple sigue libre
  (arrastrar, doble clic para abrir) y los controles internos no se pisan. La
  etiqueta accesible y el tooltip del tick lo dicen.
- **`usePdfStudioOcr`** acepta `commit`: al terminar, el PDF buscable
  reemplaza al documento abierto (misma configuración, un solo origen). El
  panel se queda abierto con el resultado. Las descargas siguen. `PdfStudioView` pasa `commit` en la
  misma línea que ya tenía: sigue en 364/365 del ratchet.

## Decisiones

- **Reemplazar, no añadir.** Anexar el PDF buscable al final habría duplicado
  cada hoja. El documento pasa a ser la versión con capa de texto; las
  anotaciones ya viajan fijadas dentro del PDF ensamblado, y es un commit del
  historial, así que ⌘Z lo deshace.
- **El panel no se cierra solo.** La primera versión lo cerraba al terminar y
  el test de la vista lo dijo en CI: el usuario lee «OCR completado» ahí, donde
  hizo clic. Cerrarlo le quitaba el mensaje justo cuando aparecía.
- **Las descargas se quedan.** El `.txt` es un artefacto propio (el texto
  reconocido), y quitar la descarga del `.pdf` cambiaría un hábito sin
  ganar nada.
- **Modificadores sobre la tarjeta, no clic simple.** Un clic simple que
  marcara rompería el arrastre y el doble clic. Los modificadores son la
  convención de cualquier gestor de archivos.

## Validación

- 7 tests: 4 de `PageCard` (modificadores, Espacio, el tick sigue siendo
  suyo) y 3 del hook de OCR (reemplazo con ajustes conservados, sin `commit`
  se comporta como antes, fallo deja el documento intacto).
- `typecheck`, `lint`, `format:check` y los gates del job `lint` en verde.

**Verificado por mutación**, una pieza cada vez:

- Quitar los modificadores del clic → falla el test de ⌘/Shift+clic.
- Quitar Espacio → falla el test de teclado.
- Quitar el `commit` del OCR → falla el test de reemplazo.

**No verificado en el navegador**: la demo no trae ningún PDF en Imprenta y el
panel del navegador no sube archivos, así que las dos rutas quedan probadas
solo en unidad. Es el hueco honesto de este pack.

## Pendiente

- Flechas arriba/abajo con Shift para extender la selección desde el teclado
  sin pasar por el ratón; hoy las flechas reordenan, y cambiarlas de sentido
  pide decidir primero qué gesto gana.
- Un e2e con un PDF real en Imprenta cubriría lo que la demo no puede.
