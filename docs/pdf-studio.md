# Imprenta / PDF Studio

Imprenta es el editor PDF del mundo Notas. Es 100% client-side: los PDFs,
imagenes y anotaciones viven en memoria/IndexedDB del navegador y no se suben al
backend.

## Mapa de Modulos

- `src/lib/pdfStudio/model.ts`: fachada publica del modelo puro. Re-exporta tipos
  y helpers tipograficos, y conserva operaciones de documento/paginas/anotaciones.
- `src/lib/pdfStudio/modelTypes.ts`: tipos canonicos del documento, paginas,
  sources, anotaciones, ajustes y biblioteca de imagenes.
- `src/lib/pdfStudio/modelText.ts`: mapeo de fuentes, line-height, baseline y
  layout de texto PDF.
- `src/lib/pdfStudio/history.ts`: historial generico undo/redo.
- `src/lib/pdfStudio/pdfRender.ts`: borde browser-only para miniaturas y preview
  con pdf.js.
- `src/lib/pdfStudio/assemble.ts`: orquestador del pipeline de exportacion.
- `src/lib/pdfStudio/assemblePipeline.ts`: tipos de fases, progreso y errores de
  exportacion.
- `src/lib/pdfStudio/heavyOperationContract.ts`: contrato comun para operaciones
  pesadas (`pdf-export`, `pdf-ocr`, `pdf-form`, `pdf-redaction`), con mensajes de
  progreso, cancelacion y errores serializables entre UI y Worker.
- `src/lib/pdfStudio/heavyOperationClient.ts`: cliente generico para ejecutar una
  operacion pesada en un Worker dedicado, con fallback al hilo principal.
- `src/lib/pdfStudio/exportWorkerClient.ts` y `pdfExport.worker.ts`: borde de
  exportacion en segundo plano; reusa `assemble` y conserva el mismo contrato de
  progreso/cancelacion que la UI ya consume.
- `src/lib/pdfStudio/pdfForms.ts`: inspeccion y rellenado basico de AcroForms
  existentes con `pdf-lib`; soporta mantener campos editables o aplanarlos.
- `src/lib/pdfStudio/pdfFormWorkerClient.ts` y `pdfForm.worker.ts`: borde Worker
  para inspeccionar/rellenar formularios con el contrato de operaciones pesadas.
- `src/components/notas/pdfStudio/PdfStudioFormPanel.tsx`: panel compacto para
  editar valores detectados y aplicar el PDF resultante al documento.
- `src/lib/pdfStudio/pdfOcr.ts`: fachada publica del OCR buscable; orquesta
  renderizado, reconocimiento, ensamblado y sidecar `.txt`.
- `src/lib/pdfStudio/pdfOcrInput.ts`: convierte PDF/imagen a paginas raster para
  OCR, con pdf.js y canvas sin bloquear el flujo principal.
- `src/lib/pdfStudio/pdfOcrRecognition.ts`: borde Tesseract.js para reconocer
  texto por pagina, idioma y cajas de lineas.
- `src/lib/pdfStudio/pdfOcrSearchablePdf.ts`: copia el PDF visual y agrega capa de
  texto invisible; tambien arma el sidecar de texto.
- `src/lib/pdfStudio/pdfOcrLimits.ts`: heuristica client-side para advertir o
  bloquear documentos que exceden el rango razonable de OCR local.
- `src/lib/pdfStudio/pdfOcrWorkerClient.ts`, `pdfOcr.worker.ts` y
  `pdfOcrBackendAdapter.ts`: contrato Worker actual y adaptador explicito para
  una ruta backend/OCRmyPDF futura.
- `src/components/notas/pdfStudio/PdfStudioOcrPanel.tsx`: panel compacto con
  selector de idioma, progreso, cancelacion y disparo de descargas.
- `src/lib/pdfStudio/assembleImages.ts`: lectura/compresion/embedding de imagenes.
- `src/lib/pdfStudio/assembleAnnotations.ts`: dibujo vectorial de texto,
  resaltados, formas e imagenes estampadas.
- `src/components/notas/pdfStudio/PdfStudioView.tsx`: composicion de la vista de
  documento.
- `PdfTextEditor.tsx`: composicion del modal de edicion de una pagina.
- `EditorToolbar.tsx`, `SelectionInspector.tsx`, `AnnotationLayer.tsx`: controles
  de edicion, inspector contextual y capa visual de anotaciones.

## Flujo de Importacion

1. `usePdfStudioImport` recibe archivos desde input o drop.
2. PDFs se expanden a paginas con `getPdfPageCount` y `addPdfSource`.
3. Imagenes se agregan como pagina con `addImageSource` y ademas como asset de
   biblioteca reutilizable.
4. El documento entra al historial con `commit`.
5. `usePdfStudioWorkspace` persiste borrador, biblioteca y creaciones guardadas en
   IndexedDB.

## Flujo de Exportacion

`assemblePdfInWorker(doc, { onProgress, signal })` es el borde publico de
exportacion. Intenta ejecutar `assemble` en `pdfExport.worker.ts`; si el navegador
no puede crear Workers, cae al ensamblado local para preservar compatibilidad.

`assemble(doc, { onProgress })` sigue siendo el pipeline puro de exportacion y
emite fases en orden:

1. `load-fonts`: registra fontkit solo si hay texto con fuentes embebibles.
2. `validate-images`: cuenta imagenes de paginas y anotaciones.
3. `process-pages`: copia paginas PDF con `copyPages` o crea paginas desde imagen.
4. `apply-annotations`: dibuja anotaciones vectoriales; si la pagina tiene
   redacciones, primero rasteriza la pagina completa y quema los bloques de
   redaccion para no conservar el contenido subyacente.
5. `compress`: aplica ajustes globales, como numeracion y marca de agua.
6. `save`: serializa el PDF y devuelve `Blob`.

Errores recuperables de sources corruptos/cifrados se acumulan en `skipped`. Si no
queda ninguna pagina exportable, se lanza `PdfExportPipelineError`.

## Formularios

La primera version trabaja sobre AcroForms existentes:

1. `inspectPdfFormInWorker(file)` detecta campos de texto, checkbox, radio,
   dropdown y option-list sin bloquear la UI.
2. `fillPdfFormInWorker(file, values, { flatten })` rellena valores simples.
3. `flatten: false` mantiene el PDF editable; `flatten: true` quema los valores
   como contenido de pagina.

La UI expone deteccion desde el menu del documento y luego un panel compacto para
editar valores. Al aplicar, `fillPdfFormInWorker` crea un PDF nuevo y
`replacePdfSourceFile` reemplaza el source original preservando paginas,
anotaciones e historial. El modo editable conserva campos AcroForm; el modo
aplanado quema los valores en la pagina.

La edicion visual campo-a-campo sobre el canvas, firmas dibujadas y la creacion de
formularios desde cero son el siguiente bloque funcional.

## OCR y PDF Buscable

La primera version es client-side y apunta a documentos pequenos/medianos. El
panel se abre desde el menu de documento con tres idiomas: espanol, ingles y
espanol+ingles.

El flujo mantiene una frontera clara con exportacion:

1. `usePdfStudioOcr` primero llama `assemblePdfInWorker(doc)` para convertir el
   estado actual del editor en un PDF fuente. Esto preserva paginas, anotaciones,
   formularios aplicados y redacciones ya quemadas.
2. `createSearchablePdfInWorker(file, { language, signal, onProgress })` ejecuta
   la operacion `pdf-ocr` en Worker dedicado con cancelacion por `AbortSignal`.
3. `pdfOcrInput` renderiza paginas con pdf.js/canvas. Imagenes sueltas tambien se
   aceptan como entrada OCR.
4. `pdfOcrRecognition` usa Tesseract.js y extrae texto, confianza y cajas de
   linea por pagina.
5. `pdfOcrSearchablePdf` copia el PDF visual y agrega texto invisible con
   `pdf-lib`; ademas genera `trama-ocr.txt` como sidecar.
6. La UI descarga `trama-ocr.pdf` y `trama-ocr.txt`, muestra progreso y permite
   cancelar sin dejar estado intermedio.

Antes de ejecutar, `assessPdfOcrDocument` calcula limites client-side:

- desde 15 paginas o 30 MB de sources: muestra advertencia, pero permite correr.
- desde 45 paginas o 90 MB de sources: bloquea OCR local y deriva el caso a la
  ruta backend/OCRmyPDF futura.

`pdfOcrBackendAdapter.ts` deja preparado el contrato para una ruta futura
backend/OCRmyPDF en documentos grandes o de alta calidad. Esa ruta aun no esta
conectada; el placeholder falla con `OCR_BACKEND_UNAVAILABLE` para evitar
fallbacks ambiguos.

## Redaccion

La redaccion es un tipo de anotacion propio (`kind: 'redaction'`), distinto de un
rectangulo negro. Se dibuja desde la barra del editor con la herramienta de escudo
y tiene handles de redimensionado.

En exportacion, cualquier pagina con redacciones entra por
`addRedactedRasterPage`: se renderiza la pagina completa a bitmap, se queman las
zonas redactadas dentro de ese bitmap y se embebe la pagina resultante como una
imagen nueva. Esto elimina texto/vector/imagen subyacente de las paginas
redactadas. Las paginas sin redaccion conservan el camino normal de copia PDF sin
rasterizar.

## Invariantes

- Posiciones y tamanos de anotaciones siempre son ratios `0..1` respecto de la
  pagina nativa.
- El preview y el PDF comparten `TEXT_LINE_HEIGHT` y `baselineDropEm`.
- El PDF base no se rasteriza salvo en paginas con redaccion real: esas paginas
  se rasterizan completas para eliminar contenido subyacente.
- Los ids son opacos. Tras restaurar borradores, `reseedIds` evita colisiones.
- Objetos `locked` no deben moverse, redimensionarse, borrarse ni cambiar estilo.

## Agregar una Anotacion Nueva

1. Agregar tipo discriminado en `modelTypes.ts`.
2. Agregar factory/clonado/traslado en `model.ts`.
3. Agregar geometria en `pdfAnnotationArrange.ts` y resize si aplica.
4. Pintar preview en `AnnotationLayer.tsx` o un subcomponente.
5. Exportar en `assembleAnnotations.ts`.
6. Cubrir modelo, layer, export y e2e si es interactiva.

## Validacion

Comandos minimos antes de PR:

```bash
npm test
npm run typecheck
npm run build
npm run lint
npm run format:check
npm run e2e -- e2e/pdf-studio-editor.spec.ts --project=chromium
```

Tambien revisar line-count ratchets en
`src/components/notas/pdfStudio/pdfStudioStructure.test.ts`.

Snapshots visuales opt-in para macOS:

```bash
PDF_STUDIO_VISUAL=1 npm run e2e -- e2e/pdf-studio-visual.spec.ts --project=chromium
```

## Matriz de Capacidades

| Area                 | Estado actual                                                                                                                        | Evidencia                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Importacion          | PDF multipagina e imagenes como paginas o biblioteca reutilizable.                                                                   | `usePdfStudioImport`, `usePdfStudioWorkspace`, `PdfStudioView.test.tsx`                       |
| Organizacion         | Seleccion multiple de paginas, ordenar, rotar, duplicar, extraer, borrar y portapapeles.                                             | `model.ts`, `usePageSelection.ts`, `PdfStudioView.test.tsx`                                   |
| Edicion de pagina    | Texto, resaltado, redaccion real, rectangulo, ovalo, linea, flecha e imagen estampada.                                               | `EditorToolbar.tsx`, `AnnotationLayer.tsx`, `e2e/pdf-studio-editor.spec.ts`                   |
| Formularios          | Inspeccion y rellenado basico de AcroForms existentes en Worker; aplicacion editable o aplanada sobre el source PDF.                 | `pdfForms.ts`, `pdfForm.worker.ts`, `PdfStudioFormPanel.tsx`, `PdfStudioView.test.tsx`        |
| OCR buscable         | PDF escaneado a PDF con texto seleccionable/buscable, Worker, progreso, cancelacion, selector de idioma, limites y sidecar `.txt`.   | `pdfOcr.ts`, `pdfOcr.worker.ts`, `pdfOcrLimits.ts`, `PdfStudioView.test.tsx`                  |
| Redimensionado       | Handles para texto, resaltados, redacciones, formas e imagenes; Shift conserva aspecto de imagen.                                    | `AnnotationResizeHandles.tsx`, `pdfAnnotationResize.test.ts`, `AnnotationLayer.test.tsx`      |
| Atajos               | Copiar, cortar, pegar, duplicar, borrar, mover con flechas, undo/redo y Escape contextual.                                           | `usePdfTextEditorKeyboard.ts`, `pdfAnnotationShortcuts.test.ts`                               |
| Seleccion de objetos | Seleccion simple, multiple con modificador, marquee y lazo; alinear, distribuir, bloquear, capas y grupos.                           | `usePdfTextEditorSelection.ts`, `pdfAnnotationArrange.test.ts`, e2e editor                    |
| Exportacion          | Copia paginas PDF sin rasterizar salvo paginas redactadas, que se queman por rasterizacion segura; corre en Web Worker con progreso. | `exportWorkerClient.ts`, `pdfExport.worker.ts`, `assemble.ts`, `heavyOperationClient.test.ts` |
| Robustez             | Salta sources corruptos/cifrados, warnings tempranos, fallback de fuentes, error tipado y errores explicitos de rasterizacion.       | `PdfExportPipelineError`, `assemble.test.ts`                                                  |
| Calidad visual       | Toolbar compacta, menus delante del modal, inspector contextual, handles y snapshots visuales opt-in.                                | `e2e/pdf-studio-visual.spec.ts`                                                               |
| Estructura           | Ratchets de lineas para archivos criticos.                                                                                           | `pdfStudioStructure.test.ts`                                                                  |

## Limites Conocidos

- `vendor-pdf-lib`, `pdf.worker` y `pdfExport.worker` siguen siendo chunks grandes,
  aunque cargan de forma perezosa y ya no bloquean la UI durante la exportacion
  normal.
- Los snapshots visuales son opt-in y macOS-only para evitar ruido por diferencias
  de fuentes/render en Linux CI.
- Los fixtures reales cubren multipagina, rotado, escaneado, corrupto, fuente no
  usual y una exportacion de estres pequena medida; falta una carpeta curada de PDFs
  grandes de usuario para pruebas de memoria extrema.
- El lazo libre existe con modificador de teclado; aun no tiene affordance visual
  dedicada en la barra ni seleccion por rango semantico de objetos.
- El inspector permite posicion/tamano por inputs numericos basicos; falta un modo
  avanzado con unidades, nudging fino y presets de proporcion.
- La exportacion recomprime imagenes grandes segun perfil, pero aun no estima
  memoria precisa por pagina ni muestra prediccion de peso final antes de guardar.
- La redaccion real rasteriza la pagina completa. Es segura para remover contenido
  subyacente, pero convierte esa pagina en imagen y pierde texto/vector
  seleccionable en esa pagina.
- Formularios aun no tiene overlays editables por campo dentro del canvas, firmas
  dibujadas ni creacion de campos desde cero.
- El OCR client-side descarga datos/worker de Tesseract.js y consume CPU/memoria
  local. La UI advierte desde 15 paginas o 30 MB, y bloquea desde 45 paginas o
  90 MB hasta conectar la ruta backend/OCRmyPDF ya preparada por adaptador.
- La capa de texto invisible se alinea con cajas de lineas OCR, no con geometria
  tipografica perfecta. Es suficiente para busqueda/seleccion general, pero no
  reemplaza un OCR profesional con deskew/layout avanzado.
