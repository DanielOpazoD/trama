# Imprenta, Planillas / PDF Studio

PDF Studio es el motor client-side compartido por dos secciones del mundo Notas:
`Imprenta` (`section=pdf`) y `Planillas` (`section=planillas`). Los PDFs,
imagenes, anotaciones y casilleros viven en memoria/IndexedDB del navegador y no
se suben al backend.

- `Imprenta` es el editor PDF general: importar, ordenar, anotar, redactar,
  OCR, formularios existentes y exportar.
- `Planillas` es el creador/ejecutor de planillas imprimibles: disenar
  casilleros especiales, guardar plantillas, rellenar una copia limpia e
  imprimir/descargar.

## Mapa de Modulos

- `docs/pdf-studio-contract.md`: contrato corto de fronteras entre modelo puro,
  comandos, rendering, workspace y export/import.
- `src/lib/pdfStudio/model/model.ts`: fachada publica compatible del modelo puro.
  Re-exporta tipos y helpers desde modulos enfocados.
- `src/lib/pdfStudio/model/modelDocument.ts`: documento, sources, importaciones
  in-memory, normalizacion, titulo/settings y pruning de sources.
- `src/lib/pdfStudio/model/modelPages.ts`: operaciones de paginas ordenadas:
  mover, borrar, rotar, duplicar y repetir bloques.
- `src/lib/pdfStudio/model/modelAnnotations.ts`: factories, clonado, traslado y
  aplicacion de anotaciones por pagina.
- `src/lib/pdfStudio/model/pageCommands.ts`: reducer puro de comandos de pagina
  usado por la UI para mantener testeable la intencion de edicion.
- `src/lib/pdfStudio/model/modelTypes.ts`: tipos canonicos del documento, paginas,
  sources, anotaciones, ajustes y biblioteca de imagenes.
- `src/lib/pdfStudio/model/modelText.ts`: mapeo de fuentes, line-height, baseline y
  layout de texto PDF.
- `src/lib/pdfStudio/model/history.ts`: historial generico undo/redo.
- `src/lib/pdfStudio/render/pdfRender.ts`: borde browser-only para miniaturas y preview
  con pdf.js.
- `src/lib/pdfStudio/assemble/assemble.ts`: orquestador del pipeline de exportacion.
- `src/lib/pdfStudio/assemble/assemblePipeline.ts`: tipos de fases, progreso y errores de
  exportacion.
- `src/lib/pdfStudio/export/heavyOperationContract.ts`: contrato comun para operaciones
  pesadas (`pdf-export`, `pdf-ocr`, `pdf-form`, `pdf-redaction`), con mensajes de
  progreso, cancelacion y errores serializables entre UI y Worker.
- `src/lib/pdfStudio/export/heavyOperationClient.ts`: cliente generico para ejecutar una
  operacion pesada en un Worker dedicado, con fallback al hilo principal.
- `src/lib/pdfStudio/export/exportWorkerClient.ts` y `pdfExport.worker.ts`: borde de
  exportacion en segundo plano; reusa `assemble` y conserva el mismo contrato de
  progreso/cancelacion que la UI ya consume.
- `src/lib/pdfStudio/forms/pdfForms.ts`: inspeccion y rellenado basico de AcroForms
  existentes con `pdf-lib`; extrae geometria de widgets, soporta mantener campos
  editables o aplanarlos, y escribe campos nuevos creados desde el canvas.
- `src/lib/pdfStudio/model/modelForms.ts`: modelo puro de campos visuales creados en
  Imprenta, separados de las anotaciones porque exportan como AcroForms reales.
- `src/lib/pdfStudio/forms/pdfFormWorkerClient.ts` y `pdfForm.worker.ts`: borde Worker
  para inspeccionar/rellenar formularios con el contrato de operaciones pesadas.
- `src/components/notas/pdfStudio/planillas/PdfStudioFormPanel.tsx`: panel compacto para
  editar valores detectados y aplicar el PDF resultante al documento.
- `src/components/notas/pdfStudio/planillas/FormFieldLayer.tsx`: overlays editables de
  formularios sobre el canvas de pagina.
- `src/components/notas/pdfStudio/planillas/SignatureCaptureDialog.tsx`: firma simple con
  trazo dibujado o imagen cargada.
- `src/components/notas/pdfStudio/editor/PdfTextEditorPageSurface.tsx`: superficie de
  pagina dentro del visor continuo de edicion; renderiza fondo, anotaciones y
  campos por pagina.
- `src/lib/pdfStudio/ocr/pdfOcr.ts`: fachada publica del OCR buscable; orquesta
  renderizado, reconocimiento, ensamblado y sidecar `.txt`.
- `src/lib/pdfStudio/ocr/pdfOcrInput.ts`: convierte PDF/imagen a paginas raster para
  OCR, con pdf.js y canvas sin bloquear el flujo principal.
- `src/lib/pdfStudio/ocr/pdfOcrRecognition.ts`: borde Tesseract.js para reconocer
  texto por pagina, idioma y cajas de lineas.
- `src/lib/pdfStudio/ocr/pdfOcrSearchablePdf.ts`: copia el PDF visual y agrega capa de
  texto invisible; tambien arma el sidecar de texto.
- `src/lib/pdfStudio/ocr/pdfOcrLimits.ts`: heuristica client-side para advertir o
  bloquear documentos que exceden el rango razonable de OCR local.
- `src/lib/pdfStudio/ocr/pdfOcrWorkerClient.ts`, `pdfOcr.worker.ts` y
  `pdfOcrBackendAdapter.ts`: contrato Worker actual y adaptador explicito para
  una ruta backend/OCRmyPDF futura.
- `src/components/notas/pdfStudio/ocr/PdfStudioOcrPanel.tsx`: panel compacto con
  selector de idioma, progreso, cancelacion y disparo de descargas.
- `src/lib/pdfStudio/assemble/assembleImages.ts`: lectura/compresion/embedding de imagenes.
- `src/lib/pdfStudio/assemble/assembleAnnotations.ts`: dibujo vectorial de texto,
  resaltados, formas e imagenes estampadas.
- `src/components/notas/pdfStudio/PdfStudioView.tsx`: composicion de la vista de
  documento con modos `editor` y `templates`.
- `PdfTextEditor.tsx`: composicion del modal de edicion con paginas consecutivas
  navegables por scroll; una pagina activa conserva la geometria de edicion.
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

La experiencia actual trabaja sobre AcroForms existentes y campos nuevos creados
en Imprenta:

1. `inspectPdfFormInWorker(file)` detecta campos de texto, checkbox, radio,
   dropdown y option-list sin bloquear la UI, incluyendo widgets y geometria por
   pagina.
2. `fillPdfFormInWorker(file, values, { flatten })` rellena valores simples.
3. `writePdfFormFieldsInWorker(file, fields, pageIds, { flatten })` escribe
   campos creados desde cero sobre el PDF ensamblado.
4. `flatten: false` mantiene el PDF editable; `flatten: true` quema los valores
   como contenido de pagina.

La UI expone deteccion desde el menu del documento y desde el menu compacto
`Campos` del editor. Los campos con ubicacion se editan sobre la pagina; el panel
compacto conserva acciones de aplicar/aplanar/limpiar y muestra lista editable
solo para campos sin ubicacion visual. Al aplicar, `fillPdfFormInWorker` crea un
PDF nuevo y
`replacePdfSourceFile` reemplaza el source original preservando paginas,
anotaciones e historial. El modo editable conserva campos AcroForm; el modo
aplanado quema los valores en la pagina.

Los campos creados desde cero viven en `PdfDoc.formFields`, anclados por `pageId`
para sobrevivir reordenamiento de paginas. Al exportar, `usePdfStudioExport`
primero ensambla el PDF visual y luego escribe esos campos como AcroForms reales.
La firma simple no es una firma digital criptografica: es un trazo o imagen
ubicada dentro de un campo de firma de oficina.

### Planillas imprimibles

Una planilla es una creacion guardada cuyo `PdfDoc` contiene `formFields`. Vive
en la seccion `Planillas`, separada de `Imprenta` para no mezclar edicion PDF
general con ejecucion operativa de planillas. El panel lateral de Planillas
separa estas planillas de los guardados generales y ofrece dos flujos distintos:

1. `Editar casilleros` sirve para crear o modificar la estructura:
   importar PDF/imagen base, colocar casilleros especiales sobre celdas vacias,
   moverlos, redimensionarlos, renombrar variables y guardar la planilla.
2. `Guardar planilla` guarda una copia con valores limpios. Conserva paginas,
   posiciones, nombres de variables, required/readOnly y opciones, pero borra
   datos ingresados para que la planilla no quede contaminada por un llenado.
3. `Rellenar` abre una copia limpia en `Rellenar planilla`: el usuario completa
   los casilleros especiales sobre la pagina y luego imprime/descarga. Este modo
   esta pensado para uso operativo de oficina, no para redisenar la estructura.

Los nombres de casillero son las variables de oficina: por ejemplo `paciente`,
`fecha_control`, `diagnostico`. Se editan desde el inspector contextual de
casillero. En la barra principal queda visible `Agregar cuadro de texto`; el menu
`Campos` queda reservado para el modulo Planillas: crear campos de texto y firma
simple sobre celdas vacias de PDFs base o escaneos sin llenar la barra de
controles raros. En Imprenta, `Campos` queda oculto en el editor de pagina para
que la herramienta sea solo editor PDF.

El banner superior distingue ambos flujos: `Rellenar planilla` muestra acciones
de imprimir y volver a editar estructura; `Editar casilleros` habla de ubicar los
casilleros que luego se llenaran. En el panel lateral, cada planilla muestra dos
botones explicitos: `Rellenar` para imprimir una copia limpia y `Editar` para
cambiar su estructura.

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
2. Agregar factory/clonado/traslado en `modelAnnotations.ts` y re-exportar desde
   `model.ts` si la UI existente lo necesita.
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
npm run e2e:pdf-visual
```

Cadencia: `.github/workflows/pdf-visual.yml` corre semanalmente en `macos-latest`
y tambien queda disponible con `workflow_dispatch` antes de PRs grandes de
Imprenta.

## Matriz de Capacidades

| Area                 | Estado actual                                                                                                                        | Evidencia                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Importacion          | PDF multipagina e imagenes como paginas o biblioteca reutilizable.                                                                   | `usePdfStudioImport`, `usePdfStudioWorkspace`, `PdfStudioView.test.tsx`                       |
| Organizacion         | Seleccion multiple de paginas, ordenar, rotar, duplicar, extraer, borrar y portapapeles.                                             | `model.ts`, `usePageSelection.ts`, `PdfStudioView.test.tsx`                                   |
| Edicion de pagina    | Texto, resaltado, redaccion real, rectangulo, ovalo, linea, flecha e imagen estampada.                                               | `EditorToolbar.tsx`, `AnnotationLayer.tsx`, `e2e/pdf-studio-editor.spec.ts`                   |
| Formularios          | Overlays visuales para AcroForms existentes y export editable/aplanable en Worker.                                                   | `pdfForms.ts`, `PdfStudioFormPanel.tsx`, `pdfFormWorkerClient.ts`                             |
| Planillas            | Modulo separado para disenar casilleros, guardar plantillas y rellenar/imprimir una copia limpia.                                    | `WorkspacePanel.tsx`, `usePdfStudioTemplateMode.tsx`, `PdfTemplateModeBanner.tsx`             |
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
  de fuentes/render en Linux CI; la cadencia automatica vive en el workflow
  `pdf-visual`.
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
- Formularios soporta firma simple dibujada/imagen, no firma digital con
  certificado. Dropdown/option-list se inspeccionan y rellenan, pero la creacion
  visual premium se centra en texto, fecha, checkbox, radio y firma.
- El OCR client-side descarga datos/worker de Tesseract.js y consume CPU/memoria
  local. La UI advierte desde 15 paginas o 30 MB, y bloquea desde 45 paginas o
  90 MB hasta conectar la ruta backend/OCRmyPDF ya preparada por adaptador.
- La capa de texto invisible se alinea con cajas de lineas OCR, no con geometria
  tipografica perfecta. Es suficiente para busqueda/seleccion general, pero no
  reemplaza un OCR profesional con deskew/layout avanzado.
