# Consolidación estructural de PDF Studio

> Estado: **completado** (rama `refactor/pdf-studio-consolidacion`).
> Objetivo: reflejar en el árbol de carpetas la estructura que ya gobierna el código,
> sin cambiar comportamiento. La prueba de éxito es objetiva: `typecheck + test + lint + build`
> verdes y la app rinde igual en preview.
>
> **Resultado:** 211 archivos reorganizados en 4 fases (lib + 3 de componentes), ~530
> imports recalculados, 0 cambios de lógica. La raíz de `components/notas/pdfStudio/` queda
> solo con `PdfStudioView` + sus tests. Cada fase es un commit con typecheck + tests (2340) +
> lint verdes; las fases con workers/assets pasan además `build`. El codemod se eliminó al cerrar.

## Por qué

PDF Studio son ~221 archivos / ~26k líneas (casi 28% de `src`), hoy **planos** en dos
carpetas (`src/lib/pdfStudio/` y `src/components/notas/pdfStudio/`), sin subcarpetas ni
barriles, con 169 imports profundos `../../../lib/pdfStudio/...`. El nombre de cada archivo
es la única taxonomía. La lógica, en cambio, ya distingue tres superficies claras.

## Las tres superficies (ancladas al código)

| Superficie                   | Activación                                                  | Qué hace                                                  |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| **Editor PDF**               | `studioMode='editor'` (`NotasWorld.tsx`)                    | Anotar, redactar, editar texto, OCR, reordenar páginas    |
| **Planillas · crear/editar** | `studioMode='templates'` + `effectiveTemplateMode='design'` | Diseñar la plantilla: colocar campos                      |
| **Planillas · llenar**       | `studioMode='templates'` + `effectiveTemplateMode='fill'`   | Completar campos, importar valores, firmar, guardar copia |

Más infraestructura compartida: modelo de documento, pipeline de ensamblado/export,
workspace (biblioteca + guardados), grilla de páginas, historial undo/redo.

## Estructura objetivo

```
src/components/notas/pdfStudio/
  PdfStudioView.tsx          orquestador (raíz)
  shell/                     chrome del documento (toolbar, main pane, page actions, import/export, dropzone)
  workspace/                 biblioteca + guardados
  pages/                     grilla y miniaturas
  ocr/                       panel + hook OCR
  editor/                    EDITOR PDF: PdfTextEditor*, Annotation*, EditorToolbar*, Selection*, pdfAnnotation*, pdfEditor*
  planillas/                 campos de formulario comunes (FormField*, pdfFormField*, firma)
    design/                  crear/editar: PdfTemplateDesignHeader, WorkflowGuide, ModeBanner, useTemplateMode
    fill/                    llenar: PdfTemplateFill*, pdfTemplateFill*, usePdfTextEditorFill*, FilledTemplateActions

src/lib/pdfStudio/
  model/      model, modelForms, modelText, modelTypes, modelIds, commands, history, editorGeometry
  assemble/   assemble(+Annotations/Redactions/Images), assemblePipeline, assembleWarnings
  forms/      pdfForms, formFieldSuggestions, formFieldConstants, pdfForm.worker(+client/contract)
  ocr/        los 12 pdfOcr*
  export/     pdfExport.worker(+client/contract), printPdf, heavyOperation*
  render/     pdfRender, persistence
  fonts/      (sin cambios)
```

## Decisiones de seguridad

- **Worker + client + contract viven juntos.** Cada worker se instancia con
  `new Worker(new URL('./x.worker.ts', import.meta.url))` (Vite resuelve en build, no `tsc`).
  Al mantenerlos en la misma subcarpeta (`forms/`, `export/`, `ocr/`) ese path no cambia →
  cero riesgo en runtime. Estos specifiers **no se tocan**.
- **No se fusionan microarchivos** en este refactor (los `*WorkerContract.ts` de 11–14 líneas
  son la frontera del worker; fundirlos arrastraría código del hilo principal al chunk del worker).
  Fusiones selectivas + barriles quedan como fase opcional posterior.
- **Tests colocados se mueven con su sujeto** a la misma subcarpeta.
- **Encapsulamiento:** no hay imports de archivos de PDF Studio desde fuera del módulo
  (solo `NotasWorld` hace `lazy(() => import('./pdfStudio/PdfStudioView'))`, que se queda en la raíz).
  Toda la reescritura de imports es interna.

## Ejecución por fases (verde y commit entre cada una)

Compuerta por fase: `npm run typecheck && npm test && npm run lint`. La fase de `lib`
añade además `npm run build` (workers + assets de fuentes). Cada fase es un commit.

1. **lib/** → 6 subcarpetas (hoja del grafo; reescribe los 169 imports a lib).
2. **components compartidos** (`shell`, `workspace`, `pages`, `ocr`).
3. **components `editor/`**.
4. **components `planillas/`** (+`design/` + `fill/`).

## Herramienta

`scripts/_refactor/pdf-consolidate.mjs`: codemod consciente de resolución de módulos.
Clasifica cada archivo por su nombre, recalcula cada import relativo (preservando sufijos
`?url`, resolviendo `index`, omitiendo extensión `.ts/.tsx`) y hace `git mv`. Idempotente:
correrlo dos veces no cambia nada. Se elimina al terminar el refactor.
