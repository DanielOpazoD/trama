# Imprenta en un navegador de verdad: elegir hojas y volver desde Biblioteca

## Problema

Los packs #425 (modificadores y teclado sobre las tarjetas) y #426 (servir los
PDF guardados) entraron con tests de unidad y una nota honesta: «no verificado
en el navegador». La razón era del panel del navegador de la sesión, que no
sube archivos, no del repo: Playwright sí sube, y el repo ya tenía e2e de
Imprenta que generan PDF con pdf-lib y los meten por el `<input type=file>`.

Lo que un test de unidad no puede decir de esos dos cambios:

- que un clic real con Shift sobre una tarjeta **arrastrable** marque el rango
  y no arranque un drag;
- que el foco llegue a la tarjeta por teclado y Espacio la marque;
- que el archivo que baja «Guardar 3 hojas» tenga **tres páginas**, que es el
  caso que disparó #404;
- que un PDF guardado de Imprenta, servido por el endpoint nuevo, vuelva a
  Imprenta desde Biblioteca.

## Cambios

- **`e2e/imprenta-seleccion.spec.ts`**, cuatro tests: Shift+clic y ⌘/Ctrl+clic
  sobre la tarjeta; Espacio y Shift+Espacio con la tarjeta enfocada; la
  descarga de «Guardar N hojas» contada con pdf-lib; y, en modo prueba, el PDF
  guardado de la demo enviado a Imprenta desde Biblioteca.
- **`BulkBar`**: el tooltip del botón decía «Abrir el visor para guardar o
  imprimir»; el botón descarga directo desde hace tiempo. Lo descubrió el
  test al esperar un diálogo que nunca llega.

## Decisiones

- **Se cuenta el PDF descargado, no lo que dice la interfaz.** «3 marcadas» en
  la barra y tres páginas en el archivo son afirmaciones distintas; la
  segunda es la que le importa a quien exporta.
- **OCR queda fuera del e2e.** tesseract.js baja el idioma de un CDN en
  tiempo de ejecución: un e2e dependería de la red y tardaría decenas de
  segundos. El reemplazo del documento sigue cubierto por el test del hook.
- **La verificación por mutación se hace con dev server fresco.** La primera
  pasada de la mutación M1 dio verde: Playwright reutilizó un servidor con la
  transformación vieja en caché. Repetida sin servidor previo, falla como
  debe («1 marcada» en vez de «4»).

## Validación

- 4 e2e en verde en local (29 s).
- **Por mutación**: quitar los modificadores de `PageCard` → falla el test de
  Shift/⌘; quitar la entrada de `pdf-studio-saved-pdfs` de `SERVE_ENDPOINT`
  → falla el de Biblioteca.
- `lint`, `format:check`, `typecheck` y los gates del job `lint` en verde.

## Pendiente

- El e2e corre solo en Chromium de escritorio, como el resto de la suite.
- Sigue sin e2e de OCR; si algún día se empaqueta el idioma con la app, entra.
