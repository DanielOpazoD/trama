# El `.docx` también sale del hilo principal

## Problema

Pendiente declarado en el PR #405: al encerrar `xlsx` en un Worker quedó dicho
por escrito que **`mammoth` seguía parseando `.docx` en el hilo principal**.

`mammoth` no tiene un aviso de seguridad abierto, así que no es la misma
urgencia. Pero el perfil de riesgo es idéntico: un formato binario complejo,
leído por una librería grande, sobre un archivo que puede venir de cualquier
parte —un adjunto reenviado, una descarga—. Y el Worker que lo aislaría ya
estaba construido: no aprovecharlo era dejar media puerta cerrada.

## Cambios

- `officeSheets*` pasa a llamarse `officeParse*`: el módulo ya no es «el worker
  de planillas», es donde se lee cualquier documento de Office del usuario.
- El contrato lleva `kind: 'xlsx' | 'docx'` y devuelve hojas o un HTML, según el
  formato. El cliente expone `readOfficeSheets` y `readOfficeDocument`.
- `BibliotecaOfficeViewer` deja de importar `mammoth`. Ni `mammoth` ni `xlsx`
  entran ya al grafo del hilo principal.
- La razón de la excepción de `xlsx` en `check:deps-advisories` apunta al
  archivo nuevo.

## Decisiones

- **Un solo Worker para los dos formatos, no dos.** Comparten cliente,
  temporizador, política de no-fallback y el mismo motivo para existir.
  Duplicar todo eso para cambiar la librería que se importa habría sido copiar
  la parte difícil.
- **Se mantiene la negativa a caer al hilo principal.** Vale igual para `.docx`:
  si no hay Worker, el archivo no se previsualiza y se dice. El fallback
  devolvería en silencio el riesgo que el módulo existe para quitar.
- **Una respuesta del formato equivocado se rechaza** en vez de devolverse. Si
  el contrato se desincroniza, mezclar el HTML de una planilla con el de un
  documento sería peor que un error claro.
- **`mammoth` NO necesita el DOM: comprobado, no supuesto.** El paquete trae un
  bundle `mammoth.browser.js` con 20 usos de `document.`, y en `lib/` hay
  archivos que también lo mencionan — pero ahí «document» es el nombre de su
  propio AST, no el global. Como el grep no distinguía, se midió: el Worker
  devuelve el HTML correcto sin DOM.

## Validación

- Suite completa: **5396 tests** en verde (9 en el cliente del Worker, dos
  nuevos para `.docx`).
- `typecheck`, `lint`, `format:check`, `build`, `check-bundle-size` y 18 gates
  `check:*` en verde.

**Verificado en el navegador** con un `.docx` real generado para la prueba:

- El Worker devuelve `<h1>El taller de la memoria</h1><p>Parrafo de prueba para
el worker.</p>` — HTML semántico correcto, sin DOM.
- `Object.prototype` del hilo principal: 12 propiedades antes y 12 después.
- `window.mammoth` sigue `undefined`.
- En el bundle, `vendor-mammoth` y `vendor-xlsx` los referencia **un solo
  chunk**: el del Worker.

## Pendiente

- La previsualización completa (descarga → Worker → sanitizado → render) sigue
  sin poder ejercitarse desde el preview: el `demoRouter` no sirve un `.docx` ni
  un `.xlsx` reales. El Worker sí se verificó con bytes reales.
