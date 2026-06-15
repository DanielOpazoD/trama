# PDF Studio: contrato de modulo

PDF Studio es un subsistema client-side. Su contrato se organiza por fronteras
estables para que Imprenta y Planillas puedan crecer sin mezclar estado React,
DOM, Workers y modelo puro.

## Fronteras

| Frontera      | Responsabilidad                                                                  | Puede depender de                         | No debe depender de                                       |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Modelo puro   | `PdfDoc`, pages, sources, anotaciones, campos, historial y helpers de texto.     | Tipos TS y funciones puras.               | React, DOM, pdf.js, pdf-lib, IndexedDB, Workers.          |
| Comandos      | Reducers/operaciones testeables que traducen intencion UI a cambios de `PdfDoc`. | Modelo puro.                              | Componentes, cache de thumbnails, efectos de red/archivo. |
| Rendering     | Miniaturas, backgrounds de pagina, medicion de canvas y pdf.js.                  | Modelo y browser APIs.                    | Mutar `PdfDoc` o escribir workspace.                      |
| Workspace     | Borrador local, biblioteca, guardados y sanitizacion de persistencia.            | API local/IndexedDB y modelo normalizado. | Geometria de editor o export pipeline.                    |
| Export/import | Lectura de archivos, ensamblado, Workers, formularios reales y OCR.              | Modelo, pdf-lib/pdf.js, Workers.          | Estado React interno de vistas.                           |

## Reglas de importacion

- `src/lib/pdfStudio/model/model.ts` es fachada compatible. Codigo nuevo puede
  importar directo desde `modelDocument`, `modelPages`, `modelAnnotations`,
  `modelForms`, `history` o `pageCommands` cuando quiera una frontera precisa.
- Los componentes pueden orquestar efectos, pero las transformaciones de
  documento deben vivir en modelo/comandos y tener tests unitarios.
- El hook de navegacion del editor mantiene la fuente de verdad logica; los
  helpers de apertura/geometry son el contrato testeado para la relacion entre
  pagina solicitada, pagina visible, zoom y layout.

## Contrato de navegacion del editor

Al abrir una miniatura o saltar de pagina, la pagina solicitada manda hasta que
la geometria relevante queda estable o el usuario gesticula manualmente. Durante
esa transicion, la pagina visible inferida por scroll no puede sobrescribir
`currentPage`. En modo libre, el scroll vuelve a sincronizar la pagina visible y
las inflaciones tardias sobre el viewport compensan `scrollTop`.

La evidencia minima para tocar esta zona es:

- unit tests de `pdfEditorOpeningGeometry`.
- tests del hook `usePdfTextEditorPageNavigation`.
- smoke e2e de PDF Studio al abrir, navegar, editar y exportar cuando el cambio
  afecte UI/rendering.

## Compatibilidad

La API historica desde `model.ts` se mantiene para no forzar migraciones masivas.
PRs de refactor pueden mover implementacion a modulos enfocados, pero deben
preservar exports de fachada o migrar consumidores de forma explicita y testeada.
