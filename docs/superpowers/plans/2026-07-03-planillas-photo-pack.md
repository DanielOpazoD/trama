# Planillas Photo Pack — foto → planilla (OCR), fecha automática y microinteracciones

## Problema

La detección con nombres reales (Intelligence Pack) sólo funcionaba en PDFs
vectoriales, pero los formularios clínicos reales son ESCANEOS (el propio
MEDIF de demo no tiene capa de texto). Además, la fecha del día se escribía
a mano en cada copia, y al editor le faltaba el acabado de movimiento que
separa "correcto" de "pulido".

## Piezas

### 1. OCR conectado al etiquetado (escaneos y fotos)

- `ocr/pdfOcrTextItems.ts`: tesseract (import dinámico, worker propio — la UI
  no se bloquea) sobre un canvas → PALABRAS con caja convertidas al mismo
  `PageTextItemRatio` de la capa vectorial. Palabras, no líneas: el etiquetado
  une contiguas y "Nombre:" / "Fecha:" en el mismo renglón impreso no se
  mezclan. Confianza mínima 55.
- `render/pdfRender.renderPageCanvasForOcr`: render dedicado a ~2200 px — el
  bitmap del editor (1536) se queda corto para el texto chico de formularios;
  con el render alto el escaneo MEDIF pasó de basura a nombres reales.
- Flujo en Sugerir: capa de texto del PDF → si no hay, OCR (status «Leyendo
  el texto de la página (OCR)…») → etiquetado. Sin OCR disponible degrada a
  nombres genéricos.
- Afinado del etiquetado (clave para escaneos): los items se comparan contra
  la LÍNEA del subrayado (centro vertical ± una altura de texto), no contra
  la caja completa — comparar contra la caja mezclaba renglones vecinos y
  producía nombres revueltos. Topes de 5 palabras / 48 caracteres (más que
  eso es un párrafo con un blanco: mejor genérico) y la etiqueta exige una
  palabra real de 3+ letras (anti-basura de OCR).

### 2. Fecha de hoy automática

- `PdfFormFieldDraft.autoFill?: 'today'` + «Fecha de hoy automática» en el
  inspector (sólo casilleros de fecha, con explicación). Al abrir la
  plantilla para rellenar, los marcados y vacíos llegan con la fecha local
  (`applyTemplateAutoFill`, puro).
- El etiquetado lo activa solo para etiquetas «Fecha» simples (de
  hoy/emisión/atención/consulta) — nunca nacimiento ni vencimiento.
- Extraído `formFieldInspectorModel` (constantes pt + tipo del patch) para
  respetar el ratchet del inspector (269/270).

### 3. Microinteracciones

- Keyframes propios en `index.css` (90–160 ms, `prefers-reduced-motion`
  los apaga): el inspector y los diálogos del módulo (atajos, versiones,
  firma) entran con fade+slide; las guías magnéticas hacen fade-in; el
  anillo de selección de casilleros y el card activo del panel de relleno
  transicionan suave.

## Validación

- Focales: OCR→items (2), etiquetado (5, incl. renglón correcto y fecha
  automática inferida), autoFill (2). Suite completa 4958 pass; typecheck;
  build; batería completa de gates (incl. pdf-lazy-entrypoints y
  pdf-runtime-boundaries con el nuevo import dinámico).
- Navegador (demo), sobre el ESCANEO MEDIF real: Sugerir corrió el OCR y
  produjo «Diagnóstico_actual» y «Acompañante_MEDA_08» posicionados en las
  secciones correctas (MEDA 03 / MEDA 08); los blancos de párrafo quedaron
  genéricos a propósito. Status «8 casilleros sugeridos (2 con nombre del
  formulario)». Sin errores nuevos de consola (persiste el warning
  preexistente de Tooltip, ya apuntado aparte).

## Limitaciones conocidas

- La calidad del nombre depende del escaneo: el umbral de confianza y el
  anti-basura prefieren `campo_N` antes que un nombre revuelto.
- tesseract baja sus assets la primera vez (CDN): la primera sugerencia con
  OCR tarda unos segundos más.
