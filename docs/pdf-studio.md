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

`assemble(doc, { onProgress })` emite fases en orden:

1. `load-fonts`: registra fontkit solo si hay texto con fuentes embebibles.
2. `validate-images`: cuenta imagenes de paginas y anotaciones.
3. `process-pages`: copia paginas PDF con `copyPages` o crea paginas desde imagen.
4. `apply-annotations`: dibuja anotaciones vectoriales sin rasterizar el PDF base.
5. `compress`: aplica ajustes globales, como numeracion y marca de agua.
6. `save`: serializa el PDF y devuelve `Blob`.

Errores recuperables de sources corruptos/cifrados se acumulan en `skipped`. Si no
queda ninguna pagina exportable, se lanza `PdfExportPipelineError`.

## Invariantes

- Posiciones y tamanos de anotaciones siempre son ratios `0..1` respecto de la
  pagina nativa.
- El preview y el PDF comparten `TEXT_LINE_HEIGHT` y `baselineDropEm`.
- El PDF base no se rasteriza: paginas PDF se copian; solo imagenes de pagina se
  embeben como imagenes.
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

| Area                 | Estado actual                                                                                                 | Evidencia                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Importacion          | PDF multipagina e imagenes como paginas o biblioteca reutilizable.                                            | `usePdfStudioImport`, `usePdfStudioWorkspace`, `PdfStudioView.test.tsx`     |
| Organizacion         | Seleccion multiple de paginas, ordenar, rotar, duplicar, extraer, borrar y portapapeles.                      | `model.ts`, `usePageSelection.ts`, `PdfStudioView.test.tsx`                 |
| Edicion de pagina    | Texto, resaltado, rectangulo, ovalo, linea, flecha e imagen estampada.                                        | `EditorToolbar.tsx`, `AnnotationLayer.tsx`, `e2e/pdf-studio-editor.spec.ts` |
| Redimensionado       | Handles para texto, resaltados, formas e imagenes; Shift conserva aspecto de imagen.                          | `AnnotationResizeHandles.tsx`, `pdfAnnotationResize.test.ts`                |
| Atajos               | Copiar, cortar, pegar, duplicar, borrar, mover con flechas, undo/redo y Escape contextual.                    | `usePdfTextEditorKeyboard.ts`, `pdfAnnotationShortcuts.test.ts`             |
| Seleccion de objetos | Seleccion simple y multiple con modificador; alinear, distribuir, bloquear, agrupar y desagrupar.             | `usePdfTextEditorSelection.ts`, `pdfAnnotationArrange.test.ts`, e2e editor  |
| Exportacion          | Copia paginas PDF sin rasterizar, embebe imagenes, dibuja anotaciones vectoriales y emite progreso por fases. | `assemble.ts`, `assemblePipeline.ts`, `assemble.test.ts`                    |
| Robustez             | Salta sources corruptos/cifrados, fallback de fuentes y error tipado si no hay paginas o falla el guardado.   | `PdfExportPipelineError`, `assemble.test.ts`                                |
| Calidad visual       | Toolbar compacta, menus delante del modal, inspector contextual, handles y snapshots visuales opt-in.         | `e2e/pdf-studio-visual.spec.ts`                                             |
| Estructura           | Ratchets de lineas para archivos criticos.                                                                    | `pdfStudioStructure.test.ts`                                                |

## Limites Conocidos

- `vendor-pdf-lib` y `pdf.worker` siguen siendo chunks grandes, aunque cargan de
  forma perezosa.
- Los snapshots visuales son opt-in y macOS-only para evitar ruido por diferencias
  de fuentes/render en Linux CI.
- Los fixtures de estres siguen siendo sinteticos o pequenos; falta una carpeta de
  PDFs reales representativos para escaneados, fuentes raras y casos de memoria.
- La seleccion multiple funciona con modificadores, pero aun no hay marquee/lazo
  para seleccionar objetos por region.
- El inspector permite posicion/tamano por inputs numericos basicos; falta un modo
  avanzado con unidades, nudging fino y presets de proporcion.
- La exportacion informa fases, pero no soporta cancelacion explicita ni perfiles
  de compresion configurables por el usuario.
